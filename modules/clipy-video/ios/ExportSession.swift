import AVFoundation
import CoreText
import ExpoModulesCore
import QuartzCore
import UIKit

struct ExportTransition: Record {
  @Field var type: String = "none"                // none | fade | dissolve | slide | zoom (unknown → dissolve)
  @Field var duration: Double = 0                  // seconds, centred on the cut after this clip
}

struct ExportClipTransform: Record {
  @Field var scale: Double = 1                     // 1 = the cropped picture just covers the frame
  @Field var x: Double = 0                         // offset of the centre, fraction of the frame width
  @Field var y: Double = 0                         // offset of the centre, fraction of the frame height (down)
  @Field var rotation: Double = 0                  // degrees, clockwise as seen on screen
  @Field var flipH: Bool = false
  @Field var flipV: Bool = false
}

struct ExportCrop: Record {
  @Field var x: Double = 0                         // fractions of the oriented source, top-left origin
  @Field var y: Double = 0
  @Field var w: Double = 1
  @Field var h: Double = 1
}

struct ExportBackground: Record {
  @Field var type: String = "black"                // black | color | blur (unknown → black)
  @Field var color: String?                        // `#RRGGBB` when type is "color"; JS `null` → nil
}

struct ExportClip: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1
  @Field var muted: Bool = false
  @Field var speed: Double = 1                     // output duration = (trimEnd − trimStart) / speed
  @Field var filter: String?                       // JS `null` → nil (no filter)
  @Field var transition: ExportTransition = ExportTransition()   // into the NEXT clip
  @Field var kind: String = "video"                // video | photo — accepted, not acted on yet (photo pre-pass: Task 13)
  @Field var sourceWidth: Double = 0               // oriented (display) size; the compositor uses the actual frame size
  @Field var sourceHeight: Double = 0
  @Field var transform: ExportClipTransform = ExportClipTransform()
  @Field var crop: ExportCrop = ExportCrop()
  @Field var background: ExportBackground = ExportBackground()   // shown only where the picture leaves the frame
  @Field var reversed: Bool = false                // accepted, not acted on yet (reverse pre-pass: Task 13)
}

struct ExportOverlay: Record {
  @Field var kind: String = "text"                 // text | caption | sticker
  @Field var emoji: String?                        // sticker: emoji character(s)
  @Field var shape: String?                        // sticker: Effects.shapePaths id (wins over emoji, like StickerView)
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

/// A clip after its asset has been loaded and its trim clamped to the source.
private struct LoadedClip {
  let clip: ExportClip
  let srcVideo: AVAssetTrack
  let srcAudio: AVAssetTrack?
  let audioRange: CMTimeRange?                     // the source audio track's own range
  let transform: CGAffineTransform                 // Core Image aspect-fill transform
  let orient: CGAffineTransform                    // Core Image: raw frame → upright, y-up, origin (0, 0)
  let start: Double                                // clamped trimStart (source seconds)
  let end: Double                                  // clamped trimEnd (source seconds)
  let sourceEnd: CMTime                            // last source time that can be read (handle limit)
  let speed: Double
  let outDur: CMTime                               // (end − start) / speed — what the clip adds to the timeline
}

/// Where one clip ended up on the composition timeline (output seconds).
private struct PlacedClip {
  let trackID: CMPersistentTrackID
  let bodyStart: CMTime                            // = cursor before this clip
  let bodyEnd: CMTime                              // = bodyStart + outDur
}

/// One export job. Builds an AVMutableComposition from trimmed clips, aspect-fills each into the render size, and writes an .mp4.
/// Phase 2: per-clip volume/mute and an optional music track (audio mix, 1 s fade-out at the end), plus text overlays
/// rendered with Core Animation (`AVVideoCompositionCoreAnimationTool`).
/// Phase 3: per-clip speed (`scaleTimeRange`), Core Image filters and transitions through `ClipyCompositor`, with clips
/// alternating between two video tracks (A/B) so a transition's two clips overlap; emoji/shape stickers as layers.
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

  /// `fillTransform` for the Core Image compositor. AVFoundation transforms are y-down (top-left origin) while a
  /// CIImage made from a pixel buffer is y-up, so: flip the source into y-down, apply the fill, flip back into y-up
  /// render space. Pure scales/centring are unchanged by this; rotations (portrait iPhone video) need it.
  static func ciFillTransform(preferredTransform t: CGAffineTransform, naturalSize: CGSize, renderSize: CGSize) -> CGAffineTransform {
    let fill = fillTransform(preferredTransform: t, naturalSize: naturalSize, renderSize: renderSize)
    let flipSource = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: naturalSize.height)
    let flipRender = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: renderSize.height)
    return flipSource.concatenating(fill).concatenating(flipRender)
  }

  /// The orientation part of `ciFillTransform` alone: raw pixel buffer (y-up) → upright picture, still y-up, with
  /// its extent at (0, 0, displayW, displayH). `ciFillTransform` = this, then a uniform cover scale and centring
  /// (checked in ClipLayoutTests). `ClipLayout.ciPlacement` then places the upright picture.
  static func ciOrientTransform(preferredTransform t: CGAffineTransform, naturalSize: CGSize) -> CGAffineTransform {
    let bounds = CGRect(origin: .zero, size: naturalSize).applying(t)
    let normalise = CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY)
    let flipSource = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: naturalSize.height)
    let flipOriented = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: bounds.height)
    return flipSource.concatenating(t).concatenating(normalise).concatenating(flipOriented)
  }

  /// Seconds → CMTime at the timescale every Phase 1–3 computation uses.
  static func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 600) }

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
    // CTFontCreateWithName never fails (it silently substitutes), so check availability through UIFont first.
    let fontName = UIFont(name: o.fontPostScriptName, size: l.fontSize) != nil ? o.fontPostScriptName : "Helvetica"
    let font = CTFontCreateWithName(fontName as CFString, l.fontSize, nil)

    let ctAlign: CTTextAlignment, mode: CATextLayerAlignmentMode
    switch o.align {
    case "left":  ctAlign = .left;   mode = .left
    case "right": ctAlign = .right;  mode = .right
    default:      ctAlign = .center; mode = .center
    }

    // One attributed string with CoreText keys ONLY: CATextLayer draws it and CTFramesetter measures it, so the
    // measured size and the drawn layout come from the same engine. Built by subscript assignment (never a
    // dictionary literal) so two constants sharing a raw value can't trap on a duplicate key.
    func key(_ k: CFString) -> NSAttributedString.Key { NSAttributedString.Key(rawValue: k as String) }
    var attrs: [NSAttributedString.Key: Any] = [:]
    attrs[key(kCTFontAttributeName)] = font
    attrs[key(kCTForegroundColorAttributeName)] = UIColor(hex: o.color).cgColor
    attrs[key(kCTParagraphStyleAttributeName)] = ctParagraphStyle(alignment: ctAlign, lineHeight: l.lineHeight)
    // React Native centres the glyphs inside the lineHeight box; shift the baseline to match.
    let glyphHeight = CTFontGetAscent(font) + CTFontGetDescent(font) + CTFontGetLeading(font)
    attrs[key(kCTBaselineOffsetAttributeName)] = NSNumber(value: Double((l.lineHeight - glyphHeight) / 2))
    if o.outline, l.fontSize > 0 {
      // Negative stroke width (percent of the font size) = stroke AND fill, so a single layer draws outlined text.
      attrs[key(kCTStrokeWidthAttributeName)] = NSNumber(value: Double(-(l.outlineWidth / l.fontSize * 100)))
      attrs[key(kCTStrokeColorAttributeName)] = UIColor(hex: contrastFor(hex: o.color)).cgColor
    }
    let string = NSAttributedString(string: o.text, attributes: attrs)

    // The preview's box is `maxWidth` including its padding (React Native boxes are border-box), so text wraps at
    // maxWidth − 2·padding.
    let pad = l.padding
    let wrapWidth = max(1, l.maxWidth - 2 * pad)
    let framesetter = CTFramesetterCreateWithAttributedString(string as CFAttributedString)
    let suggested = CTFramesetterSuggestFrameSizeWithConstraints(framesetter, CFRange(location: 0, length: 0), nil, CGSize(width: wrapWidth, height: .greatestFiniteMagnitude), nil)
    let w = ceil(suggested.width)
    let h = ceil(suggested.height)

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
    addVisibility(container, start: o.start, end: o.end)
    return container
  }

  /// Hidden by default; the animation (opacity 1) only runs during [start, end) and is removed afterwards.
  static func addVisibility(_ layer: CALayer, start: Double, end: Double) {
    layer.opacity = 0
    let anim = CABasicAnimation(keyPath: "opacity")
    anim.fromValue = 1.0
    anim.toValue = 1.0
    anim.beginTime = max(start, AVCoreAnimationBeginTimeAtZero)   // 0 would mean "now", not the video's start
    anim.duration = end - start
    anim.fillMode = .removed
    anim.isRemovedOnCompletion = true
    layer.add(anim, forKey: "visible")
  }

  /// One sticker centred on (x·W, y·H), rotated about its centre, visible during [start, end) — like a text
  /// container. A known `shape` wins over `emoji` (as in StickerView.tsx). Nil when there is nothing to draw.
  static func stickerLayer(_ o: ExportOverlay, renderSize: CGSize) -> CALayer? {
    let container = CALayer()
    if let shape = o.shape, let svg = Effects.shapePaths[shape], let path = SVGPath.cgPath(from: svg) {
      let box = Effects.stickerShapeScale * renderSize.height * CGFloat(o.scale)
      guard box > 0 else { return nil }
      // Scale the 100×100 SVG box to `box` and flip it vertically: SVG is y-down, the export's layer space is y-up.
      var flip = CGAffineTransform(a: box / 100, b: 0, c: 0, d: -box / 100, tx: 0, ty: box)
      guard let placed = path.copy(using: &flip) else { return nil }
      container.bounds = CGRect(x: 0, y: 0, width: box, height: box)
      let shapeLayer = CAShapeLayer()
      shapeLayer.frame = container.bounds
      shapeLayer.path = placed
      shapeLayer.fillColor = UIColor(hex: o.color).cgColor
      shapeLayer.strokeColor = nil
      shapeLayer.contentsScale = 1                    // render size is already in pixels
      container.addSublayer(shapeLayer)
    } else if let emoji = o.emoji, !emoji.isEmpty {
      let size = Effects.stickerEmojiScale * renderSize.height * CGFloat(o.scale)
      guard size > 0 else { return nil }
      // Apple Color Emoji by name (CoreText falls back per glyph for anything it lacks); CoreText keys only, so
      // CATextLayer draws and CTFramesetter measures with the same engine (same approach as the text path).
      let font = CTFontCreateWithName("AppleColorEmoji" as CFString, size, nil)
      func key(_ k: CFString) -> NSAttributedString.Key { NSAttributedString.Key(rawValue: k as String) }
      var attrs: [NSAttributedString.Key: Any] = [:]
      attrs[key(kCTFontAttributeName)] = font
      attrs[key(kCTForegroundColorAttributeName)] = UIColor.white.cgColor
      let string = NSAttributedString(string: emoji, attributes: attrs)
      let framesetter = CTFramesetterCreateWithAttributedString(string as CFAttributedString)
      let suggested = CTFramesetterSuggestFrameSizeWithConstraints(framesetter, CFRange(location: 0, length: 0), nil, CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude), nil)
      let w = max(1, ceil(suggested.width))
      let h = max(1, ceil(suggested.height))
      container.bounds = CGRect(x: 0, y: 0, width: w, height: h)
      let textLayer = CATextLayer()
      textLayer.string = string
      textLayer.alignmentMode = .center
      textLayer.isWrapped = false
      textLayer.truncationMode = .none
      textLayer.contentsScale = 1                     // render size is already in pixels
      textLayer.frame = container.bounds
      container.addSublayer(textLayer)
    } else {
      return nil
    }
    container.position = CGPoint(x: CGFloat(o.x) * renderSize.width, y: renderSize.height - CGFloat(o.y) * renderSize.height)
    container.transform = CATransform3DMakeRotation(-CGFloat(o.rotation) * .pi / 180, 0, 0, 1)
    addVisibility(container, start: o.start, end: o.end)
    return container
  }

  /// Text and captions use the Phase 2 text path unchanged; stickers use `stickerLayer`. Empty ones are skipped.
  static func overlayLayers(_ overlays: [ExportOverlay], renderSize: CGSize) -> [CALayer] {
    overlays.compactMap { o -> CALayer? in
      guard o.end > o.start else { return nil }
      if o.kind == "sticker" { return stickerLayer(o, renderSize: renderSize) }
      return o.text.isEmpty ? nil : overlayLayer(o, renderSize: renderSize)
    }
  }

  private var cancelledFlag: Bool {
    lock.lock(); defer { lock.unlock() }
    return isCancelled
  }

  func start(_ request: ExportRequest) async throws {
    guard let outputURL = Self.fileURL(from: request.outputPath) else { throw ExportError.badOutputPath }
    guard !request.clips.isEmpty else { throw ExportError.sessionFailed("Nothing to export") }
    let renderSize = Self.renderSize(aspect: request.aspectRatio, resolution: request.resolution)

    // 1. Load every clip first: a transition window is clamped against the NEXT clip's output duration.
    var loaded: [LoadedClip] = []
    for clip in request.clips {
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      guard let url = URL(string: clip.sourceUri) else { throw ExportError.noVideoTrack(clip.sourceUri) }
      let asset = AVURLAsset(url: url)
      guard let srcVideo = try await asset.loadTracks(withMediaType: .video).first else { throw ExportError.noVideoTrack(clip.sourceUri) }
      let (preferredTransform, naturalSize, videoRange) = try await srcVideo.load(.preferredTransform, .naturalSize, .timeRange)
      // Clamp the trim range to the source so insertTimeRange never reads past the end.
      let duration = try await asset.load(.duration)
      let end = min(clip.trimEnd, duration.seconds)
      let start = max(0, min(clip.trimStart, end))
      guard end - start > 0 else { throw ExportError.sessionFailed("Clip range is empty: \(clip.sourceUri)") }
      let speed = clip.speed.isFinite && clip.speed > 0 ? clip.speed : 1
      let outDur = Self.time((end - start) / speed)
      guard CMTimeCompare(outDur, .zero) > 0 else { throw ExportError.sessionFailed("Clip range is empty: \(clip.sourceUri)") }
      let srcAudio = try await asset.loadTracks(withMediaType: .audio).first
      var audioRange: CMTimeRange? = nil
      if let srcAudio { audioRange = try? await srcAudio.load(.timeRange) }
      loaded.append(LoadedClip(
        clip: clip, srcVideo: srcVideo, srcAudio: srcAudio, audioRange: audioRange,
        transform: Self.ciFillTransform(preferredTransform: preferredTransform, naturalSize: naturalSize, renderSize: renderSize),
        orient: Self.ciOrientTransform(preferredTransform: preferredTransform, naturalSize: naturalSize),
        start: start, end: end, sourceEnd: CMTimeMinimum(duration, videoRange.end),
        speed: speed, outDur: outDur))
    }
    let n = loaded.count

    // 2. Half-width of the transition window at each cut (window = [cut − half, cut + half]), clamped in CMTime so
    //    the two windows inside one clip never overlap (half[i−1] + half[i] ≤ outDur[i]) and a window never takes
    //    more than half of the next clip. Clip i and clip i+2 share a track, so their placements cannot overlap.
    var halves = [CMTime](repeating: .zero, count: n)
    for i in 0..<(n - 1) {
      let tr = loaded[i].clip.transition
      guard tr.type != "none", tr.duration.isFinite, tr.duration > 0 else { continue }
      let previous = i > 0 ? halves[i - 1] : CMTime.zero
      let next = loaded[i + 1].outDur
      let halfOfNext = CMTime(value: next.value / 2, timescale: next.timescale)
      halves[i] = CMTimeMaximum(.zero, CMTimeMinimum(Self.time(tr.duration / 2), CMTimeMinimum(loaded[i].outDur - previous, halfOfNext)))
    }

    // 3. Two video and two audio tracks; clip i goes on track i % 2 so the clips around a cut can overlap.
    let composition = AVMutableComposition()
    guard let videoA = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
          let videoB = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { throw ExportError.sessionFailed("Cannot create video track") }
    let videoTracks = [videoA, videoB]
    let audioTracks: [AVMutableCompositionTrack?] = [
      composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
      composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
    ]
    var videoEnd: [CMTime] = [.zero, .zero]
    var audioEnd: [CMTime] = [.zero, .zero]
    var audioVolumes: [[(at: CMTime, volume: Float)]] = [[], []]
    var placed: [PlacedClip] = []
    var cursor = CMTime.zero
    let holdFrame = CMTime(value: 1, timescale: 30)

    /// Appends `source` at `a` and retimes it to end exactly at `b` (speed). Every insert lands at or after the
    /// track's current end, so nothing already on the track shifts. False when there is nothing to insert.
    func insertScaled(_ track: AVMutableCompositionTrack, _ source: CMTimeRange, of srcTrack: AVAssetTrack, from a: CMTime, to b: CMTime) throws -> Bool {
      guard CMTimeCompare(b, a) > 0, CMTimeCompare(source.duration, .zero) > 0 else { return false }
      try track.insertTimeRange(source, of: srcTrack, at: a)
      let target = b - a
      if CMTimeCompare(source.duration, target) != 0 {
        track.scaleTimeRange(CMTimeRange(start: a, duration: source.duration), toDuration: target)
      }
      return true
    }

    for (i, c) in loaded.enumerated() {
      let k = i % 2
      let track = videoTracks[k]
      let halfIn = i > 0 ? halves[i - 1] : CMTime.zero
      let halfOut = halves[i]
      let bodyStart = cursor
      let bodyEnd = cursor + c.outDur
      // The incoming clip starts at cursor − d/2 on its own track (never before that track's previous clip ends).
      let clipStart = CMTimeMaximum(bodyStart - halfIn, videoEnd[k])
      let clipEnd = bodyEnd + halfOut
      // Handles in source seconds: d/2 × speed before trimStart / after trimEnd, clamped to the source.
      let head = max(0, min(halfIn.seconds * c.speed, c.start))
      let tail = max(0, min(halfOut.seconds * c.speed, c.sourceEnd.seconds - c.end))
      let source = CMTimeRange(start: Self.time(c.start - head), end: CMTimeMinimum(Self.time(c.end + tail), c.sourceEnd))
      guard CMTimeCompare(source.duration, .zero) > 0 else { throw ExportError.sessionFailed("Clip range is empty: \(c.clip.sourceUri)") }
      // Real material covers [mainStart, mainEnd); handles map at 1/speed.
      let mainStart = CMTimeMaximum(clipStart, bodyStart - CMTimeMinimum(Self.time(head / c.speed), halfIn))
      let mainEnd = CMTimeMinimum(clipEnd, bodyEnd + CMTimeMinimum(Self.time(tail / c.speed), halfOut))
      // Where a handle was clamped short, hold the edge frame: one frame's worth of source at that edge, stretched
      // over the gap. Approximate — the held picture is whichever source sample covers that 1/30 s edge range.
      let edge = CMTimeMinimum(holdFrame, source.duration)
      _ = try insertScaled(track, CMTimeRange(start: source.start, duration: edge), of: c.srcVideo, from: clipStart, to: mainStart)
      _ = try insertScaled(track, source, of: c.srcVideo, from: mainStart, to: mainEnd)
      _ = try insertScaled(track, CMTimeRange(start: source.end - edge, duration: edge), of: c.srcVideo, from: mainEnd, to: clipEnd)
      videoEnd[k] = clipEnd

      // Clip audio (handles included, so the two clips' sound overlaps across a transition), retimed like the video.
      if let srcAudio = c.srcAudio, let audioRange = c.audioRange, let audioTrack = audioTracks[k] {
        let shared = CMTimeRangeGetIntersection(source, otherRange: audioRange)
        if CMTimeCompare(shared.duration, .zero) > 0 {
          let outPerSource = (mainEnd - mainStart).seconds / source.duration.seconds
          let aStart = CMTimeMaximum(mainStart + Self.time((shared.start - source.start).seconds * outPerSource), audioEnd[k])
          let aEnd = CMTimeMinimum(mainStart + Self.time((shared.end - source.start).seconds * outPerSource), mainEnd)
          if (try? insertScaled(audioTrack, shared, of: srcAudio, from: aStart, to: aEnd)) == true {
            audioEnd[k] = aEnd
            // Volume / mute takes effect at the clip's scaled start on its audio track.
            audioVolumes[k].append((at: aStart, volume: c.clip.muted ? 0 : Float(max(0, c.clip.volume))))
          }
        }
      }

      placed.append(PlacedClip(trackID: track.trackID, bodyStart: bodyStart, bodyEnd: bodyEnd))
      cursor = bodyEnd                              // advance by outDur only — never by a handle
    }
    let total = cursor                              // Σ outDur

    // A single clip never uses track B; an empty audio track (all sources silent) can make the export fail.
    if n < 2 { composition.removeTrack(videoB) }
    var mixParams: [AVAudioMixInputParameters] = []
    for k in 0..<2 {
      guard let audioTrack = audioTracks[k] else { continue }
      if audioVolumes[k].isEmpty { composition.removeTrack(audioTrack); continue }
      // Per-clip volume / mute on the clip audio tracks.
      let params = AVMutableAudioMixInputParameters(track: audioTrack)
      for entry in audioVolumes[k] { params.setVolume(entry.volume, at: entry.at) }
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

    // 4. Compositor instructions, contiguous over [0, total]: clip i alone on [bodyStart + halfIn, bodyEnd − halfOut),
    //    then the window around cut i, [bodyEnd − half, bodyEnd + half), with the outgoing and incoming layers.
    func spec(_ i: Int) -> LayerSpec {
      let c = loaded[i].clip
      return LayerSpec(
        trackID: placed[i].trackID, fill: loaded[i].transform, orient: loaded[i].orient,
        crop: ClipCrop(x: CGFloat(c.crop.x), y: CGFloat(c.crop.y), w: CGFloat(c.crop.w), h: CGFloat(c.crop.h)),
        transform: ClipTransform(
          scale: CGFloat(c.transform.scale), x: CGFloat(c.transform.x), y: CGFloat(c.transform.y),
          rotation: CGFloat(c.transform.rotation), flipH: c.transform.flipH, flipV: c.transform.flipV),
        background: LayerBackground(type: c.background.type, color: c.background.color),
        filter: c.filter)
    }
    var instructions: [AVVideoCompositionInstructionProtocol] = []
    for i in 0..<n {
      let soloStart = placed[i].bodyStart + (i > 0 ? halves[i - 1] : CMTime.zero)
      let soloEnd = placed[i].bodyEnd - halves[i]
      if CMTimeCompare(soloEnd, soloStart) > 0 {
        instructions.append(ClipyInstruction(timeRange: CMTimeRange(start: soloStart, end: soloEnd), layers: [spec(i)], transition: nil))
      }
      if i < n - 1, CMTimeCompare(halves[i], .zero) > 0 {
        let window = CMTimeRange(start: placed[i].bodyEnd - halves[i], end: placed[i].bodyEnd + halves[i])
        instructions.append(ClipyInstruction(
          timeRange: window, layers: [spec(i), spec(i + 1)],
          transition: (type: loaded[i].clip.transition.type, start: window.start, duration: window.duration)))
      }
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.customVideoCompositorClass = ClipyCompositor.self
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = instructions

    // Text, caption and sticker overlays, composited on top of the video by Core Animation.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    let overlayLayers = Self.overlayLayers(request.overlays, renderSize: renderSize)
    var layerTree: (parent: CALayer, video: CALayer)? = nil
    if !overlayLayers.isEmpty {
      let bounds = CGRect(origin: .zero, size: renderSize)
      let parentLayer = CALayer()
      parentLayer.frame = bounds
      let videoLayer = CALayer()
      videoLayer.frame = bounds
      parentLayer.addSublayer(videoLayer)
      for layer in overlayLayers { parentLayer.addSublayer(layer) }
      layerTree = (parent: parentLayer, video: videoLayer)
    }
    CATransaction.commit()
    if let tree = layerTree {
      videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: tree.video, in: tree.parent)
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
