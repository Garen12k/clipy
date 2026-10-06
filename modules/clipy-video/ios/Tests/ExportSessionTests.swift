import AVFoundation
import UIKit
import XCTest
@testable import ClipyVideo

final class ExportSessionTests: XCTestCase {
  /// Writes a silent, solid-colour 640x360 H.264 clip at 30 fps.
  func makeClip(seconds: Double, color: UIColor) async throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).mp4")
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 640, AVVideoHeightKey: 360]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 640, kCVPixelBufferHeightKey as String: 360])
    writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
    let pool = try XCTUnwrap(adaptor.pixelBufferPool)
    let frames = Int(seconds * 30)
    for i in 0..<frames {
      while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
      var pb: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
      let buffer = try XCTUnwrap(pb)
      CVPixelBufferLockBaseAddress(buffer, [])
      let ctx = try XCTUnwrap(CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: 640, height: 360, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue))
      ctx.setFillColor(color.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: 640, height: 360))
      CVPixelBufferUnlockBaseAddress(buffer, [])
      XCTAssertTrue(adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 30)))
    }
    input.markAsFinished()
    await writer.finishWriting()
    XCTAssertEqual(writer.status, .completed, "\(String(describing: writer.error))")
    return url
  }

  /// Writes a 440 Hz mono AAC tone (.m4a) by feeding 16-bit PCM sample buffers to an AVAssetWriter.
  func makeTone(seconds: Double) async throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
    let sampleRate = 44100.0
    let writer = try AVAssetWriter(outputURL: url, fileType: .m4a)
    let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 1]
    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)

    let pcm = try XCTUnwrap(AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: sampleRate, channels: 1, interleaved: true))
    let formatDescription = pcm.formatDescription
    let totalFrames = Int(seconds * sampleRate)
    let chunk = 1024
    var frame = 0
    while frame < totalFrames {
      while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
      let count = min(chunk, totalFrames - frame)
      var samples = [Int16](repeating: 0, count: count)
      for i in 0..<count {
        samples[i] = Int16(sin(2 * Double.pi * 440 * Double(frame + i) / sampleRate) * 0.5 * Double(Int16.max))
      }
      let byteCount = count * MemoryLayout<Int16>.size
      var block: CMBlockBuffer?
      var status = CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: byteCount, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: byteCount, flags: 0, blockBufferOut: &block)
      XCTAssertEqual(status, 0)
      let blockBuffer = try XCTUnwrap(block)
      XCTAssertEqual(CMBlockBufferAssureBlockMemory(blockBuffer), 0)
      status = samples.withUnsafeBytes { bytes in
        CMBlockBufferReplaceDataBytes(with: bytes.baseAddress!, blockBuffer: blockBuffer, offsetIntoDestination: 0, dataLength: byteCount)
      }
      XCTAssertEqual(status, 0)
      var sample: CMSampleBuffer?
      status = CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: blockBuffer, formatDescription: formatDescription, sampleCount: count, presentationTimeStamp: CMTime(value: CMTimeValue(frame), timescale: CMTimeScale(sampleRate)), packetDescriptions: nil, sampleBufferOut: &sample)
      XCTAssertEqual(status, 0)
      let sampleBuffer = try XCTUnwrap(sample)
      XCTAssertTrue(input.append(sampleBuffer))
      frame += count
    }
    input.markAsFinished()
    await writer.finishWriting()
    XCTAssertEqual(writer.status, .completed, "\(String(describing: writer.error))")
    return url
  }

  private func gainPoint(_ time: Double, _ gain: Double) -> ExportGainPoint {
    var p = ExportGainPoint()
    p.time = time; p.gain = gain
    return p
  }

  func testExportsWithTextAndMusic() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let tone = try await makeTone(seconds: 2)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    var overlay = ExportOverlay()
    overlay.text = "Hi"; overlay.start = 0; overlay.end = 4
    request.overlays = [overlay]
    var audio = ExportAudioTrack()
    audio.sourceUri = tone.absoluteString; audio.start = 0; audio.trimStart = 0; audio.trimEnd = 2
    audio.gain = [gainPoint(0, 1), gainPoint(2, 1)]
    request.audioTracks = [audio]
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 4, accuracy: 0.2)
    let audioTracks = try await asset.loadTracks(withMediaType: .audio)
    XCTAssertFalse(audioTracks.isEmpty, "music should produce an audio track")
  }

  /// Music starting at 3 s in a 4 s video, as the app sends it: clipped to the video's end (1 s of music) with a gain
  /// curve fading over that second. The track still asks for 2 s, so the export clamps it to the video as well.
  func testExportsMusicClampedToVideoEndWithFade() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let tone = try await makeTone(seconds: 2)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    var audio = ExportAudioTrack()
    audio.sourceUri = tone.absoluteString; audio.start = 3; audio.trimStart = 0; audio.trimEnd = 2
    audio.gain = [gainPoint(3, 1), gainPoint(4, 0)]
    request.audioTracks = [audio]
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 4, accuracy: 0.2)
    let audioTracks = try await asset.loadTracks(withMediaType: .audio)
    XCTAssertFalse(audioTracks.isEmpty, "clamped music should still produce an audio track")
  }

  /// Several audio tracks at once (music with fades, a voice-over, a track with no curve at all) over clips that carry
  /// their own gain curves: every track becomes a composition track with its ramps, and the export completes.
  func testExportsSeveralAudioTracksWithGainCurves() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let music = try await makeTone(seconds: 4)
    let voice = try await makeTone(seconds: 1)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[0].gain = [gainPoint(0, 0), gainPoint(0.5, 1), gainPoint(2, 1)]
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    request.clips[1].gain = [gainPoint(0, 0), gainPoint(2, 0)]
    var ducked = ExportAudioTrack()
    ducked.sourceUri = music.absoluteString; ducked.start = 0; ducked.trimStart = 0; ducked.trimEnd = 4
    ducked.gain = [gainPoint(0, 0), gainPoint(0.5, 0.8), gainPoint(0.7, 0.8), gainPoint(1, 0.24), gainPoint(2, 0.24), gainPoint(2.3, 0.8), gainPoint(3, 0.8), gainPoint(4, 0)]
    var spoken = ExportAudioTrack()
    spoken.sourceUri = voice.absoluteString; spoken.start = 1; spoken.trimStart = 0; spoken.trimEnd = 1
    spoken.gain = [gainPoint(1, 1.5), gainPoint(2, 1.5)]
    var plain = ExportAudioTrack()
    plain.sourceUri = voice.absoluteString; plain.start = 2.5; plain.trimStart = 0.25; plain.trimEnd = 0.75
    request.audioTracks = [ducked, spoken, plain]
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 4, accuracy: 0.2)
    let audioTracks = try await asset.loadTracks(withMediaType: .audio)
    XCTAssertFalse(audioTracks.isEmpty, "the audio tracks should produce an audio track")
  }

  /// A bad audio file fails the export, as a bad music file always did.
  func testAnAudioTrackThatCannotBeLoadedFailsTheExport() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    var request = ExportRequest()
    request.clips = [ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    var silent = ExportAudioTrack()
    silent.sourceUri = a.absoluteString; silent.start = 0; silent.trimStart = 0; silent.trimEnd = 2   // a video without sound
    request.audioTracks = [silent]
    request.aspectRatio = "9:16"; request.resolution = 720
    request.outputPath = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4").absoluteString
    let session = ExportSession { _ in }
    do {
      try await session.start(request)
      XCTFail("a file without an audio track should fail the export")
    } catch {
      XCTAssertEqual((error as? ExportError)?.errorDescription, "No sound in audio file \(a.absoluteString)")
    }
  }

  func testExportsTwoClipsAt720pPortrait() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 4, accuracy: 0.2)
    let tracks = try await asset.loadTracks(withMediaType: .video)
    let track = try XCTUnwrap(tracks.first)
    let size = try await track.load(.naturalSize)
    XCTAssertEqual(size.width, 720, accuracy: 2); XCTAssertEqual(size.height, 1280, accuracy: 2)
  }

  func testSVGPathParsesShapes() throws {
    for (id, d) in Effects.shapePaths {
      XCTAssertNotNil(SVGPath.cgPath(from: d), "shape \(id) should parse")
    }
    let square = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["square"])))
    var points = 0
    square.applyWithBlock { element in
      switch element.pointee.type {
      case .moveToPoint, .addLineToPoint: points += 1
      default: break
      }
    }
    XCTAssertEqual(points, 4)
    XCTAssertNil(SVGPath.cgPath(from: "M0 0 A10 10 0 0 1 20 20"), "unsupported commands are rejected")
  }

  /// Frames and rings are one compound path: the inner subpath is wound the other way, so it is a hole under the
  /// shape layer's default non-zero rule — also after the export's vertical flip. Points are in the 100 × 100 box.
  func testCompoundShapesKeepTheirHoles() throws {
    XCTAssertEqual(Effects.shapePaths.count, 20)
    let ring = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["ring"])))
    XCTAssertTrue(ring.contains(CGPoint(x: 7, y: 50), using: .winding))        // in the band (x 0…14)
    XCTAssertFalse(ring.contains(CGPoint(x: 50, y: 50), using: .winding))      // the hole
    let frame = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["frameRounded"])))
    XCTAssertTrue(frame.contains(CGPoint(x: 6, y: 50), using: .winding))
    XCTAssertFalse(frame.contains(CGPoint(x: 50, y: 50), using: .winding))
    // As `stickerLayer` places it: scaled to a 200-px box and flipped to y-up.
    var flip = CGAffineTransform(a: 2, b: 0, c: 0, d: -2, tx: 0, ty: 200)
    let placed = try XCTUnwrap(ring.copy(using: &flip))
    XCTAssertTrue(placed.contains(CGPoint(x: 14, y: 100), using: .winding))
    XCTAssertFalse(placed.contains(CGPoint(x: 100, y: 100), using: .winding))
    // Subpaths wound the same way that overlap are a union, not a hole: the award's left tail under its disc.
    let award = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["badgeRibbon"])))
    XCTAssertTrue(award.contains(CGPoint(x: 34, y: 66), using: .winding))
    // Separate subpaths that do not touch: the thought bubble's two dots.
    let thought = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["bubbleThought"])))
    XCTAssertTrue(thought.contains(CGPoint(x: 24, y: 80), using: .winding))
    XCTAssertTrue(thought.contains(CGPoint(x: 9, y: 93), using: .winding))
    XCTAssertFalse(thought.contains(CGPoint(x: 40, y: 80), using: .winding))
  }

  /// Clip 1 (2 s at speed 2 → 1 s, warm, dissolve 0.5 s into clip 2) + clip 2 (2 s): 3 s total; neither source has
  /// handle material, so both edges of the transition are holds. Overlays: text, emoji sticker, heart shape.
  func testExportsWithEffects() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[0].speed = 2; request.clips[0].filter = "warm"
    var dissolve = ExportTransition()
    dissolve.type = "dissolve"; dissolve.duration = 0.5
    request.clips[0].transition = dissolve
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2

    var text = ExportOverlay()
    text.text = "Hi"; text.start = 0; text.end = 3
    var emoji = ExportOverlay()
    emoji.kind = "sticker"; emoji.emoji = "🔥"; emoji.x = 0.3; emoji.y = 0.3; emoji.start = 0; emoji.end = 2
    var heart = ExportOverlay()
    heart.kind = "sticker"; heart.shape = "heart"; heart.color = "#FF2D7A"; heart.x = 0.7; heart.y = 0.7; heart.rotation = 15
    heart.start = 1; heart.end = 3
    request.overlays = [text, emoji, heart]
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 3, accuracy: 0.2)
  }

  private func export(_ request: ExportRequest) async throws -> [String: Any] {
    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)
    return result
  }

  /// Picture-in-picture layers over a 3 s main clip: a see-through circle layer from 0.5 s to 2 s, a rounded layer
  /// with a speed curve that starts at 2 s and runs past the end (cut there), one that starts after the end and one
  /// whose file does not exist (both left out). The video keeps the main clip's length.
  func testExportsLayersOverTheMainVideo() async throws {
    let main = try await makeClip(seconds: 3, color: .red)
    let small = try await makeClip(seconds: 2, color: .blue)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip()]
    request.clips[0].sourceUri = main.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 3
    request.clips[0].opacity = 0.9; request.clips[0].mask = "rounded"

    func layer(start: Double, uri: String) -> ExportLayer {
      var l = ExportLayer()
      l.sourceUri = uri; l.trimStart = 0; l.trimEnd = 2; l.start = start
      var t = ExportClipTransform(); t.scale = 0.4; t.x = 0.2; t.y = -0.2; t.rotation = 15
      l.transform = t
      return l
    }
    var circle = layer(start: 0.5, uri: small.absoluteString)
    circle.trimEnd = 1.5; circle.opacity = 0.6; circle.mask = "circle"; circle.filter = "mono"
    var fadeIn = ExportAnimEdge(); fadeIn.id = "fade"; fadeIn.duration = 0.3
    circle.animIn = fadeIn
    var curved = layer(start: 2, uri: small.absoluteString)
    curved.mask = "rounded"
    var fast = ExportSpeedSpan(); fast.duration = 1; fast.speed = 2
    var slow = ExportSpeedSpan(); slow.duration = 1; slow.speed = 0.5
    curved.speedSpans = [fast, slow]                                // 2.5 s long from 2 s: cut at 3 s
    let late = layer(start: 3.5, uri: small.absoluteString)
    let missing = layer(start: 1, uri: "file:///no/such/layer.mp4")
    request.layers = [circle, curved, late, missing]
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let result = try await export(request)
    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 3, accuracy: 0.2)
    let video = try await asset.loadTracks(withMediaType: .video)
    XCTAssertEqual(video.count, 1)
  }

  /// A speed curve: clip 1 (2 s) plays its first second at ×2 and its second at ×0.5 → 0.5 + 2 = 2.5 s, with a 0.5 s
  /// dissolve into clip 2 (2 s, constant speed): 4.5 s in all. The spans the app sent cover 2.4 s — more than the
  /// file has — so the last span is shortened to fit.
  func testExportsAClipWithASpeedCurve() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    var fast = ExportSpeedSpan(); fast.duration = 1; fast.speed = 2
    var slow = ExportSpeedSpan(); slow.duration = 1.4; slow.speed = 0.5
    request.clips[0].speedSpans = [fast, slow]
    var dissolve = ExportTransition()
    dissolve.type = "dissolve"; dissolve.duration = 0.5
    request.clips[0].transition = dissolve
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 4.5, accuracy: 0.2)
  }

  /// The rates the app offers map to themselves; anything else exports at the default rate.
  func testFrameRateForARequest() {
    XCTAssertEqual(ExportSession.frameRates, [24, 30, 60])
    XCTAssertEqual(ExportSession.frameRate(for: 24), 24)
    XCTAssertEqual(ExportSession.frameRate(for: 30), 30)
    XCTAssertEqual(ExportSession.frameRate(for: 60), 60)
    for other in [25, 0, -1, 1000, Int.max, Int.min] {
      XCTAssertEqual(ExportSession.frameRate(for: other), 30, "\(other)")
    }
  }

  /// The default request (no `fps`, no `bitrate` — also a request from before they existed) takes the path the
  /// export always took: 30 frames per second and no file-length limit.
  func testTheDefaultRequestKeepsTheDefaultRateAndHasNoFileLengthLimit() {
    let request = ExportRequest()
    XCTAssertEqual(request.fps, 30)
    XCTAssertEqual(request.bitrate, 0)
    XCTAssertEqual(ExportSession.frameRate(for: request.fps), ExportSession.frameRate)
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: request.bitrate, seconds: 8))
  }

  /// "Smaller file": (video bitrate + audio allowance) × seconds / 8 bytes; no limit for a bitrate or a length that
  /// is 0, negative or not finite.
  func testFileLengthLimit() {
    XCTAssertEqual(ExportSession.audioAllowance, 256_000)
    XCTAssertEqual(ExportSession.fileLengthLimit(bitrate: 6_000_000, seconds: 8), 6_256_000)
    XCTAssertEqual(ExportSession.fileLengthLimit(bitrate: 6_000_000, seconds: 0.5), 391_000)
    XCTAssertEqual(ExportSession.fileLengthLimit(bitrate: 1, seconds: 1), 32_001)   // 256 001 / 8 = 32 000.125, rounded up
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: 6_000_000, seconds: 0))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: 6_000_000, seconds: -1))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: 0, seconds: 8))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: -6_000_000, seconds: 8))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: .nan, seconds: 8))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: .infinity, seconds: 8))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: 6_000_000, seconds: .nan))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: 6_000_000, seconds: .infinity))
    XCTAssertNil(ExportSession.fileLengthLimit(bitrate: .greatestFiniteMagnitude, seconds: 8))   // too large for Int64
  }

  /// Audio tracks are placed on a millisecond grid: every value the app stores (3 decimals) is a whole number of
  /// ticks, so the first piece of a split ends on exactly the tick the second starts on — in the video
  /// (`start + (cut − trimStart)`) and in the file (`cut`). On the 1/600 s grid some of these are a tick apart.
  func testAudioTrackTimesAreOnAMillisecondGrid() {
    XCTAssertEqual(ExportSession.audioTimescale, 1000)
    XCTAssertEqual(ExportSession.audioTime(1.234).value, 1234)
    XCTAssertEqual(ExportSession.audioTime(1.234).timescale, 1000)
    func r3(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }
    var holesAt600 = 0
    var cases = 0
    for i in 0..<22 {
      for j in 0..<10 {
        for k in 0..<22 {
          let start = r3(Double(i) * 0.137), trimStart = r3(Double(j) * 0.211)
          let cut = r3(trimStart + 0.3 + Double(k) * 0.173)
          let second = r3(start + (cut - trimStart))   // the second piece's start, as the app stores it
          cases += 1
          let firstEnd = CMTimeAdd(ExportSession.audioTime(start), CMTimeSubtract(ExportSession.audioTime(cut), ExportSession.audioTime(trimStart)))
          XCTAssertEqual(CMTimeCompare(firstEnd, ExportSession.audioTime(second)), 0, "\(start) \(trimStart) \(cut)")
          let oldEnd = CMTimeAdd(ExportSession.time(start), CMTimeSubtract(ExportSession.time(cut), ExportSession.time(trimStart)))
          if CMTimeCompare(oldEnd, ExportSession.time(second)) != 0 { holesAt600 += 1 }
        }
      }
    }
    XCTAssertGreaterThan(holesAt600, cases / 5)
    // Times of the two grids mix exactly: the video's length (1/600 s) less an audio start (1/1000 s).
    let left = CMTimeSubtract(ExportSession.time(4.5), ExportSession.audioTime(1.234))
    XCTAssertEqual(CMTimeCompare(left, CMTime(value: 9798, timescale: 3000)), 0)
    XCTAssertEqual(CMTimeCompare(CMTimeMinimum(ExportSession.audioTime(2), ExportSession.time(2.5)), ExportSession.audioTime(2)), 0)
  }

  /// The size for a request, as `start` computes it.
  private func size(_ aspect: String, _ frameAspect: Double, _ resolution: Int) -> CGSize {
    ExportSession.renderSize(aspect: ExportSession.aspectValue(aspect: aspect, frameAspect: frameAspect), resolution: resolution)
  }

  /// Every fixed ratio at every resolution: (id, resolution, width, height). The short side is the resolution and both
  /// sides are even; 9:16, 1:1 and 16:9 are exactly the sizes they always were. The same table is asserted for the
  /// TypeScript mirror in src/export/__tests__/renderSize.swift.test.ts, which also reads these rows.
  func testRenderSizeForEveryFixedRatio() {
    let rows: [(String, Int, Int, Int)] = [
      ("1:1", 720, 720, 720),
      ("1:1", 1080, 1080, 1080),
      ("1:1", 2160, 2160, 2160),
      ("3:2", 720, 1080, 720),
      ("3:2", 1080, 1620, 1080),
      ("3:2", 2160, 3240, 2160),
      ("2:3", 720, 720, 1080),
      ("2:3", 1080, 1080, 1620),
      ("2:3", 2160, 2160, 3240),
      ("16:9", 720, 1280, 720),
      ("16:9", 1080, 1920, 1080),
      ("16:9", 2160, 3840, 2160),
      ("9:16", 720, 720, 1280),
      ("9:16", 1080, 1080, 1920),
      ("9:16", 2160, 2160, 3840),
      ("4:3", 720, 960, 720),
      ("4:3", 1080, 1440, 1080),
      ("4:3", 2160, 2880, 2160),
      ("3:4", 720, 720, 960),
      ("3:4", 1080, 1080, 1440),
      ("3:4", 2160, 2160, 2880),
      ("21:9", 720, 1680, 720),
      ("21:9", 1080, 2520, 1080),
      ("21:9", 2160, 4092, 1754),
    ]
    for row in rows {
      // The number is ignored for a "w:h" id, whatever it is — also when it is absent (0), as in an old request.
      for number in [0, 0.5625, 2.333333] {
        let s = size(row.0, number, row.1)
        XCTAssertEqual(s, CGSize(width: row.2, height: row.3), "\(row.0) at \(row.1) with \(number)")
        XCTAssertEqual(Int(s.width) % 2, 0); XCTAssertEqual(Int(s.height) % 2, 0)
      }
    }
  }

  /// The longer side is never above 4096 px, whichever way the frame is turned; 16:9 and 9:16 at 4K are under it.
  func testRenderSizeKeepsTheLongSideInsideTheEncoder() {
    XCTAssertEqual(ExportSession.maxLongSide, 4096)
    XCTAssertEqual(ExportSession.renderSize(aspect: 16.0 / 9.0, resolution: 2160), CGSize(width: 3840, height: 2160))
    XCTAssertEqual(ExportSession.renderSize(aspect: 9.0 / 16.0, resolution: 2160), CGSize(width: 2160, height: 3840))
    XCTAssertEqual(ExportSession.renderSize(aspect: 21.0 / 9.0, resolution: 2160), CGSize(width: 4092, height: 1754))
    XCTAssertEqual(ExportSession.renderSize(aspect: 9.0 / 21.0, resolution: 2160), CGSize(width: 1754, height: 4092))
    XCTAssertEqual(ExportSession.renderSize(aspect: 4096.0 / 2160.0, resolution: 2160), CGSize(width: 4096, height: 2160))
    XCTAssertEqual(ExportSession.renderSize(aspect: 2, resolution: 2160), CGSize(width: 4096, height: 2048))
    XCTAssertEqual(ExportSession.renderSize(aspect: 0.5, resolution: 2160), CGSize(width: 2048, height: 4096))
    XCTAssertEqual(ExportSession.renderSize(aspect: 21.0 / 9.0, resolution: 1080), CGSize(width: 2520, height: 1080))
    XCTAssertEqual(ExportSession.renderSize(aspect: 21.0 / 9.0, resolution: 720), CGSize(width: 1680, height: 720))
  }

  /// "auto": the string is not a ratio, so the number decides — (frameAspect, resolution, width, height).
  func testRenderSizeForAuto() {
    let rows: [(frameAspect: Double, Int, Int, Int)] = [
      (frameAspect: 0.5625, 1080, 1080, 1920),
      (frameAspect: 1.777778, 1080, 1920, 1080),
      (frameAspect: 1.333333, 1080, 1440, 1080),
      (frameAspect: 2.333333, 1080, 2520, 1080),
      (frameAspect: 2.333333, 2160, 4092, 1754),
      (frameAspect: 1.333333, 720, 960, 720),
    ]
    for row in rows {
      XCTAssertEqual(size("auto", row.frameAspect, row.1), CGSize(width: row.2, height: row.3), "\(row.frameAspect) at \(row.1)")
    }
    // The number is kept inside 9:21 … 21:9.
    XCTAssertEqual(ExportSession.aspectValue(aspect: "auto", frameAspect: 6), 21.0 / 9.0)
    XCTAssertEqual(ExportSession.aspectValue(aspect: "auto", frameAspect: 0.1), 9.0 / 21.0)
    // Any shape gives even sides inside the encoder's limit, portrait or landscape as the shape says.
    var a = ExportSession.aspectLimits.min
    while a <= ExportSession.aspectLimits.max {
      for resolution in [720, 1080, 2160] {
        let s = ExportSession.renderSize(aspect: a, resolution: resolution)
        XCTAssertEqual(Int(s.width) % 2, 0); XCTAssertEqual(Int(s.height) % 2, 0)
        XCTAssertLessThanOrEqual(((Int(s.width) + 15) / 16) * ((Int(s.height) + 15) / 16), MediaPrePass.maxMacroblocks)
        XCTAssertEqual(s.width >= s.height, a >= 1)
      }
      a += 0.0137
    }
  }

  /// A request from before `frameAspect` existed (the key is absent, so the record keeps its default) exports exactly
  /// as it did; a string that is no ratio and no number is a square, as an unknown ratio always was.
  func testAnOldRequestKeepsItsRenderSize() {
    let request = ExportRequest()
    XCTAssertEqual(request.aspectRatio, "9:16")
    XCTAssertEqual(request.frameAspect, 0)
    XCTAssertEqual(size(request.aspectRatio, request.frameAspect, request.resolution), CGSize(width: 1080, height: 1920))
    XCTAssertEqual(size("9:16", 0, 720), CGSize(width: 720, height: 1280))
    XCTAssertEqual(size("1:1", 0, 720), CGSize(width: 720, height: 720))
    XCTAssertEqual(size("16:9", 0, 720), CGSize(width: 1280, height: 720))
    for junk in ["auto", "", "wide", "16:", ":9", "0:9", "16:0", "-16:9", "a:b", "1:2:3", "inf:1", "nan:1"] {
      XCTAssertEqual(ExportSession.aspectValue(aspect: junk, frameAspect: 0), 1, junk)
      XCTAssertEqual(ExportSession.aspectValue(aspect: junk, frameAspect: .nan), 1, junk)
      XCTAssertEqual(ExportSession.aspectValue(aspect: junk, frameAspect: -2), 1, junk)
      XCTAssertEqual(size(junk, 0, 1080), CGSize(width: 1080, height: 1080), junk)
    }
    for bad in [0, -1, Double.nan, Double.infinity] {
      XCTAssertEqual(ExportSession.renderSize(aspect: bad, resolution: 1080), CGSize(width: 1080, height: 1080))
    }
  }
}
