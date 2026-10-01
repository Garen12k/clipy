import AVFoundation
import ExpoModulesCore

struct ExportClip: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
}

struct ExportRequest: Record {
  @Field var clips: [ExportClip] = []
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

/// One export job. Builds an AVMutableComposition from trimmed clips, aspect-fills each into the render size, and writes an .mp4.
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
        if (try? audioTrack.insertTimeRange(range, of: srcAudio, at: cursor)) != nil { hasAudio = true }
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

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = instructions

    // The render size already fixes the output dimensions (portrait or landscape); HighestQuality honours
    // videoComposition.renderSize exactly instead of fitting it into a fixed landscape preset box.
    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw ExportError.sessionFailed("Cannot create export session") }
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
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
