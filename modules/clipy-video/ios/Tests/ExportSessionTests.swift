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
}
