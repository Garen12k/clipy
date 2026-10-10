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

/// The twelve Adjust slider values (`ClipAdjust`, in `ADJUST_KEYS` order); 0 = no change.
struct ExportAdjust: Record {
  @Field var brightness: Double = 0
  @Field var contrast: Double = 0
  @Field var saturation: Double = 0
  @Field var exposure: Double = 0
  @Field var temperature: Double = 0
  @Field var tint: Double = 0
  @Field var highlights: Double = 0
  @Field var shadows: Double = 0
  @Field var sharpen: Double = 0
  @Field var vignette: Double = 0
  @Field var fade: Double = 0
  @Field var grain: Double = 0

  /// As the compositor's plain value (non-finite values → 0).
  var values: AdjustValues {
    AdjustValues(brightness: brightness, contrast: contrast, saturation: saturation, exposure: exposure,
                 temperature: temperature, tint: tint, highlights: highlights, shadows: shadows,
                 sharpen: sharpen, vignette: vignette, fade: fade, grain: grain).sanitized
  }
}

/// A blur / mosaic box's rectangle: fractions of the frame, top-left origin.
struct ExportEffectRect: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var w: Double = 0
  @Field var h: Double = 0
}

/// A green screen: the key colour and how wide a band of hues around it is removed.
struct ExportChroma: Record {
  @Field var color: String = ""                    // `#RRGGBB` (anything else keys nothing)
  @Field var strength: Double = 0.5                // 0…1
}

/// What a main clip's BLUR background is made from when that is not the clip's own picture: the clip is sent from
/// its see-through cut-out copy, whose blur would be a blurred silhouette, so the app names the ORIGINAL file here.
/// It is read with the clip's own timing (a copy has its original's timeline). Absent for every other clip.
struct ExportBackdrop: Record {
  @Field var uri: String = ""                      // the original file
  @Field var kind: String = "video"                // video | photo (a photo is decoded once, as a still)
}

/// A project-time effect range. Decoded here; drawn by `ClipyCompositor` through `EffectRenderer`.
struct ExportEffect: Record {
  @Field var type: String = ""                     // Effects.effectIds (unknown → ignored)
  @Field var start: Double = 0                     // output seconds
  @Field var end: Double = 0
  @Field var intensity: Double = 1                 // 0…1
  @Field var rect: ExportEffectRect?               // blurBox / mosaicBox only; JS `null` → nil
}

/// An In or Out animation: `id` is one of `ANIM_IN_IDS` (unknown → no movement); `duration` in seconds, already
/// scaled by the app so that In + Out fit inside the item.
struct ExportAnimEdge: Record {
  @Field var id: String = ""
  @Field var duration: Double = 0
}

/// One pin. `t` is in seconds of OUTPUT time: clip-local for a clip (ascending; may include one pin before 0 and one
/// after the clip's end), seconds since its start for a text / sticker.
struct ExportKeyframe: Record {
  @Field var t: Double = 0
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var scale: Double = 1
  @Field var rotation: Double = 0
  @Field var opacity: Double = 1
}

/// One constant-speed stretch of a speed curve: `duration` SOURCE seconds played at `speed`.
struct ExportSpeedSpan: Record {
  @Field var duration: Double = 0
  @Field var speed: Double = 1
}

/// One breakpoint of a gain curve built by the app (`audioMix.ts`): the export draws a volume ramp between each two.
struct ExportGainPoint: Record {
  @Field var time: Double = 0                      // seconds: clip-local OUTPUT time for a clip, composition time for an audio track
  @Field var gain: Double = 1                      // 0 = silent, 1 = as recorded, above 1 = boosted
}

struct ExportClip: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1                    // the mix uses `gain`; these two only stand in when `gain` is empty
  @Field var muted: Bool = false
  @Field var speed: Double = 1                     // output duration = (trimEnd − trimStart) / speed
  @Field var filter: String?                       // JS `null` → nil (no filter)
  @Field var transition: ExportTransition = ExportTransition()   // into the NEXT clip
  @Field var kind: String = "video"                // video | photo — a photo is turned into video by MediaPrePass
  @Field var sourceWidth: Double = 0               // oriented (display) size; the compositor uses the actual frame size
  @Field var sourceHeight: Double = 0
  @Field var transform: ExportClipTransform = ExportClipTransform()
  @Field var crop: ExportCrop = ExportCrop()
  @Field var background: ExportBackground = ExportBackground()   // shown only where the picture leaves the frame
  @Field var reversed: Bool = false                // MediaPrePass writes a reversed copy (video only — exports silent)
  @Field var filterIntensity: Double = 1           // 0…1: mix of the unfiltered (0) and the filtered (1) frame
  @Field var adjust: ExportAdjust = ExportAdjust() // applied after the filter; all 0 = no change
  @Field var animIn: ExportAnimEdge?               // JS `null` → nil (no In animation)
  @Field var animOut: ExportAnimEdge?
  @Field var animCombo: String?                    // one of `ANIM_COMBO_IDS`; set → In / Out are not played
  @Field var keyframes: [ExportKeyframe] = []      // non-empty → they give x / y / scale / rotation / opacity
  @Field var speedSpans: [ExportSpeedSpan] = []    // a speed curve, in PLAYBACK order; empty → constant `speed`
  @Field var gain: [ExportGainPoint] = []          // the clip's own sound over its output time (volume, mute, fades); empty → flat `volume` / `muted`
  @Field var opacity: Double = 1                   // the picture's STATIC opacity 0…1; multiplied with the motion (keyframe / animation) opacity
  @Field var mask: String = "none"                 // none | rounded | circle (unknown → none): the picture box's corners
  @Field var blend: String = "normal"              // normal | screen | multiply | overlay | lighten | darken (unknown → normal); layers only
  @Field var chroma: ExportChroma?                 // green screen; JS `null` → nil (none)
  @Field var backdrop: ExportBackdrop?             // the file a Blur background is made from; absent → nil (the clip's own picture, as ever)
}

/// A picture-in-picture layer: a clip (every `ExportClip` field, same names and defaults) placed on the timeline at
/// `start`. Records cannot inherit, so the fields are repeated — keep the two lists in step (guarded by
/// layersExport.swift.test.ts). Its `transition` and `background` are ignored: a layer has neither.
/// `clip` (in MediaPrePass.swift, next to `rewrite`) turns it into a clip record.
struct ExportLayer: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1
  @Field var muted: Bool = false
  @Field var speed: Double = 1
  @Field var filter: String?
  @Field var transition: ExportTransition = ExportTransition()
  @Field var kind: String = "video"
  @Field var sourceWidth: Double = 0
  @Field var sourceHeight: Double = 0
  @Field var transform: ExportClipTransform = ExportClipTransform()
  @Field var crop: ExportCrop = ExportCrop()
  @Field var background: ExportBackground = ExportBackground()
  @Field var reversed: Bool = false
  @Field var filterIntensity: Double = 1
  @Field var adjust: ExportAdjust = ExportAdjust()
  @Field var animIn: ExportAnimEdge?
  @Field var animOut: ExportAnimEdge?
  @Field var animCombo: String?
  @Field var keyframes: [ExportKeyframe] = []
  @Field var speedSpans: [ExportSpeedSpan] = []
  @Field var gain: [ExportGainPoint] = []
  @Field var opacity: Double = 1
  @Field var mask: String = "none"
  @Field var blend: String = "normal"
  @Field var chroma: ExportChroma?
  @Field var backdrop: ExportBackdrop?
  @Field var start: Double = 0                     // composition seconds; the layer may run past the end of the video
}

/// `TextStyle` with shadow / glow flattened: a nil colour = that feature is off. The defaults are the neutral style.
struct ExportTextStyle: Record {
  @Field var opacity: Double = 1
  @Field var letterSpacing: Double = 0             // fraction of the font size
  @Field var lineSpacing: Double = 1               // × the normal line height
  @Field var outlineColor: String?                 // JS `null` → nil (automatic contrast colour)
  @Field var outlineWidth: Double = 1              // × the base outline width
  @Field var shadowColor: String?                  // JS `null` → nil (no shadow)
  @Field var shadowOpacity: Double = 0
  @Field var shadowDistance: Double = 0            // fraction of the font size
  @Field var shadowBlur: Double = 0                // fraction of the font size
  @Field var glowColor: String?                    // JS `null` → nil (no glow)
  @Field var glowSize: Double = 0                  // fraction of the font size
  @Field var boxPadding: Double = 0.25             // fraction of the font size between the text and the edge of its background box
  @Field var boxCorner: String = "rounded"         // rounded | square (anything else draws rounded)
}

/// One spoken word of a caption.
struct ExportCaptionWord: Record {
  @Field var text: String = ""
  @Field var start: Double = 0
  @Field var end: Double = 0
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
  // Motion: drawn by `ExportSession.addMotion` (sampled Core Animation keyframes); none → the static layer.
  @Field var animIn: ExportAnimEdge?
  @Field var animOut: ExportAnimEdge?
  @Field var animLoop: String?                     // one of `ANIM_LOOP_IDS`
  @Field var keyframes: [ExportKeyframe] = []      // t = seconds since the overlay's start
  // Text style, caption words and highlight: `OverlayLayout.layout` turns the style into pixels.
  @Field var style: ExportTextStyle = ExportTextStyle()
  @Field var words: [ExportCaptionWord] = []       // captions only; start / end = seconds since the caption's start
  @Field var highlightColor: String?               // captions only; JS `null` → nil (no word highlight)
}

/// One audio track (music, voice-over or sound effect): source `[trimStart, trimEnd)` placed at `start` (composition
/// seconds), already clipped to the video by the app.
struct ExportAudioTrack: Record {
  @Field var sourceUri: String = ""
  @Field var start: Double = 0
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var gain: [ExportGainPoint] = []          // composition seconds; volume, fades, ducking and the end fade included; empty → gain 1
}

struct ExportRequest: Record {
  @Field var clips: [ExportClip] = []
  @Field var layers: [ExportLayer] = []             // picture-in-picture layers, in draw order (later = on top)
  @Field var overlays: [ExportOverlay] = []
  @Field var effects: [ExportEffect] = []
  @Field var audioTracks: [ExportAudioTrack] = []   // every audio track, mixed with the clips' own sound
  @Field var aspectRatio: String = "9:16"           // "w:h" decides the frame's shape by itself; anything else ("auto") uses `frameAspect`
  @Field var frameAspect: Double = 0                // the frame's width / height; 0 or absent (a request from before it existed) = not given
  @Field var resolution: Int = 1080
  @Field var outputPath: String = ""
  @Field var fps: Int = 30                          // 24 | 30 | 60 (anything else → 30); a request without it exports at 30
  @Field var bitrate: Double = 0                    // video bits per second the file may use ("Smaller file"); 0 or absent = no limit
}

enum ExportError: Error, LocalizedError {
  case noVideoTrack(String), badOutputPath, sessionFailed(String), photoPrepFailed, reversePrepFailed
  var errorDescription: String? {
    switch self {
    case .noVideoTrack(let uri): return "No video track in \(uri)"
    case .badOutputPath: return "Invalid output path"
    case .sessionFailed(let m): return m
    case .photoPrepFailed: return "Couldn't prepare a photo for export."
    case .reversePrepFailed: return "Couldn't reverse a clip for export."
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

/// A clip after its asset has been loaded and its trim clamped to the source.
private struct LoadedClip {
  let asset: AVURLAsset                            // AVAssetTrack.asset is weak: the tracks are only usable while this lives
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
  let spans: [SpeedSpan]                           // a speed curve fitted to [start, end]; empty → constant `speed`
  let outDur: CMTime                               // (end − start) / speed, or Σ span duration / speed — what the clip adds to the timeline
}

/// The original file of a clip that is drawn from a see-through copy, loaded for the clip's blurred background.
private struct LoadedBackdrop {
  let asset: AVURLAsset                            // AVAssetTrack.asset is weak: the track is only usable while this lives
  let video: AVAssetTrack
  let fill: CGAffineTransform                      // Core Image aspect-fill transform of THIS file (its own size and turn)
  let sourceEnd: CMTime                            // last source time that can be read
}

/// The cut points of one retimed insert: `source[j]` (source time) lands on `output[j]` (composition time). Both
/// lists have the same count (≥ 2) and rise strictly; the piece between two neighbours plays at one speed.
struct RetimeCuts {
  let source: [CMTime]
  let output: [CMTime]
}

/// Where one clip ended up on the composition timeline (output seconds).
private struct PlacedClip {
  let trackID: CMPersistentTrackID
  let bodyStart: CMTime                            // = cursor before this clip
  let bodyEnd: CMTime                              // = bodyStart + outDur
}

/// One export job. Builds an AVMutableComposition from trimmed clips, aspect-fills each into the render size, and writes an .mp4.
/// Phase 2: text overlays rendered with Core Animation (`AVVideoCompositionCoreAnimationTool`).
/// Audio: the clips' own sound on two composition tracks and one more composition track per request audio track,
/// mixed with volume ramps drawn from the request's gain curves (`AudioMix.ramps`). The curves come ready-made from
/// the app (volume, mute, fades, ducking, the fade at the end of the video): nothing here changes a gain.
/// Speed curves: a clip with `speedSpans` is inserted once and retimed span by span (`SpeedSpans`, `insertRetimed`).
/// Phase 3: per-clip speed (`scaleTimeRange`), Core Image filters and transitions through `ClipyCompositor`, with clips
/// alternating between two video tracks (A/B) so a transition's two clips overlap; emoji/shape stickers as layers.
/// Picture-in-picture layers: one more video track each (and one audio track for its sound), drawn over the main
/// frame by `ClipyCompositor` from the `overlays` of each instruction (`InstructionSplit.attach`).
/// Events go through `onEvent`: `progress` (repeating), then exactly one of `done` / `cancelled` / `error`.
/// Errors thrown from `start` are NOT emitted here — the caller (the module) turns them into an `error` event.
/// Records what AVFoundation's own check of a video composition finds wrong (first-build diagnostics): each finding is one short line.
final class CompositionCheck: NSObject, AVVideoCompositionValidationHandling {
  var findings: [String] = []
  func videoComposition(_ videoComposition: AVVideoComposition, shouldContinueValidatingAfterFindingInvalidValueForKey key: String) -> Bool {
    findings.append("invalid value for \(key)")
    return true
  }
  func videoComposition(_ videoComposition: AVVideoComposition, shouldContinueValidatingAfterFindingEmptyTimeRange timeRange: CMTimeRange) -> Bool {
    findings.append("no instruction from \(timeRange.start.seconds) for \(timeRange.duration.seconds) s")
    return true
  }
  func videoComposition(_ videoComposition: AVVideoComposition, shouldContinueValidatingAfterFindingInvalidTimeRangeIn videoCompositionInstruction: AVVideoCompositionInstructionProtocol) -> Bool {
    let r = videoCompositionInstruction.timeRange
    findings.append("bad instruction range \(r.start.seconds) + \(r.duration.seconds) s")
    return true
  }
  func videoComposition(_ videoComposition: AVVideoComposition, shouldContinueValidatingAfterFindingInvalidTrackIDIn videoCompositionInstruction: AVVideoCompositionInstructionProtocol, layerInstruction: AVVideoCompositionLayerInstruction, asset: AVAsset) -> Bool {
    findings.append("bad track id \(layerInstruction.trackID)")
    return true
  }
}

final class ExportSession {
  /// Everything an error says, in one line for the app's message and the log: its description, its domain and code, the reason
  /// and the error underneath it. (AVFoundation's own description is often only "The operation could not be completed".)
  static func describe(_ error: Error?) -> String {
    guard let error else { return "Export failed" }
    let e = error as NSError
    var parts: [String] = ["\(e.localizedDescription) [\(e.domain) \(e.code)]"]
    if let reason = e.localizedFailureReason { parts.append(reason) }
    if let under = e.userInfo[NSUnderlyingErrorKey] as? NSError {
      parts.append("underlying: \(under.localizedDescription) [\(under.domain) \(under.code)]")
    }
    return parts.joined(separator: " | ")
  }

  /// The default frames per second of the exported video (a request asks for another rate with `fps`). Whatever
  /// rate the request asks for, the still "hold" frame of a transition handle (a length of source, not an output
  /// rate) and the sampling of text / sticker motion (`OverlayMotion.fps`) stay at this one rate.
  static let frameRate: Int32 = 30
  /// The frame rates a request may ask for (`EXPORT_FPS` in src/editor/model/types.ts); anything else exports at `frameRate`.
  static let frameRates: [Int32] = [24, 30, 60]
  static func frameRate(for fps: Int) -> Int32 {
    let rate = Int32(clamping: fps)
    return frameRates.contains(rate) ? rate : frameRate
  }
  /// Bits per second allowed for the sound on top of the video bitrate when the file length is limited.
  static let audioAllowance: Double = 256_000
  /// `AVAssetExportSession` has no bitrate setting; `fileLengthLimit` is the nearest control. Only a request with a
  /// bitrate above 0 ("Smaller file") uses it; set to false to never use it.
  static let limitsFileLength = true
  /// Bytes the exported file may take: (video bitrate + audio allowance) × seconds / 8, rounded up. Nil = no limit
  /// (a bitrate or length that is 0, negative or not finite — the default request among them).
  /// The limit is a ceiling the session tries to respect, not a target bitrate: a file that would be smaller anyway
  /// is not changed by it, and Apple documents that the result may still come out somewhat over it.
  static func fileLengthLimit(bitrate: Double, seconds: Double) -> Int64? {
    guard limitsFileLength, bitrate.isFinite, seconds.isFinite, bitrate > 0, seconds > 0 else { return nil }
    let bytes = ((bitrate + audioAllowance) * seconds / 8).rounded(.up)
    guard bytes < Double(Int64.max) else { return nil }   // too large to be a limit (and `Int64(_:)` would trap)
    return Int64(bytes)
  }

  let id = UUID().uuidString
  private let lock = NSLock()
  private var session: AVAssetExportSession?   // guarded by `lock`
  private var isCancelled = false              // guarded by `lock`
  private var timer: Timer?                    // main thread only
  private let onEvent: ([String: Any]) -> Void
  /// How often the app had gone to the background when this export was made (`ExportPause`).
  let leavesAtStart = ExportPause.shared.leaveCount

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

  /// The narrowest and the widest frame "auto" may give (width / height) — ASPECT_LIMITS in src/editor/model/types.ts.
  static let aspectLimits: (min: Double, max: Double) = (9.0 / 21.0, 21.0 / 9.0)

  /// The frame's width / height for a request. A "w:h" string is exactly that ratio (the fixed choices, and every
  /// request from before `frameAspect` existed). Anything else ("auto") uses the number, kept inside `aspectLimits`.
  /// Neither → 1: an unknown ratio has always been a square.
  static func aspectValue(aspect: String, frameAspect: Double) -> Double {
    let parts = aspect.split(separator: ":").map { Double($0) }
    if parts.count == 2, let w = parts[0], let h = parts[1], w.isFinite, h.isFinite, w > 0, h > 0 { return w / h }
    if frameAspect.isFinite, frameAspect > 0 { return min(max(frameAspect, aspectLimits.min), aspectLimits.max) }
    return 1
  }

  /// The longest side, in pixels, an H.264 encoder is asked for — `MAX_LONG_SIDE` in src/export/estimate.ts. The
  /// macroblock count alone lets a very wide frame through (4672 × 2002 = 36 792 macroblocks), but hardware H.264
  /// encoders stop at a 4096 × 2304 frame. That is a limit on the frame's two dimensions, not on "width": the encoder
  /// that takes 3840 × 2160 takes 2160 × 3840 too (a 9:16 4K export), so the cap is on the LONGER side whichever way
  /// the frame is turned. 3840 is under it: 16:9 and 9:16 at 4K are untouched.
  static let maxLongSide = 4096

  /// The exported video's size in pixels — keep identical to `renderSize` in src/export/estimate.ts.
  /// The SHORT side is the resolution (720 / 1080 / 2160), the long side follows the shape, both are EVEN (encoders
  /// need that). A frame the H.264 encoder cannot take — too many macroblocks, or a long side above `maxLongSide`:
  /// only frames wider than 4096 : 2160 (about 1.9 : 1) at 4K — is scaled down in steps of 2 on the short side, same
  /// shape. A shape that is not a positive number is a square.
  /// 21:9 at 4K: 2160 × 7 / 3 = 5040 → … 1756 × 7 / 3 = 4097.33 → 4098 (too long) → 1754 × 7 / 3 = 4092.67 → 4092:
  /// 4092 × 1754. 2:1 at 4K: 4320 → 2048 × 2 = 4096: 4096 × 2048. 16:9 at 4K: 3840 × 2160, as ever.
  static func renderSize(aspect: Double, resolution: Int) -> CGSize {
    let a = aspect.isFinite && aspect > 0 ? aspect : 1
    let ratio = max(a, 1 / a)
    func even(_ v: Double) -> Int { max(2, Int((v / 2).rounded()) * 2) }
    func macroblocks(_ w: Int, _ h: Int) -> Int { ((w + 15) / 16) * ((h + 15) / 16) }
    var short = even(Double(resolution))
    var long = even(Double(short) * ratio)
    while (macroblocks(long, short) > MediaPrePass.maxMacroblocks || long > maxLongSide) && short > 2 { short -= 2; long = even(Double(short) * ratio) }
    return a >= 1 ? CGSize(width: long, height: short) : CGSize(width: short, height: long)
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

  /// A request edge as the maths uses it; nil for none or one that cannot play (no id, non-finite or ≤ 0 length).
  static func motionEdge(_ e: ExportAnimEdge?) -> MotionEdge? {
    guard let e, !e.id.isEmpty, e.duration.isFinite, e.duration > 0 else { return nil }
    return MotionEdge(id: e.id, duration: e.duration)
  }

  /// Request pins as the maths uses them: pins with a non-finite number are dropped, the rest are in time order.
  static func motionKeyframes(_ keyframes: [ExportKeyframe]) -> [MotionKeyframe] {
    let pins: [MotionKeyframe] = keyframes.map { (k: ExportKeyframe) -> MotionKeyframe in
      MotionKeyframe(t: k.t, x: k.x, y: k.y, scale: k.scale, rotation: k.rotation, opacity: k.opacity)
    }
    let finite: [MotionKeyframe] = pins.filter { (k: MotionKeyframe) -> Bool in
      k.t.isFinite && k.x.isFinite && k.y.isFinite && k.scale.isFinite && k.rotation.isFinite && k.opacity.isFinite
    }
    return finite.sorted { (a: MotionKeyframe, b: MotionKeyframe) -> Bool in a.t < b.t }
  }

  /// The clip's animation and pins for the compositor; nil when it has neither (such a clip is drawn exactly as
  /// before motion existed).
  static func clipMotion(_ c: ExportClip) -> ClipMotionSpec? {
    let combo: String? = (c.animCombo ?? "").isEmpty ? nil : c.animCombo
    let motion = ClipMotionSpec(keyframes: motionKeyframes(c.keyframes), animIn: motionEdge(c.animIn),
                                animOut: motionEdge(c.animOut), animCombo: combo)
    return motion.isEmpty ? nil : motion
  }

  /// A request green screen as the compositor uses it; nil for none (`LayerSpec` also drops a key that cannot key).
  static func chromaKey(_ c: ExportChroma?) -> ChromaKey? {
    guard let c else { return nil }
    return ChromaKey(color: c.color, strength: c.strength)
  }

  /// A request effect rectangle as the renderer uses it; nil for none.
  static func effectRegion(_ r: ExportEffectRect?) -> RegionRect? {
    guard let r else { return nil }
    return RegionRect(x: r.x, y: r.y, w: r.w, h: r.h)
  }

  /// Seconds → CMTime at the timescale every Phase 1–3 computation uses.
  static func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 600) }

  /// The grid the audio tracks (music, voice-overs, sound effects) are placed on: milliseconds, which is what the app
  /// stores their `start`, `trimStart` and `trimEnd` in (3 decimals). On it every stored value is a whole number of
  /// ticks, so `start + (cut − trimStart)` of the first piece of a split is exactly the `start` of the second: the two
  /// pieces meet with no hole and no overlap. On the 1/600 s grid each of the three values was rounded on its own and
  /// about a third of the cuts were one tick (1.67 ms) off. Only the audio-track path uses it; a composition holds
  /// times of any timescale (CMTime is a rational number, and `CMTimeAdd` / `CMTimeSubtract` / `CMTimeMinimum` of a
  /// 1/1000 and a 1/600 time are exact, on their common 1/3000 grid).
  static let audioTimescale: CMTimeScale = 1000
  /// Seconds → CMTime on the audio tracks' grid.
  static func audioTime(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: audioTimescale) }

  /// A request gain curve as the maths uses it (`AudioMix.usable`). A request without a curve gets one flat point at
  /// `fallback` (non-finite → 0, negative → 0).
  static func gainPoints(_ points: [ExportGainPoint], fallback: Double) -> [GainPoint] {
    let curve: [GainPoint] = AudioMix.usable(points.map { (p: ExportGainPoint) -> GainPoint in GainPoint(time: p.time, gain: p.gain) })
    if !curve.isEmpty { return curve }
    return [GainPoint(time: 0, gain: fallback.isFinite ? max(0, fallback) : 0)]
  }

  /// A clip's own-sound curve in clip-local output seconds; without one, its `volume` / `muted` as a flat gain.
  static func clipGain(_ c: ExportClip) -> [GainPoint] {
    return gainPoints(c.gain, fallback: c.muted ? 0 : c.volume)
  }

  /// Draws `ramps` (in time order) on one track's mix parameters, a volume ramp each — a flat stretch is a ramp with
  /// equal ends. No two ramps overlap: one that would start before the previous one ended starts where that ended,
  /// and one with no length on the 1/600 s grid is skipped. Before the first ramp the volume is that ramp's start.
  static func applyRamps(_ ramps: [GainRamp], to params: AVMutableAudioMixInputParameters) {
    var drawnTo: CMTime? = nil
    for r in ramps {
      let end = time(r.end)
      let start = CMTimeMaximum(time(r.start), drawnTo ?? .zero)
      guard CMTimeCompare(end, start) > 0 else { continue }
      if drawnTo == nil, CMTimeCompare(start, .zero) > 0 { params.setVolume(Float(r.from), at: .zero) }
      params.setVolumeRamp(fromStartVolume: Float(r.from), toEndVolume: Float(r.to), timeRange: CMTimeRange(start: start, end: end))
      drawnTo = end
    }
  }

  /// A request clip's speed curve as the maths uses it (unplayable spans dropped); empty for a constant-speed clip.
  static func speedSpans(_ c: ExportClip) -> [SpeedSpan] {
    let spans: [SpeedSpan] = c.speedSpans.map { (s: ExportSpeedSpan) -> SpeedSpan in
      SpeedSpan(duration: s.duration, speed: s.speed)
    }
    return SpeedSpans.usable(spans)
  }

  /// The cut points for retiming source `[from.source, to.source]` onto composition `[from.output, to.output]`, cut
  /// at `interior` (in order). A cut is kept only when it lies strictly after the previous kept cut and strictly
  /// before the end, in source AND in output time — so no piece is empty (a span that rounds to nothing, or one
  /// outside this insert, joins its neighbour) and the first / last cut are always exactly the given ends.
  static func retimeCuts(from: (source: CMTime, output: CMTime), to: (source: CMTime, output: CMTime),
                         interior: [(source: CMTime, output: CMTime)]) -> RetimeCuts {
    var source: [CMTime] = [from.source]
    var output: [CMTime] = [from.output]
    for cut in interior {
      guard let lastSource = source.last, let lastOutput = output.last else { break }
      guard CMTimeCompare(cut.source, lastSource) > 0, CMTimeCompare(cut.output, lastOutput) > 0,
            CMTimeCompare(cut.source, to.source) < 0, CMTimeCompare(cut.output, to.output) < 0 else { continue }
      source.append(cut.source)
      output.append(cut.output)
    }
    source.append(to.source)
    output.append(to.output)
    return RetimeCuts(source: source, output: output)
  }

  /// Where source time `t` lands in the composition: on a cut exactly that cut's output time, between two cuts in
  /// proportion; before the first / after the last cut, that cut's output time.
  static func retimedTime(_ t: CMTime, cuts: RetimeCuts) -> CMTime {
    let n = min(cuts.source.count, cuts.output.count)
    guard n >= 2 else { return cuts.output.first ?? .zero }
    if CMTimeCompare(t, cuts.source[0]) <= 0 { return cuts.output[0] }
    for j in 0..<(n - 1) where CMTimeCompare(t, cuts.source[j + 1]) < 0 {
      let length = (cuts.source[j + 1] - cuts.source[j]).seconds
      guard length > 0 else { return cuts.output[j] }
      let fraction = (t - cuts.source[j]).seconds / length
      return cuts.output[j] + time(fraction * (cuts.output[j + 1] - cuts.output[j]).seconds)
    }
    return cuts.output[n - 1]
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
  /// The text style (all numbers from `OverlayLayout`): letter spacing, line height and the stroke go into the
  /// attributed string; glow and shadow are tinted copies of the text layer below it, each casting a layer shadow;
  /// the opacity multiplies the visibility / motion opacity; a caption's spoken words are copies above it, one per
  /// word. Every one of those is guarded, so a text with the neutral style and no words builds the container and
  /// the one text layer it always built.
  /// The background box: its padding (`l.padding`) and its corner radius (`l.boxRadius`) are the layout's — the default
  /// style gives the box every text had (a quarter of the font size, corners half of that).
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
    // Extra space after every glyph, in pixels (React Native's letterSpacing does the same, the last glyph included).
    if l.letterSpacing != 0 { attrs[key(kCTKernAttributeName)] = NSNumber(value: Double(l.letterSpacing)) }
    if o.outline, l.fontSize > 0 {
      // Negative stroke width (percent of the font size) = stroke AND fill, so a single layer draws outlined text.
      attrs[key(kCTStrokeWidthAttributeName)] = NSNumber(value: Double(-(l.outlineWidth / l.fontSize * 100)))
      attrs[key(kCTStrokeColorAttributeName)] = UIColor(hex: l.outlineColor).cgColor
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
    container.position = overlayPosition(x: o.x, y: o.y, renderSize: renderSize)   // = (l.centerX, H − l.centerY)
    if let bg = o.backgroundColor {
      container.backgroundColor = UIColor(hex: bg).withAlphaComponent(CGFloat(o.backgroundOpacity)).cgColor
      container.cornerRadius = l.boxRadius
    }

    // Every text layer of this overlay: the same frame, alignment and wrapping, so the copies sit exactly on the fill.
    func textCopy(_ string: NSAttributedString) -> CATextLayer {
      let layer = CATextLayer()
      layer.string = string
      layer.alignmentMode = mode
      layer.isWrapped = true
      layer.truncationMode = .none
      layer.contentsScale = 1                         // render size is already in pixels
      layer.frame = CGRect(x: pad, y: pad, width: w, height: h)
      return layer
    }
    // The same text with its fill AND its stroke in one colour, so a copy shows no glyph in another colour.
    func tinted(_ hex: String) -> NSAttributedString {
      let tint = UIColor(hex: hex).cgColor
      var copy = attrs
      copy[key(kCTForegroundColorAttributeName)] = tint
      if copy[key(kCTStrokeColorAttributeName)] != nil { copy[key(kCTStrokeColorAttributeName)] = tint }
      return NSAttributedString(string: o.text, attributes: copy)
    }

    let textLayer = textCopy(string)
    container.addSublayer(textLayer)

    // Glow and shadow: a layer's shadow is cast by what the layer draws, so each is a copy of the text in the
    // glow / shadow colour, below the fill (bottom to top: glow, shadow, fill, as the preview stacks them).
    // `shadowRadius` is the blur's standard deviation, about half of a blur given as a radius, hence the `/ 2`
    // (to be tuned against the preview on the first build).
    // Off the default path the container holds several layers that overlap; group opacity makes a see-through or
    // fading text fade as ONE picture (the copies do not show through each other). A default text never sets it.
    if let glow = l.glow, glow.radius > 0 {
      container.allowsGroupOpacity = true
      let halo = textCopy(tinted(glow.color))
      halo.shadowColor = UIColor(hex: glow.color).cgColor
      halo.shadowOpacity = 1
      halo.shadowRadius = glow.radius / 2
      halo.shadowOffset = .zero
      container.insertSublayer(halo, below: textLayer)
    }
    if let shadow = l.shadow, shadow.opacity > 0 {
      container.allowsGroupOpacity = true
      // The layer's own opacity carries the shadow's strength: it fades the copy's glyphs and the shadow they cast
      // together. The layout's offset is y-down (top-left origin); this layer space is y-up, so `dy` is negated.
      let cast = textCopy(tinted(shadow.color))
      cast.opacity = Float(shadow.opacity)
      cast.shadowColor = UIColor(hex: shadow.color).cgColor
      cast.shadowOpacity = 1
      cast.shadowRadius = shadow.blur / 2
      cast.shadowOffset = CGSize(width: shadow.dx, height: -shadow.dy)
      container.insertSublayer(cast, below: textLayer)
    }

    // Word highlight: for each spoken word a copy of the fill text with that word in the highlight colour, above
    // the fill, shown only while the word is spoken (composition time). The caption itself stays underneath.
    // Captions never have motion, so the visibility animation is all a word layer needs.
    if o.kind == "caption", let highlight = o.highlightColor, !o.words.isEmpty {
      container.allowsGroupOpacity = true
      let spans = CaptionWords.spans(text: o.text, words: o.words.map { (text: $0.text, start: $0.start, end: $0.end) }, start: o.start, end: o.end)
      for span in spans {
        let lit = NSMutableAttributedString(attributedString: string)
        lit.addAttribute(key(kCTForegroundColorAttributeName), value: UIColor(hex: highlight).cgColor, range: span.range)
        let wordLayer = textCopy(lit)
        container.addSublayer(wordLayer)
        addVisibility(wordLayer, start: span.start, end: span.end)
      }
    }

    container.transform = overlayTransform(scale: 1, rotation: l.rotation)
    let shown = Double(l.opacity)                     // the text style's opacity, on top of visibility / motion
    if shown < 1 { container.allowsGroupOpacity = true }   // a see-through text over its own background bar
    if !addMotion(container, o, renderSize: renderSize, opacity: shown) { addVisibility(container, start: o.start, end: o.end, opacity: shown) }
    return container
  }

  /// A point given as fractions of the frame (top-left origin, y down — as the preview and `OverlayLayout` have it)
  /// in the export's layer space: render pixels with a BOTTOM-LEFT origin. The one place the overlays' y is flipped.
  static func overlayPosition(x: Double, y: Double, renderSize: CGSize) -> CGPoint {
    return CGPoint(x: CGFloat(x) * renderSize.width, y: renderSize.height - CGFloat(y) * renderSize.height)
  }

  /// An overlay layer's transform about its centre: `rotation` in degrees clockwise as seen on screen (negated,
  /// because the layer space is y-up) and a uniform `scale` on top of the size the layer was built at. Scale 1 is
  /// the rotation alone, exactly as the static layers always had it.
  static func overlayTransform(scale: CGFloat, rotation: CGFloat) -> CATransform3D {
    let turn = CATransform3DMakeRotation(-rotation * .pi / 180, 0, 0, 1)
    return scale == 1 ? turn : CATransform3DScale(turn, scale, scale, 1)
  }

  /// Hidden by default; the animation (opacity `opacity`: 1 unless a text style lowers it) only runs during
  /// [start, end) and is removed afterwards.
  static func addVisibility(_ layer: CALayer, start: Double, end: Double, opacity: Double = 1) {
    layer.opacity = 0
    let anim = CABasicAnimation(keyPath: "opacity")
    anim.fromValue = opacity
    anim.toValue = opacity
    anim.beginTime = max(start, AVCoreAnimationBeginTimeAtZero)   // 0 would mean "now", not the video's start
    anim.duration = end - start
    anim.fillMode = .removed
    anim.isRemovedOnCompletion = true
    layer.add(anim, forKey: "visible")
  }

  /// Motion for a text / sticker container built by the static path (same content, bounds and anchor): instead of
  /// the visibility animation, three keyframe animations — position, transform (scale + rotation) and opacity —
  /// sampled from `Motion.resolveOverlay` 30 times per second over [start, end). False (nothing added, the caller
  /// uses `addVisibility`) when the overlay has no animation and no pins, or its samples cannot be used.
  /// Timing mirrors `addVisibility`: the model opacity is 0 and the fill mode is `.removed`, so the layer shows
  /// only while the animations are active. `isRemovedOnCompletion` is false, as AVFoundation asks of animations
  /// given to the video composition's animation tool; with `.removed` a finished animation has no effect.
  /// Scale: the overlay's own scale is baked into the layer's font size / box, so each sample applies the RATIO
  /// `sample.scale / o.scale`; the content sublayers are drawn at the largest ratio (`contentsScale`) so scaling up
  /// stays sharp without changing the layout. `opacity` (a text style's, else 1) multiplies every opacity sample.
  static func addMotion(_ layer: CALayer, _ o: ExportOverlay, renderSize: CGSize, opacity: Double = 1) -> Bool {
    guard OverlayMotion.hasMotion(o) else { return false }
    let samples = OverlayMotion.samples(start: o.start, end: o.end, fps: OverlayMotion.fps, resolve: OverlayMotion.resolver(o))
    guard samples.count >= 2, OverlayMotion.allFinite(samples) else { return false }
    let length = o.end - o.start
    let keyTimes: [NSNumber] = samples.map { (s: (time: Double, values: KeyValues)) -> NSNumber in
      NSNumber(value: min(1, max(0, s.time / length)))
    }
    let positions: [Any] = samples.map { (s: (time: Double, values: KeyValues)) -> Any in
      NSValue(cgPoint: overlayPosition(x: s.values.x, y: s.values.y, renderSize: renderSize))
    }
    let transforms: [Any] = samples.map { (s: (time: Double, values: KeyValues)) -> Any in
      NSValue(caTransform3D: overlayTransform(scale: CGFloat(OverlayMotion.scaleRatio(s.values.scale, base: o.scale)), rotation: CGFloat(s.values.rotation)))
    }
    let opacities: [Any] = samples.map { (s: (time: Double, values: KeyValues)) -> Any in
      NSNumber(value: s.values.opacity * opacity)
    }

    let sharp = CGFloat(OverlayMotion.contentScale(samples, base: o.scale))
    if sharp > 1 {
      for content in layer.sublayers ?? [] { content.contentsScale = sharp }
    }

    layer.opacity = 0
    func add(_ keyPath: String, _ values: [Any]) {
      let anim = CAKeyframeAnimation(keyPath: keyPath)
      anim.values = values
      anim.keyTimes = keyTimes
      anim.calculationMode = .linear
      anim.beginTime = max(o.start, AVCoreAnimationBeginTimeAtZero)   // 0 would mean "now", not the video's start
      anim.duration = o.end - o.start
      anim.fillMode = .removed
      anim.isRemovedOnCompletion = false
      layer.add(anim, forKey: "motion." + keyPath)
    }
    add("position", positions)
    add("transform", transforms)
    add("opacity", opacities)
    return true
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
    container.position = overlayPosition(x: o.x, y: o.y, renderSize: renderSize)
    container.transform = overlayTransform(scale: 1, rotation: CGFloat(o.rotation))
    if !addMotion(container, o, renderSize: renderSize) { addVisibility(container, start: o.start, end: o.end) }
    return container
  }

  /// Text and captions use the Phase 2 text path; stickers use `stickerLayer`. Empty ones are skipped. A text or
  /// sticker with an animation or pins gets `addMotion` in place of the visibility animation.
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

  /// Loads one clip's (or layer's) asset and clamps its trim to the source. Throws when the file has no video
  /// track, cannot be read, or the clamped range is empty.
  private static func load(_ clip: ExportClip, renderSize: CGSize) async throws -> LoadedClip {
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
    // A speed curve: its spans made to cover exactly the clamped range (the real file may be shorter than the app
    // believed). No spans → constant speed, exactly as before.
    let spans = SpeedSpans.fitted(Self.speedSpans(clip), to: end - start)
    let outDur = spans.isEmpty ? Self.time((end - start) / speed) : Self.time(SpeedSpans.outputSeconds(spans))
    guard CMTimeCompare(outDur, .zero) > 0 else { throw ExportError.sessionFailed("Clip range is empty: \(clip.sourceUri)") }
    let srcAudio = try await asset.loadTracks(withMediaType: .audio).first
    var audioRange: CMTimeRange? = nil
    if let srcAudio { audioRange = try? await srcAudio.load(.timeRange) }
    return LoadedClip(
      asset: asset, clip: clip, srcVideo: srcVideo, srcAudio: srcAudio, audioRange: audioRange,
      transform: Self.ciFillTransform(preferredTransform: preferredTransform, naturalSize: naturalSize, renderSize: renderSize),
      orient: Self.ciOrientTransform(preferredTransform: preferredTransform, naturalSize: naturalSize),
      start: start, end: end, sourceEnd: CMTimeMinimum(duration, videoRange.end),
      speed: speed, spans: spans, outDur: outDur)
  }

  /// How much earlier than the clip's copy the original's picture may end, in seconds, and still be used for the
  /// blurred background (the original is then read to its own end): a copy's picture runs to the end of the FILE,
  /// the original's picture track can stop a few frames before that.
  static let backdropSlack: Double = 0.5

  /// Loads the file a clip's blurred background is made from (`ExportBackdrop`). Nil — that clip's background is then
  /// made from its own picture, as it always was — when the file has no picture or cannot be read. Never throws.
  private static func loadBackdrop(_ uri: String, renderSize: CGSize) async -> LoadedBackdrop? {
    guard let url = URL(string: uri) else { return nil }
    let asset = AVURLAsset(url: url)
    do {
      guard let video = try await asset.loadTracks(withMediaType: .video).first else { return nil }
      let (preferredTransform, naturalSize, videoRange) = try await video.load(.preferredTransform, .naturalSize, .timeRange)
      let duration = try await asset.load(.duration)
      let shown = naturalSize.applying(preferredTransform)
      guard shown.width.isFinite, shown.height.isFinite, abs(shown.width) >= 1, abs(shown.height) >= 1 else { return nil }
      return LoadedBackdrop(
        asset: asset, video: video,
        fill: Self.ciFillTransform(preferredTransform: preferredTransform, naturalSize: naturalSize, renderSize: renderSize),
        sourceEnd: CMTimeMinimum(duration, videoRange.end))
    } catch {
      return nil
    }
  }

  func start(_ request: ExportRequest) async throws {
    guard let outputURL = Self.fileURL(from: request.outputPath) else { throw ExportError.badOutputPath }
    guard !request.clips.isEmpty else { throw ExportError.sessionFailed("Nothing to export") }
    let renderSize = Self.renderSize(aspect: Self.aspectValue(aspect: request.aspectRatio, frameAspect: request.frameAspect), resolution: request.resolution)
    let fps = Self.frameRate(for: request.fps)       // 30 unless the request asks for 24 or 60

    // 0. Pre-pass: photos → video, reversed clips → reversed copies, in a per-export temp folder. The folder is
    //    removed when this function exits (failure, cancel) unless the export was handed off, in which case the
    //    export's completion handler removes it once AVAssetExportSession has finished reading the files.
    //    Layers are prepared like clips (as clip records; their starts are kept beside them). A layer that cannot
    //    be prepared is left out of the video; a clip that cannot be prepared fails the export, as before.
    var layers: [ExportClip] = request.layers.map { (l: ExportLayer) -> ExportClip in l.clip }
    let layerStarts: [Double] = request.layers.map { (l: ExportLayer) -> Double in l.start }
    var unpreparedLayers = Set<Int>()
    let jobs = MediaPrePass.plan(request.clips, layers: layers)
    let hasJobs = !jobs.isEmpty
    var clips = request.clips
    var prepFolder: URL? = nil
    var handedOff = false
    defer { if !handedOff, let prepFolder { MediaPrePass.removeFolder(prepFolder) } }
    if hasJobs {
      // The folder cannot be made: a clip that needs it fails the export, as before. When only layers need it they
      // are left out of the video (like any layer that cannot be prepared) and the export goes on without a folder.
      var folder: URL? = nil
      do { folder = try MediaPrePass.makeFolder(exportId: id) } catch {
        guard jobs.allSatisfy({ $0.layer }) else { throw MediaPrePass.failure(for: jobs[0].kind) }
        for job in jobs { unpreparedLayers.insert(job.clipIndex) }
      }
      prepFolder = folder
      if let folder {
        for (j, job) in jobs.enumerated() {
          if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
          let prepared = folder.appendingPathComponent("\(j)-\(job.kind == .photo ? "photo" : "reverse").mp4")
          var lastSent = -1.0
          let report: (Double) -> Void = { fraction in
            let p = MediaPrePass.prePassProgress(job: j, jobCount: jobs.count, fraction: fraction)
            guard p - lastSent >= 0.005 else { return }   // at most ~40 progress events for the whole pre-pass
            lastSent = p
            self.onEvent(["jobId": self.id, "type": "progress", "progress": p])
          }
          let input = job.layer ? layers[job.clipIndex] : clips[job.clipIndex]
          do {
            let seconds = try await MediaPrePass.run(job, clip: input, to: prepared, renderSize: renderSize,
                                                     isCancelled: { self.cancelledFlag }, progress: report)
            let rewritten = MediaPrePass.rewrite(input, preparedURL: prepared, duration: seconds)
            if job.layer { layers[job.clipIndex] = rewritten } else { clips[job.clipIndex] = rewritten }
          } catch is PrePassCancelled {
            onEvent(["jobId": id, "type": "cancelled"]); return
          } catch {
            guard job.layer else { throw error }
            unpreparedLayers.insert(job.clipIndex)
          }
        }
      }
    }

    // 1. Load every clip first: a transition window is clamped against the NEXT clip's output duration.
    //    A prepared clip has no audio track; that is handled like any silent source (no audio inserted).
    var loaded: [LoadedClip] = []
    // Every source asset, kept until the export has finished (a track's `asset` is a weak reference).
    var sourceAssets: [AVAsset] = []
    for clip in clips {
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      let one: LoadedClip
      do { one = try await Self.load(clip, renderSize: renderSize) }
      catch { throw ExportError.sessionFailed("load clip \(loaded.count): " + ExportSession.describe(error)) }
      loaded.append(one)
      sourceAssets.append(one.asset)
    }
    let n = loaded.count

    // 1b. Blur backgrounds made from another file than the clip's own (`ExportBackdrop`: a cut-out copy is
    //     see-through, so its own blur is a silhouette). A video is loaded here and laid on a track of its own beside
    //     the clip in step 3; a photo is decoded once, as a still. One that cannot be used is left out: that clip's
    //     background is then made from its own picture, as it always was. Without such a clip nothing here runs.
    var backdropSources: [Int: LoadedBackdrop] = [:]
    var backdropStills: [Int: LayerBackdrop] = [:]
    var backdropTracks: [Int: CMPersistentTrackID] = [:]
    for (i, one) in loaded.enumerated() {
      guard let asked = one.clip.backdrop, one.clip.background.type == "blur" else { continue }
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      if asked.kind == "photo" {
        if let image = MediaPrePass.uprightPhoto(asked.uri, maxPixels: Int(max(renderSize.width, renderSize.height))),
           let still = LayerBackdrop.photo(image, renderSize: renderSize) {
          backdropStills[i] = still
        }
      } else if let found = await Self.loadBackdrop(asked.uri, renderSize: renderSize) {
        backdropSources[i] = found
        sourceAssets.append(found.asset)
      }
    }

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
    var audioUsed: [Bool] = [false, false]         // the clip audio track holds at least one clip's sound
    var audioRamps: [[GainRamp]] = [[], []]        // each clip's gain curve as ramps over its own audio range, in clip order
    var placed: [PlacedClip] = []
    var cursor = CMTime.zero
    let holdFrame = CMTime(value: 1, timescale: ExportSession.frameRate)

    /// Appends `source` at `a` and retimes it to end exactly at `b` (speed). Every insert lands at or after the
    /// track's current end, so nothing already on the track shifts. False when there is nothing to insert.
    func insertScaled(_ track: AVMutableCompositionTrack, _ source: CMTimeRange, of srcTrack: AVAssetTrack, from a: CMTime, to b: CMTime) throws -> Bool {
      guard CMTimeCompare(b, a) > 0, CMTimeCompare(source.duration, .zero) > 0 else { return false }
      do { try track.insertTimeRange(source, of: srcTrack, at: a) }
      catch { throw ExportError.sessionFailed("insert [asset \(srcTrack.asset == nil ? "gone" : "alive")]: " + ExportSession.describe(error)) }
      let target = b - a
      if CMTimeCompare(source.duration, target) != 0 {
        track.scaleTimeRange(CMTimeRange(start: a, duration: source.duration), toDuration: target)
      }
      return true
    }

    /// Inserts source `[cuts.source.first, cuts.source.last]` at `cuts.output.first` and retimes it piece by piece
    /// (a speed curve) so that every cut lands on its output time and the insert ends exactly at `cuts.output.last`.
    /// The pieces are scaled from the LAST to the first: scaling a piece moves only what comes after it, so the
    /// pieces still to be scaled are where they were inserted (piece j at `first output + (source[j] − source[0])`).
    /// Like `insertScaled`, the insert lands at or after the track's current end. False when there is nothing to insert.
    func insertRetimed(_ track: AVMutableCompositionTrack, of srcTrack: AVAssetTrack, cuts: RetimeCuts) throws -> Bool {
      let pieces = min(cuts.source.count, cuts.output.count) - 1
      guard pieces >= 1 else { return false }
      let sourceStart = cuts.source[0], sourceEnd = cuts.source[pieces]
      let at = cuts.output[0]
      guard CMTimeCompare(sourceEnd, sourceStart) > 0, CMTimeCompare(cuts.output[pieces], at) > 0 else { return false }
      do { try track.insertTimeRange(CMTimeRange(start: sourceStart, end: sourceEnd), of: srcTrack, at: at) }
      catch { throw ExportError.sessionFailed("insert retimed [asset \(srcTrack.asset == nil ? "gone" : "alive")]: " + ExportSession.describe(error)) }
      for j in stride(from: pieces - 1, through: 0, by: -1) {
        let length = cuts.source[j + 1] - cuts.source[j]
        let target = cuts.output[j + 1] - cuts.output[j]
        if CMTimeCompare(length, target) != 0 {
          track.scaleTimeRange(CMTimeRange(start: at + (cuts.source[j] - sourceStart), duration: length), toDuration: target)
        }
      }
      return true
    }

    /// The blurred-background file of clip `i` (step 1b), laid on a video track of its own over exactly the clip's
    /// stretch [clipStart, clipEnd): the same source times at the same composition times as the clip's own picture
    /// (`cuts` are the cuts the clip was inserted with — the copy a clip plays has its original's timeline), and the
    /// same held edge frame where a handle was clamped. The original is read to its own end at most (`backdropSlack`).
    /// Whatever fails, the track is taken out again and the clip's background is made from its own picture, as it
    /// always was: this never fails an export. Without a loaded file for `i` nothing is done.
    func placeBackdrop(_ i: Int, cuts: RetimeCuts, edge: CMTime, from clipStart: CMTime, to clipEnd: CMTime) {
      let pieces = min(cuts.source.count, cuts.output.count) - 1
      guard let back = backdropSources[i], pieces >= 1 else { return }
      let sourceStart = cuts.source[0], mainStart = cuts.output[0], mainEnd = cuts.output[pieces]
      let sourceEnd = CMTimeMinimum(cuts.source[pieces], back.sourceEnd)
      let short = (cuts.source[pieces] - sourceEnd).seconds
      guard CMTimeCompare(sourceEnd, sourceStart) > 0, short.isFinite, short <= ExportSession.backdropSlack,
            let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { return }
      var interior: [(source: CMTime, output: CMTime)] = []
      if pieces >= 2 {
        for j in 1..<pieces { interior.append((source: cuts.source[j], output: cuts.output[j])) }
      }
      let own = ExportSession.retimeCuts(from: (source: sourceStart, output: mainStart), to: (source: sourceEnd, output: mainEnd), interior: interior)
      let held = CMTimeMinimum(edge, sourceEnd - sourceStart)
      do {
        _ = try insertScaled(track, CMTimeRange(start: sourceStart, duration: held), of: back.video, from: clipStart, to: mainStart)
        let laid = try insertRetimed(track, of: back.video, cuts: own)
        guard laid else { composition.removeTrack(track); return }
        _ = try insertScaled(track, CMTimeRange(start: sourceEnd - held, duration: held), of: back.video, from: mainEnd, to: clipEnd)
        backdropTracks[i] = track.trackID
      } catch {
        composition.removeTrack(track)
      }
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

      // A speed curve: the same placement as below, with the main insert retimed span by span instead of once.
      // A clip without spans skips this block and takes the constant-speed code after it, untouched.
      if let firstSpan = c.spans.first, let lastSpan = c.spans.last {
        // Handles in source seconds, at the speed of the nearest edge span, clamped to the source.
        let head = max(0, min(halfIn.seconds * firstSpan.speed, c.start))
        let tail = max(0, min(halfOut.seconds * lastSpan.speed, c.sourceEnd.seconds - c.end))
        let plan = SpeedSpans.plan(c.spans, head: head, tail: tail)
        let source = CMTimeRange(start: Self.time(c.start - head), end: CMTimeMinimum(Self.time(c.end + tail), c.sourceEnd))
        guard CMTimeCompare(source.duration, .zero) > 0 else { throw ExportError.sessionFailed("Clip range is empty: \(c.clip.sourceUri)") }
        // Real material covers [mainStart, mainEnd): the handles after retiming, never more than the window half.
        let mainStart = CMTimeMaximum(clipStart, bodyStart - CMTimeMinimum(Self.time(plan.bodyStart), halfIn))
        let mainEnd = CMTimeMinimum(clipEnd, bodyEnd + CMTimeMinimum(Self.time(plan.tailLength), halfOut))
        // Every cut between two spans: its source time counted from the inserted range's start, its output time
        // from `bodyStart` — so the clip's own range stays [bodyStart, bodyEnd) (bodyEnd = bodyStart + outDur and
        // outDur is the spans' total), whatever the handles round to.
        let interior: [(source: CMTime, output: CMTime)] = plan.ranges.dropFirst().map { (r: SpeedRange) -> (source: CMTime, output: CMTime) in
          (source: source.start + ExportSession.time(r.start), output: bodyStart + ExportSession.time(r.outputStart))
        }
        let cuts = Self.retimeCuts(from: (source: source.start, output: mainStart), to: (source: source.end, output: mainEnd), interior: interior)
        // Clamped handles hold the edge frame, as for a constant-speed clip.
        let edge = CMTimeMinimum(holdFrame, source.duration)
        _ = try insertScaled(track, CMTimeRange(start: source.start, duration: edge), of: c.srcVideo, from: clipStart, to: mainStart)
        _ = try insertRetimed(track, of: c.srcVideo, cuts: cuts)
        _ = try insertScaled(track, CMTimeRange(start: source.end - edge, duration: edge), of: c.srcVideo, from: mainEnd, to: clipEnd)
        videoEnd[k] = clipEnd
        placeBackdrop(i, cuts: cuts, edge: edge, from: clipStart, to: clipEnd)

        // Clip audio, cut at the same points as the video: the part of the source the audio track covers, with its
        // ends mapped through the video's cuts (exactly mainStart / mainEnd when the audio covers the whole range).
        if let srcAudio = c.srcAudio, let audioRange = c.audioRange, let audioTrack = audioTracks[k] {
          let shared = CMTimeRangeGetIntersection(source, otherRange: audioRange)
          if CMTimeCompare(shared.duration, .zero) > 0 {
            let aStart = CMTimeMaximum(Self.retimedTime(shared.start, cuts: cuts), audioEnd[k])
            let aEnd = CMTimeMinimum(Self.retimedTime(shared.end, cuts: cuts), mainEnd)
            let audioCuts = Self.retimeCuts(from: (source: shared.start, output: aStart), to: (source: shared.end, output: aEnd), interior: interior)
            if (try? insertRetimed(audioTrack, of: srcAudio, cuts: audioCuts)) == true {
              audioEnd[k] = aEnd
              // The clip's gain curve at `bodyStart + time`, over exactly this clip's audio on the track (so the
              // ramps of two clips never overlap); in a transition handle the curve's first / last gain holds.
              audioUsed[k] = true
              audioRamps[k].append(contentsOf: AudioMix.ramps(from: Self.clipGain(c.clip), offset: bodyStart.seconds, over: aStart.seconds, to: aEnd.seconds))
            }
          }
        }

        placed.append(PlacedClip(trackID: track.trackID, bodyStart: bodyStart, bodyEnd: bodyEnd))
        cursor = bodyEnd                            // advance by outDur only — never by a handle
        continue
      }

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
      // A constant speed is one piece: the same helper then does what `insertScaled` did just above.
      placeBackdrop(i, cuts: RetimeCuts(source: [source.start, source.end], output: [mainStart, mainEnd]), edge: edge, from: clipStart, to: clipEnd)

      // Clip audio (handles included, so the two clips' sound overlaps across a transition), retimed like the video.
      if let srcAudio = c.srcAudio, let audioRange = c.audioRange, let audioTrack = audioTracks[k] {
        let shared = CMTimeRangeGetIntersection(source, otherRange: audioRange)
        if CMTimeCompare(shared.duration, .zero) > 0 {
          let outPerSource = (mainEnd - mainStart).seconds / source.duration.seconds
          let aStart = CMTimeMaximum(mainStart + Self.time((shared.start - source.start).seconds * outPerSource), audioEnd[k])
          let aEnd = CMTimeMinimum(mainStart + Self.time((shared.end - source.start).seconds * outPerSource), mainEnd)
          if (try? insertScaled(audioTrack, shared, of: srcAudio, from: aStart, to: aEnd)) == true {
            audioEnd[k] = aEnd
            // The clip's gain curve at `bodyStart + time`, over exactly this clip's audio on the track (so the ramps
            // of two clips never overlap); in a transition handle the curve's first / last gain holds.
            audioUsed[k] = true
            audioRamps[k].append(contentsOf: AudioMix.ramps(from: Self.clipGain(c.clip), offset: bodyStart.seconds, over: aStart.seconds, to: aEnd.seconds))
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
      if !audioUsed[k] { composition.removeTrack(audioTrack); continue }
      // Each clip's own-sound gain curve (volume, mute, fades) on the clip audio tracks.
      let params = AVMutableAudioMixInputParameters(track: audioTrack)
      Self.applyRamps(audioRamps[k], to: params)
      mixParams.append(params)
    }

    // Audio tracks (music, voice-overs, sound effects): one composition track each, the trimmed source placed at
    // `start` and clamped to the file's and the video's length, played with the request's gain curve (composition
    // seconds). A track that cannot be used fails the export, as a bad music file always did (except a video file
    // without sound, which is skipped): an invalid URI and a
    // file without an audio track throw `sessionFailed`, and a file that cannot be read throws AVFoundation's error.
    // The insert time and the source range are built on the millisecond grid (`audioTime`), so the pieces of a split
    // track are back to back to the sample; `total` and the file's duration keep their own timescales (the
    // comparisons and the subtraction below are exact across timescales). The gain ramps stay on the 1/600 s grid of
    // `applyRamps` (AudioMix merges breakpoints by that tick): a ramp's ends are within half such a tick (0.83 ms) of
    // the track's, on the track's own mix parameters, where the volume holds before the first and after the last ramp.
    for audio in request.audioTracks {
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      guard let audioURL = URL(string: audio.sourceUri) else { throw ExportError.sessionFailed("Invalid audio file URI: \(audio.sourceUri)") }
      let audioAsset = AVURLAsset(url: audioURL)
      sourceAssets.append(audioAsset)
      guard let srcAudio = try await audioAsset.loadTracks(withMediaType: .audio).first else {
        // A clip's sound put on the audio row (Extract audio) whose video turns out to have no sound: there is nothing
        // to mix, and that is not a failure. Any other file without sound still fails the export, as it always did.
        let pictures = (try? await audioAsset.loadTracks(withMediaType: .video)) ?? []
        if !pictures.isEmpty { continue }
        throw ExportError.sessionFailed("No sound in audio file \(audio.sourceUri)")
      }
      let assetDuration = try await audioAsset.load(.duration)
      let insertAt = Self.audioTime(max(0, audio.start))
      let srcEnd = CMTimeMinimum(Self.audioTime(max(0, audio.trimEnd)), assetDuration)
      let srcStart = CMTimeMinimum(Self.audioTime(max(0, audio.trimStart)), srcEnd)
      // length = min(trimEnd − trimStart, total − start); computed in CMTime so rounding never overshoots.
      let length = CMTimeMinimum(CMTimeSubtract(srcEnd, srcStart), CMTimeSubtract(total, insertAt))
      guard CMTimeCompare(length, .zero) > 0,
            let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
      try track.insertTimeRange(CMTimeRange(start: srcStart, duration: length), of: srcAudio, at: insertAt)
      // Flat at the curve's first / last gain outside its breakpoints; a request without a curve plays at gain 1.
      let params = AVMutableAudioMixInputParameters(track: track)
      Self.applyRamps(AudioMix.ramps(from: Self.gainPoints(audio.gain, fallback: 1), offset: 0, over: insertAt.seconds, to: (insertAt + length).seconds), to: params)
      mixParams.append(params)
    }

    // Layers (picture in picture), in draw order: each on a video track of its own, placed at its `start` with no
    // transition handles, retimed with the clips' helper (a constant speed is a single span, so `insertRetimed`
    // then does what `insertScaled` does) and cut at the end of the video — a layer may run past it. A layer whose
    // file cannot be used, or that starts before 0 or at / after the end of the video, is left out. Its sound goes on an audio
    // track of its own, cut at the same points, with its gain curve counted from the layer's start (a prepared
    // photo / reversed file has no sound). Without layers nothing here runs.
    var placedLayers: [PlacedOverlay] = []
    for (i, layer) in layers.enumerated() {
      if cancelledFlag { onEvent(["jobId": id, "type": "cancelled"]); return }
      // A start before 0 is never sent (the editor keeps starts at 0 or later): such a layer is left out rather than moved.
      guard !unpreparedLayers.contains(i), layerStarts[i].isFinite, layerStarts[i] >= 0 else { continue }
      let at = Self.time(max(0, layerStarts[i]))
      guard CMTimeCompare(at, total) < 0, let c = try? await Self.load(layer, renderSize: renderSize) else { continue }
      sourceAssets.append(c.asset)
      let length = CMTimeMinimum(c.outDur, total - at)
      let end = at + length
      // The source played during `length`: all of it, or — when the layer is cut short — its spans up to the cut.
      let whole: [SpeedSpan] = c.spans.isEmpty ? [SpeedSpan(duration: c.end - c.start, speed: c.speed)] : c.spans
      let kept: [SpeedSpan] = CMTimeCompare(length, c.outDur) < 0
        ? SpeedSpans.fitted(whole, to: SpeedSpans.sourceSeconds(whole, output: length.seconds))
        : whole
      var sourceLength = 0.0
      for s in kept { sourceLength += s.duration }
      let source = CMTimeRange(start: Self.time(c.start), end: CMTimeMinimum(Self.time(c.start + sourceLength), c.sourceEnd))
      guard CMTimeCompare(length, .zero) > 0, CMTimeCompare(source.duration, .zero) > 0,
            let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
      // Every cut between two spans, counted from the layer's own first frame (no head handle).
      let plan = SpeedSpans.plan(kept, head: 0, tail: 0)
      let interior: [(source: CMTime, output: CMTime)] = plan.ranges.dropFirst().map { (r: SpeedRange) -> (source: CMTime, output: CMTime) in
        (source: source.start + ExportSession.time(r.start), output: at + ExportSession.time(r.outputStart))
      }
      let cuts = Self.retimeCuts(from: (source: source.start, output: at), to: (source: source.end, output: end), interior: interior)
      guard (try? insertRetimed(track, of: c.srcVideo, cuts: cuts)) == true else { composition.removeTrack(track); continue }

      if let srcAudio = c.srcAudio, let audioRange = c.audioRange {
        let shared = CMTimeRangeGetIntersection(source, otherRange: audioRange)
        if CMTimeCompare(shared.duration, .zero) > 0,
           let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
          let aStart = Self.retimedTime(shared.start, cuts: cuts)
          let aEnd = CMTimeMinimum(Self.retimedTime(shared.end, cuts: cuts), end)
          let audioCuts = Self.retimeCuts(from: (source: shared.start, output: aStart), to: (source: shared.end, output: aEnd), interior: interior)
          if (try? insertRetimed(audioTrack, of: srcAudio, cuts: audioCuts)) == true {
            // The layer's gain curve at `at + time`; flat at its first / last gain outside its breakpoints.
            let params = AVMutableAudioMixInputParameters(track: audioTrack)
            Self.applyRamps(AudioMix.ramps(from: Self.clipGain(c.clip), offset: at.seconds, over: aStart.seconds, to: aEnd.seconds), to: params)
            mixParams.append(params)
          } else {
            composition.removeTrack(audioTrack)
          }
        }
      }

      // How the compositor draws it. Motion is resolved against the layer's FULL length (`outDur`), as in the
      // preview: a layer cut by the end of the video simply stops, its Out animation is not moved earlier.
      let l = c.clip
      let spec = LayerSpec(
        trackID: track.trackID, fill: c.transform, orient: c.orient,
        crop: ClipCrop(x: CGFloat(l.crop.x), y: CGFloat(l.crop.y), w: CGFloat(l.crop.w), h: CGFloat(l.crop.h)),
        transform: ClipTransform(
          scale: CGFloat(l.transform.scale), x: CGFloat(l.transform.x), y: CGFloat(l.transform.y),
          rotation: CGFloat(l.transform.rotation), flipH: l.transform.flipH, flipV: l.transform.flipV),
        background: .black,
        filter: l.filter, filterIntensity: l.filterIntensity, adjust: l.adjust.values,
        opacity: l.opacity, mask: l.mask, transparent: true,
        blend: l.blend, chroma: ExportSession.chromaKey(l.chroma),
        motion: ExportSession.clipMotion(l), clipStart: at.seconds, clipLength: c.outDur.seconds)
      placedLayers.append(PlacedOverlay(spec: spec, range: CMTimeRange(start: at, end: end)))
    }

    // 4. Compositor instructions, contiguous over [0, total]: clip i alone on [bodyStart + halfIn, bodyEnd − halfOut),
    //    then the window around cut i, [bodyEnd − half, bodyEnd + half), with the outgoing and incoming layers.
    //    A layer also knows where its clip's own range sits in composition time — `bodyStart` (the cursor before the
    //    clip: no transition handle) and `outDur` (its length after speed) — so motion is resolved at clip-local time.
    /// What clip `i`'s Blur background is made from when that is not its own picture (step 1b): a photo's still, or
    /// the track its original was laid on. Nil for every other clip, and for one whose original could not be used.
    func backdropOf(_ i: Int) -> LayerBackdrop? {
      if let still = backdropStills[i] { return still }
      guard let back = backdropSources[i], let trackID = backdropTracks[i] else { return nil }
      return LayerBackdrop(trackID: trackID, fill: back.fill, still: nil)
    }
    func spec(_ i: Int) -> LayerSpec {
      let c = loaded[i].clip
      return LayerSpec(
        trackID: placed[i].trackID, fill: loaded[i].transform, orient: loaded[i].orient,
        crop: ClipCrop(x: CGFloat(c.crop.x), y: CGFloat(c.crop.y), w: CGFloat(c.crop.w), h: CGFloat(c.crop.h)),
        transform: ClipTransform(
          scale: CGFloat(c.transform.scale), x: CGFloat(c.transform.x), y: CGFloat(c.transform.y),
          rotation: CGFloat(c.transform.rotation), flipH: c.transform.flipH, flipV: c.transform.flipV),
        background: LayerBackground(type: c.background.type, color: c.background.color),
        filter: c.filter, filterIntensity: c.filterIntensity, adjust: c.adjust.values,
        opacity: c.opacity, mask: c.mask,
        chroma: ExportSession.chromaKey(c.chroma), backdrop: backdropOf(i),
        motion: ExportSession.clipMotion(c), clipStart: placed[i].bodyStart.seconds, clipLength: loaded[i].outDur.seconds)
    }
    //    Each instruction also carries the timeline effects overlapping its range (project time = composition time).
    let usableEffects = ActiveEffectSpec.usable(request.effects.map {
      ActiveEffectSpec(type: $0.type, start: $0.start, end: $0.end, intensity: $0.intensity, rect: ExportSession.effectRegion($0.rect))
    })
    func effects(in range: CMTimeRange) -> [ActiveEffectSpec] {
      return usableEffects.filter { $0.overlaps(from: range.start.seconds, to: range.end.seconds) }
    }
    var instructions: [AVVideoCompositionInstructionProtocol] = []
    for i in 0..<n {
      let soloStart = placed[i].bodyStart + (i > 0 ? halves[i - 1] : CMTime.zero)
      let soloEnd = placed[i].bodyEnd - halves[i]
      if CMTimeCompare(soloEnd, soloStart) > 0 {
        let solo = CMTimeRange(start: soloStart, end: soloEnd)
        instructions.append(ClipyInstruction(timeRange: solo, layers: [spec(i)], transition: nil, effects: effects(in: solo)))
      }
      if i < n - 1, CMTimeCompare(halves[i], .zero) > 0 {
        let window = CMTimeRange(start: placed[i].bodyEnd - halves[i], end: placed[i].bodyEnd + halves[i])
        instructions.append(ClipyInstruction(
          timeRange: window, layers: [spec(i), spec(i + 1)],
          transition: (type: loaded[i].clip.transition.type, start: window.start, duration: window.duration),
          effects: effects(in: window)))
      }
    }
    //    Layers: the instructions are cut at every layer start / end inside them and each piece lists the layers
    //    shown during it. Without layers the list stays exactly as built above.
    if !placedLayers.isEmpty { instructions = InstructionSplit.attach(placedLayers, to: instructions) }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.customVideoCompositorClass = ClipyCompositor.self
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: fps)
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
    // "Smaller file" only: a request with a bitrate above 0 caps the file's length. Without one (the default) the
    // limit is nil and the session's `fileLengthLimit` is never touched.
    let seconds = CMTimeGetSeconds(composition.duration)
    if let limit = Self.fileLengthLimit(bitrate: request.bitrate, seconds: seconds) { session.fileLengthLimit = limit }

    // First-build diagnostics: what was handed to the export, and what AVFoundation's own check says about it. Only
    // used in the message of a failed export.
    let check = CompositionCheck()
    let valid = (try? await videoComposition.isValid(for: composition, timeRange: CMTimeRange(start: .zero, duration: composition.duration), validationDelegate: check)) ?? false
    let videoTrackCount = composition.tracks(withMediaType: .video).count
    let audioTrackCount = composition.tracks(withMediaType: .audio).count
    let facts = "size \(Int(renderSize.width))x\(Int(renderSize.height)) fps \(fps) dur \(seconds) instr \(instructions.count) vtracks \(videoTrackCount) atracks \(audioTrackCount) overlays \(overlayLayers.count) mix \(mixParams.count) backdrops \(backdropTracks.count)/\(backdropSources.count) valid \(valid)"
      + (check.findings.isEmpty ? "" : " findings: " + check.findings.prefix(6).joined(separator: "; "))

    lock.lock()
    let cancelledBeforeExport = isCancelled
    if !cancelledBeforeExport { self.session = session }
    lock.unlock()
    if cancelledBeforeExport { onEvent(["jobId": id, "type": "cancelled"]); return }

    let jobId = id
    // How often the app had left when the render began: an export that fails after the app was away is INTERRUPTED.
    let leaves = leavesAtStart
    DispatchQueue.main.async {
      self.timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
        guard let self else { return }
        self.lock.lock(); let s = self.session; self.lock.unlock()
        guard let s, s.status == .waiting || s.status == .exporting else { return }
        self.onEvent(["jobId": jobId, "type": "progress", "progress": MediaPrePass.exportProgress(Double(s.progress), hasJobs: hasJobs)])
      }
    }
    // From here the export reads the prepared files asynchronously: its completion handler removes the folder.
    let folderToRemove = prepFolder
    handedOff = true
    let keepAlive = sourceAssets
    session.exportAsynchronously { [weak self] in
      withExtendedLifetime(keepAlive) {}
      if let folderToRemove { MediaPrePass.removeFolder(folderToRemove) }
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
        let message = ExportSession.describe(session.error) + " {" + facts + "}"
        self.onEvent(ExportInterruption.event(jobId: jobId, message: message, left: ExportPause.shared.hasLeft(since: leaves)))
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
