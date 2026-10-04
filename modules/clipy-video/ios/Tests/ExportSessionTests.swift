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
    var audio = ExportAudio()
    audio.sourceUri = tone.absoluteString; audio.start = 0; audio.trimStart = 0; audio.trimEnd = 2; audio.volume = 1
    request.audio = audio
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

  /// Music starting at 3 s in a 4 s video: clamped to the video end (1 s of music) and faded out over that second.
  func testExportsMusicClampedToVideoEndWithFade() async throws {
    let a = try await makeClip(seconds: 2, color: .red)
    let b = try await makeClip(seconds: 2, color: .blue)
    let tone = try await makeTone(seconds: 2)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    var audio = ExportAudio()
    audio.sourceUri = tone.absoluteString; audio.start = 3; audio.trimStart = 0; audio.trimEnd = 2; audio.volume = 1
    request.audio = audio
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
}
