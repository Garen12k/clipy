import AVFoundation
import CoreText
import ExpoModulesCore
import QuartzCore
import UIKit

struct ExportClip: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1
  @Field var muted: Bool = false
}

struct ExportOverlay: Record {
  @Field var text: String = ""
  @Field var fontPostScriptName: String = "Helvetica"
  @Field var fontScale: Double = 0.07
  @Field var color: String = "#FFFFFF"
  @Field var backgroundColor: String?          // JS `null` → nil (no background box)
  @Field var backgroundOpacity: Double = 0
  @Field var outline: Bool = true
  @Field var align: String = "center"
  @Field var x: Double = 0.5
  @Field var y: Double = 0.5
  @Field var scale: Double = 1
  @Field var rotation: Double = 0
  @Field var start: Double = 0
  @Field var end: Double = 0
}

struct ExportAudio: Record {
  @Field var sourceUri: String = ""
  @Field var start: Double = 0
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1
}

struct ExportRequest: Record {
  @Field var clips: [ExportClip] = []
  @Field var overlays: [ExportOverlay] = []
  @Field var audio: ExportAudio?               // JS `null` → nil (no music)
  @Field var aspectRatio: String = "9:16"
  @Field var resolution: Int = 1080
  @Field var outputPath: String = ""
}

enum ExportError: Error, LocalizedError {
  case noVideoTrack(String), badOutputPath, sessionFailed(String)
  var errorDescription: String? {
    switch self {
    case .noVideoTrack(let uri): return "No video track in \(uri)"
    case .badOutputPath: return "Invalid output path"
    case .sessionFailed(let m): return m
    }
  }
}

extension UIColor {
  /// `#RRGGBB` (leading `#` optional; digits after the first six are ignored, like `contrastFor`). Invalid input → white.
  convenience init(hex: String) {
    let digits = String(hex.trimmingCharacters(in: .whitespaces).drop(while: { $0 == "#" }).prefix(6))
    let n: UInt32 = digits.count == 6 ? (UInt32(digits, radix: 16) ?? 0xFFFFFF) : 0xFFFFFF
    self.init(red: CGFloat((n >> 16) & 0xFF) / 255, green: CGFloat((n >> 8) & 0xFF) / 255, blue: CGFloat(n & 0xFF) / 255, alpha: 1)
  }
}

/// Mirror of `contrastFor` in src/editor/components/OverlayText.tsx: black outline for light text, white for dark.
func contrastFor(hex: String) -> String {
  let digits = String(hex.replacingOccurrences(of: "#", with: "").prefix(6))
  let n = UInt32(digits, radix: 16) ?? 0          // TS: parseInt → NaN → channels 0 → "#FFFFFF"
  let r = Double((n >> 16) & 255), g = Double((n >> 8) & 255), b = Double(n & 255)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000000" : "#FFFFFF"
}

/// One export job. Builds an AVMutableComposition from trimmed clips, aspect-fills each into the render size, and writes an .mp4.
/// Phase 2: per-clip volume/mute and an optional music track (audio mix, 1 s fade-out at the end), plus text overlays
/// rendered with Core Animation (`AVVideoCompositionCoreAnimationTool`).
/// Events go through `onEvent`: `progress` (repeating), then exactly one of `done` / `cancelled` / `error`.
/// Errors thrown from `start` are NOT emitted here — the caller (the module) turns them into an `error` event.
final class ExportSession {
  let id = UUID().uuidString
  private let lock = NSLock()
  private var session: AVAssetExportSession?   // guarded by `lock`
  private var isCancelled = false              // guarded by `lock`
  private var timer: Timer?                    // main thread only
  private let onEvent: ([String: Any]) -> Void

  init(onEvent: @escaping ([String: Any]) -> Void) { self.onEvent = onEvent }

  /// Accepts a `file://` URI or an absolute path; anything else is rejected.
  static func fileURL(from path: String) -> URL? {
    if path.hasPrefix("file://") { return URL(string: path).flatMap { $0.isFileURL ? $0 : nil } }
    if path.hasPrefix("/") { return URL(fileURLWithPath: path) }
    return nil
  }

  /// Best-effort removal of a (partial) output file.
  static func removeFile(atPath path: String) {
    guard let url = fileURL(from: path) else { return }
    try? FileManager.default.removeItem(at: url)
  }

  static func renderSize(aspect: String, resolution: Int) -> CGSize {
    let short = CGFloat(resolution)                       // 720 / 1080 / 2160 is the short edge
    let long: CGFloat = aspect == "16:9" || aspect == "9:16" ? short * 16 / 9 : short
    switch aspect {
    case "9:16": return CGSize(width: short, height: long)
    case "16:9": return CGSize(width: long, height: short)
    default:     return CGSize(width: short, height: short)
    }
  }

  static func fillTransform(preferredTransform t: CGAffineTransform, naturalSize: CGSize, renderSize: CGSize) -> CGAffineTransform {
    let natural = naturalSize.applying(t)
    let w = abs(natural.width), h = abs(natural.height)
    let scale = max(renderSize.width / w, renderSize.height / h)
    // Normalise rotated sources so their origin is at (0,0) after preferredTransform.
    let bounds = CGRect(origin: .zero, size: naturalSize).applying(t)
    let normalise = CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY)
    let tx = (renderSize.width - w * scale) / 2
    let ty = (renderSize.height - h * scale) / 2
    return t.concatenating(normalise).concatenating(CGAffineTransform(scaleX: scale, y: scale)).concatenating(CGAffineTransform(translationX: tx, y: ty))
  }

  /// CoreText paragraph style (alignment + fixed line height) for the CATextLayer, which draws with CoreText.
  static func ctParagraphStyle(alignment: CTTextAlignment, lineHeight: CGFloat) -> CTParagraphStyle {
    let align = alignment
    let height = lineHeight
    return withUnsafePointer(to: align) { (alignPtr: UnsafePointer<CTTextAlignment>) -> CTParagraphStyle in
      withUnsafePointer(to: height) { (heightPtr: UnsafePointer<CGFloat>) -> CTParagraphStyle in
        let settings: [CTParagraphStyleSetting] = [
          CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: alignPtr),
          CTParagraphStyleSetting(spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: heightPtr),
          CTParagraphStyleSetting(spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: heightPtr),
        ]
        return CTParagraphStyleCreate(settings, settings.count)
      }
    }
  }

  /// One overlay as a Core Animation layer tree in render-size pixels, visible only during [start, end).
  /// Core Animation in the export has a BOTTOM-LEFT origin: y is flipped and the rotation negated
  /// (the preview rotates clockwise in a y-down space).
  static func overlayLayer(_ o: ExportOverlay, renderSize: CGSize) -> CALayer {
    let l = OverlayLayout.layout(o, frame: renderSize)
    let font = UIFont(name: o.fontPostScriptName, size: l.fontSize) ?? UIFont.systemFont(ofSize: l.fontSize)

    let nsAlign: NSTextAlignment, ctAlign: CTTextAlignment, mode: CATextLayerAlignmentMode
    switch o.align {
    case "left":  nsAlign = .left;  ctAlign = .left;  mode = .left
    case "right": nsAlign = .right; ctAlign = .right; mode = .right
    default:      nsAlign = .center; ctAlign = .center; mode = .center
    }
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = nsAlign
    paragraph.minimumLineHeight = l.lineHeight
    paragraph.maximumLineHeight = l.lineHeight

    // One attributed string serves both measuring (UIKit keys: font, paragraph style) and drawing (CATextLayer →
    // CoreText keys with CGColor values). `.font` ("NSFont") is the same key as kCTFontAttributeName, and a UIFont is a CTFont.
    var attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .paragraphStyle: paragraph,
      NSAttributedString.Key(rawValue: kCTForegroundColorAttributeName as String): UIColor(hex: o.color).cgColor,
      NSAttributedString.Key(rawValue: kCTParagraphStyleAttributeName as String): ctParagraphStyle(alignment: ctAlign, lineHeight: l.lineHeight),
    ]
    if o.outline, l.fontSize > 0 {
      // Negative stroke width (percent of the font size) = stroke AND fill, so a single layer draws outlined text.
      attrs[NSAttributedString.Key(rawValue: kCTStrokeWidthAttributeName as String)] = NSNumber(value: Double(-(l.outlineWidth / l.fontSize * 100)))
      attrs[NSAttributedString.Key(rawValue: kCTStrokeColorAttributeName as String)] = UIColor(hex: contrastFor(hex: o.color)).cgColor
    }
    let string = NSAttributedString(string: o.text, attributes: attrs)

    // The preview's box is `maxWidth` including its padding (React Native boxes are border-box), so text wraps at
    // maxWidth − 2·padding.
    let pad = l.padding
    let textMaxWidth = max(1, l.maxWidth - 2 * pad)
    let measured = string.boundingRect(with: CGSize(width: textMaxWidth, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin], context: nil)
    // A little slack so CoreText (drawing) never wraps or clips where TextKit (measuring) did not; also room for the stroke.
    let slack = ceil(l.outlineWidth) + 2
    let w = ceil(measured.width) + slack
    let h = ceil(measured.height) + slack

    let container = CALayer()
    container.bounds = CGRect(x: 0, y: 0, width: w + 2 * pad, height: h + 2 * pad)
    container.position = CGPoint(x: l.centerX, y: renderSize.height - l.centerY)
    if let bg = o.backgroundColor {
      container.backgroundColor = UIColor(hex: bg).withAlphaComponent(CGFloat(o.backgroundOpacity)).cgColor
      container.cornerRadius = pad / 2
    }

    let textLayer = CATextLayer()
    textLayer.string = string
    textLayer.alignmentMode = mode
    textLayer.isWrapped = true
    textLayer.truncationMode = .none
    textLayer.contentsScale = 1                       // render size is already in pixels
    textLayer.frame = CGRect(x: pad, y: pad, width: w, height: h)
    container.addSublayer(textLayer)

    container.transform = CATransform3DMakeRotation(-l.rotation * .pi / 180, 0, 0, 1)

    // Hidden by default; the animation (opacity 1) only runs during [start, end) and is removed afterwards.
    container.opacity = 0
    let anim = CABasicAnimation(keyPath: "opacity")
    anim.fromValue = 1.0
    anim.toValue = 1.0
    anim.beginTime = max(o.start, AVCoreAnimationBeginTimeAtZero)   // 0 would mean "now", not the video's start
    anim.duration = o.end - o.start
    anim.fillMode = .removed
    anim.isRemovedOnCompletion = true
    container.add(anim, forKey: "visible")
    return container
  }

  private var cancelledFlag: Bool {
    lock.lock(); defer { lock.unlock() }
    return isCancelled
  }

  func start(_ request: ExportRequest) async throws {
    guard let outputURL = Self.fileURL(from: request.outputPath) else { throw ExportError.badOutputPath }
    guard !request.clips.isEmpty else { throw ExportError.sessionFailed("Nothing to export") }
    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw ExportError.sessionFailed("Cannot create video track") }
    let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    var hasAudio = false
    var clipAudioRanges: [(range: CMTimeRange, volume: Float)] = []
    let renderSize = Self.renderSize(aspect: request.aspectRatio, resolution: request.resolution)
    var cursor = CMTime.zero
    var instructions: [AVMutableVideoCompositionInstruction] = []

    for clip in request.clips {
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      guard let url = URL(string: clip.sourceUri) else { throw ExportError.noVideoTrack(clip.sourceUri) }
      let asset = AVURLAsset(url: url)
      guard let srcVideo = try await asset.loadTracks(withMediaType: .video).first else { throw ExportError.noVideoTrack(clip.sourceUri) }
      let (preferredTransform, naturalSize) = try await srcVideo.load(.preferredTransform, .naturalSize)
      // Clamp the trim range to the source so insertTimeRange never reads past the end.
      let duration = try await asset.load(.duration)
      let end = min(clip.trimEnd, duration.seconds)
      let start = max(0, min(clip.trimStart, end))
      guard end - start > 0 else { throw ExportError.sessionFailed("Clip range is empty: \(clip.sourceUri)") }
      let range = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
      try videoTrack.insertTimeRange(range, of: srcVideo, at: cursor)
      if let srcAudio = try await asset.loadTracks(withMediaType: .audio).first, let audioTrack {
        if (try? audioTrack.insertTimeRange(range, of: srcAudio, at: cursor)) != nil {
          hasAudio = true
          clipAudioRanges.append((range: CMTimeRange(start: cursor, duration: range.duration), volume: clip.muted ? 0 : Float(max(0, clip.volume))))
        }
      }
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: range.duration)
      let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
      layer.setTransform(Self.fillTransform(preferredTransform: preferredTransform, naturalSize: naturalSize, renderSize: renderSize), at: cursor)
      instruction.layerInstructions = [layer]
      instructions.append(instruction)
      cursor = cursor + range.duration
    }
    // An empty audio track (all sources silent) can make the export fail; drop it.
    if !hasAudio, let audioTrack { composition.removeTrack(audioTrack) }
    let total = cursor

    // Per-clip volume / mute on the clip audio track.
    var mixParams: [AVAudioMixInputParameters] = []
    if hasAudio, let audioTrack {
      let params = AVMutableAudioMixInputParameters(track: audioTrack)
      for entry in clipAudioRanges { params.setVolume(entry.volume, at: entry.range.start) }
      mixParams.append(params)
    }

    // Music: a second audio track starting at `audio.start`, trimmed, clamped to the video's length.
    if let audio = request.audio {
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      guard let musicURL = URL(string: audio.sourceUri) else { throw ExportError.sessionFailed("Invalid music URI: \(audio.sourceUri)") }
      let musicAsset = AVURLAsset(url: musicURL)
      guard let srcMusic = try await musicAsset.loadTracks(withMediaType: .audio).first else { throw ExportError.sessionFailed("No audio track in \(audio.sourceUri)") }
      let musicAssetDuration = try await musicAsset.load(.duration)
      let insertAt = CMTime(seconds: max(0, audio.start), preferredTimescale: 600)
      let srcEnd = CMTimeMinimum(CMTime(seconds: max(0, audio.trimEnd), preferredTimescale: 600), musicAssetDuration)
      let srcStart = CMTimeMinimum(CMTime(seconds: max(0, audio.trimStart), preferredTimescale: 600), srcEnd)
      // musicDur = min(trimEnd − trimStart, total − start); computed in CMTime so rounding never overshoots.
      let musicDur = CMTimeMinimum(CMTimeSubtract(srcEnd, srcStart), CMTimeSubtract(total, insertAt))
      if CMTimeCompare(musicDur, .zero) > 0,
         let musicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
        try musicTrack.insertTimeRange(CMTimeRange(start: srcStart, duration: musicDur), of: srcMusic, at: insertAt)
        let volume = Float(max(0, audio.volume))
        let params = AVMutableAudioMixInputParameters(track: musicTrack)
        params.setVolume(volume, at: .zero)
        // If the music plays to the end of the video, fade it out linearly over the last second.
        if (insertAt + musicDur).seconds >= total.seconds - 0.01 {
          let fade = CMTimeMinimum(CMTime(seconds: 1, preferredTimescale: 600), musicDur)
          params.setVolumeRamp(fromStartVolume: volume, toEndVolume: 0, timeRange: CMTimeRange(start: CMTimeSubtract(total, fade), duration: fade))
        }
        mixParams.append(params)
      }
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = instructions

    // Text overlays, composited on top of the video by Core Animation.
    let overlays = request.overlays.filter { $0.end > $0.start && !$0.text.isEmpty }
    if !overlays.isEmpty {
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      let bounds = CGRect(origin: .zero, size: renderSize)
      let parentLayer = CALayer()
      parentLayer.frame = bounds
      let videoLayer = CALayer()
      videoLayer.frame = bounds
      parentLayer.addSublayer(videoLayer)
      for overlay in overlays { parentLayer.addSublayer(Self.overlayLayer(overlay, renderSize: renderSize)) }
      CATransaction.commit()
      videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parentLayer)
    }

    // The render size already fixes the output dimensions (portrait or landscape); HighestQuality honours
    // videoComposition.renderSize exactly instead of fitting it into a fixed landscape preset box.
    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw ExportError.sessionFailed("Cannot create export session") }
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    if !mixParams.isEmpty {
      let mix = AVMutableAudioMix()
      mix.inputParameters = mixParams
      session.audioMix = mix
    }
    session.shouldOptimizeForNetworkUse = true

    lock.lock()
    let cancelledBeforeExport = isCancelled
    if !cancelledBeforeExport { self.session = session }
    lock.unlock()
    if cancelledBeforeExport { onEvent(["jobId": id, "type": "cancelled"]); return }

    let jobId = id
    DispatchQueue.main.async {
      self.timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
        guard let self else { return }
        self.lock.lock(); let s = self.session; self.lock.unlock()
        guard let s, s.status == .waiting || s.status == .exporting else { return }
        self.onEvent(["jobId": jobId, "type": "progress", "progress": Double(s.progress)])
      }
    }
    session.exportAsynchronously { [weak self] in
      guard let self else { return }
      DispatchQueue.main.async { self.timer?.invalidate(); self.timer = nil }
      switch session.status {
      case .completed:
        self.onEvent(["jobId": jobId, "type": "done", "fileUri": outputURL.absoluteString])
      case .cancelled:
        try? FileManager.default.removeItem(at: outputURL)
        self.onEvent(["jobId": jobId, "type": "cancelled"])
      default:
        try? FileManager.default.removeItem(at: outputURL)
        self.onEvent(["jobId": jobId, "type": "error", "message": session.error?.localizedDescription ?? "Export failed"])
      }
    }
  }

  func cancel() {
    lock.lock()
    isCancelled = true
    let s = session
    lock.unlock()
    s?.cancelExport()
  }
}
