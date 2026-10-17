import CoreGraphics
import XCTest
@testable import ClipyVideo

/// Auto enhance's numbers: counting a bitmap, drawing a picture into sRGB, and the clamps.
final class FrameStatsTests: XCTestCase {
  private func solid(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1, width: Int = 8, height: Int = 4) -> CGImage {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(colorSpace: space, components: [r, g, b, a])!)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    return ctx.makeImage()!
  }

  func testCountsGammaValuesAndLeavesOutSeeThroughPixels() {
    // grey 153 (0.6), pure red, a see-through pixel, a half-covered red (64 of 128 = 0.5 once un-premultiplied).
    let data: [UInt8] = [153, 153, 153, 255, 255, 0, 0, 255, 0, 0, 0, 0, 64, 0, 0, 128]
    let s = FrameStats.count(data, pixels: 4)!
    XCTAssertEqual(s["pixels"] as? Int, 3)
    let h = s["histogram"] as! [Int]
    XCTAssertEqual(h.count, 64)
    XCTAssertEqual(h[38], 1)   // 0.6 × 64 = 38.4
    XCTAssertEqual(h[13], 1)   // 0.2126 × 64 = 13.6
    XCTAssertEqual(h[6], 1)    // 0.5 × 0.2126 × 64 = 6.8
    XCTAssertEqual(h.reduce(0, +), 3)
    XCTAssertEqual(s["r"] as! Double, (0.6 + 1 + 0.5) / 3, accuracy: 1e-9)
    XCTAssertEqual(s["g"] as! Double, 0.6 / 3, accuracy: 1e-9)
    XCTAssertEqual(s["saturation"] as! Double, (0 + 1 + 0.5) / 3, accuracy: 1e-9)
  }

  func testNothingToCount() {
    XCTAssertNil(FrameStats.count([0, 0, 0, 0], pixels: 1))
    XCTAssertNil(FrameStats.count([1, 2, 3], pixels: 1))      // shorter than it says
    XCTAssertNil(FrameStats.count([], pixels: 0))
    XCTAssertNil(FrameStats.measure(solid(1, 1, 1, 0.25)))     // alpha 64: nothing covered enough
  }

  func testADrawnPictureIsCountedInSRGB() {
    let grey = FrameStats.measure(solid(0.6, 0.6, 0.6))!
    XCTAssertEqual(grey["pixels"] as? Int, 32)
    XCTAssertEqual((grey["histogram"] as! [Int])[38], 32)
    XCTAssertEqual(grey["r"] as! Double, 0.6, accuracy: 0.01)
    XCTAssertEqual(grey["saturation"] as! Double, 0, accuracy: 0.01)
    let red = FrameStats.measure(solid(1, 0, 0))!
    XCTAssertEqual((red["histogram"] as! [Int])[13], 32)
    XCTAssertEqual(red["saturation"] as! Double, 1, accuracy: 0.01)
  }

  func testTheClamps() {
    XCTAssertEqual(FrameStats.clampSide(.nan), 256)
    XCTAssertEqual(FrameStats.clampSide(0), 256)
    XCTAssertEqual(FrameStats.clampSide(8), 16)
    XCTAssertEqual(FrameStats.clampSide(300.4), 300)
    XCTAssertEqual(FrameStats.clampSide(5000), 1024)
    XCTAssertEqual(FrameStats.clampTimes([1, .nan, -2, 99], length: 10), [1, 0, 9.95])
    XCTAssertEqual(FrameStats.clampTimes([], length: 10), [4.975])
    XCTAssertEqual(FrameStats.clampTimes(Array(repeating: 1, count: 12), length: 10).count, 10)
  }
}
