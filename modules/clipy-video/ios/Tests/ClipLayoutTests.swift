import CoreGraphics
import XCTest
@testable import ClipyVideo

/// One case of `PLACE_VECTORS` (src/editor/model/__tests__/clipLayout.vectors.ts). The table below is checked
/// against the TS vectors by src/editor/model/__tests__/clipLayout.parity.test.ts — keep the literals identical.
struct PlaceVector {
  let name: String
  let source: CGSize
  let crop: ClipCrop
  let transform: ClipTransform
  let frame: CGSize
  let expect: ClipPlacement
}

let placeVectors: [PlaceVector] = [
  PlaceVector(name: "portrait source in portrait frame (identity)",
    source: CGSize(width: 1080, height: 1920), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 1080, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false)),
  PlaceVector(name: "landscape source covers a portrait frame",
    source: CGSize(width: 1920, height: 1080), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 3413.3333333, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false)),
  PlaceVector(name: "landscape source at fit scale in a portrait frame",
    source: CGSize(width: 1920, height: 1080), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 0.31640625, x: 0, y: 0, rotation: 0, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 1080, height: 607.5, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false)),
  PlaceVector(name: "landscape source turned 90 degrees covers a portrait frame exactly",
    source: CGSize(width: 1920, height: 1080), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 1, x: 0, y: 0, rotation: 90, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 1920, height: 1080, centerX: 540, centerY: 960, rotation: 90, flipH: false, flipV: false)),
  PlaceVector(name: "centre crop of a landscape source",
    source: CGSize(width: 1920, height: 1080), crop: ClipCrop(x: 0.25, y: 0, w: 0.5, h: 1),
    transform: ClipTransform(scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 1706.6666667, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false)),
  PlaceVector(name: "offsets x 0.1, y -0.2",
    source: CGSize(width: 1080, height: 1920), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 1, x: 0.1, y: -0.2, rotation: 0, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 1080, height: 1920, centerX: 648, centerY: 576, rotation: 0, flipH: false, flipV: false)),
  PlaceVector(name: "flips are carried through",
    source: CGSize(width: 1080, height: 1920), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 1, x: 0, y: 0, rotation: 0, flipH: true, flipV: true), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 1080, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: true, flipV: true)),
  PlaceVector(name: "landscape source in a square frame",
    source: CGSize(width: 1920, height: 1080), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false), frame: CGSize(width: 1000, height: 1000),
    expect: ClipPlacement(width: 1777.7777778, height: 1000, centerX: 500, centerY: 500, rotation: 0, flipH: false, flipV: false)),
  PlaceVector(name: "scale 2 with a 30 degree rotation",
    source: CGSize(width: 1080, height: 1920), crop: ClipCrop(x: 0, y: 0, w: 1, h: 1),
    transform: ClipTransform(scale: 2, x: 0, y: 0, rotation: 30, flipH: false, flipV: false), frame: CGSize(width: 1080, height: 1920),
    expect: ClipPlacement(width: 2160, height: 3840, centerX: 540, centerY: 960, rotation: 30, flipH: false, flipV: false)),
]

/// One case of `MASK_VECTORS` (same file, same parity test): the placed box's size, the mask, the corner radius.
struct MaskVector {
  let name: String
  let width: CGFloat
  let height: CGFloat
  let mask: String
  let expect: CGFloat
}

let maskVectors: [MaskVector] = [
  MaskVector(name: "none is square-cornered", width: 1080, height: 1920, mask: "none", expect: 0),
  MaskVector(name: "rounded on a portrait box", width: 1080, height: 1920, mask: "rounded", expect: 129.6),
  MaskVector(name: "rounded on a landscape box", width: 1080, height: 607.5, mask: "rounded", expect: 72.9),
  MaskVector(name: "circle on a square box", width: 400, height: 400, mask: "circle", expect: 200),
  MaskVector(name: "circle on a portrait box is a pill", width: 432, height: 768, mask: "circle", expect: 216),
  MaskVector(name: "circle on a landscape box", width: 1080, height: 607.5, mask: "circle", expect: 303.75),
  MaskVector(name: "an empty box has no radius", width: 0, height: 300, mask: "circle", expect: 0),
]

final class ClipLayoutTests: XCTestCase {
  private let portrait = CGSize(width: 1080, height: 1920)
  private let landscape = CGSize(width: 1920, height: 1080)

  private func assertPoint(_ p: CGPoint, _ x: CGFloat, _ y: CGFloat, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(p.x, x, accuracy: 1e-6, message, file: file, line: line)
    XCTAssertEqual(p.y, y, accuracy: 1e-6, message, file: file, line: line)
  }

  private func assertTransform(_ a: CGAffineTransform, _ b: CGAffineTransform, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
    for (u, v) in [(a.a, b.a), (a.b, b.b), (a.c, b.c), (a.d, b.d), (a.tx, b.tx), (a.ty, b.ty)] {
      XCTAssertEqual(u, v, accuracy: 1e-6, message, file: file, line: line)
    }
  }

  func testPlaceVectors() {
    for v in placeVectors {
      let p = ClipLayout.placeClip(v.source, v.crop, v.transform, v.frame.width, v.frame.height)
      XCTAssertEqual(p.width, v.expect.width, accuracy: 1e-3, v.name)
      XCTAssertEqual(p.height, v.expect.height, accuracy: 1e-3, v.name)
      XCTAssertEqual(p.centerX, v.expect.centerX, accuracy: 1e-3, v.name)
      XCTAssertEqual(p.centerY, v.expect.centerY, accuracy: 1e-3, v.name)
      XCTAssertEqual(p.rotation, v.expect.rotation, v.name)
      XCTAssertEqual(p.flipH, v.expect.flipH, v.name)
      XCTAssertEqual(p.flipV, v.expect.flipV, v.name)
    }
  }

  func testMaskVectors() {
    for v in maskVectors {
      XCTAssertEqual(ClipLayout.maskRadius(v.width, v.height, v.mask), v.expect, accuracy: 1e-6, v.name)
    }
  }

  /// An unknown mask and a box whose size is not a number have no radius (as `maskRadius` in clipLayout.ts).
  func testMaskRadiusOfUnusableInputIsZero() {
    XCTAssertEqual(ClipLayout.maskRadius(400, 400, "star"), 0)
    XCTAssertEqual(ClipLayout.maskRadius(400, 400, ""), 0)
    XCTAssertEqual(ClipLayout.maskRadius(.nan, 400, "circle"), 0)
    XCTAssertEqual(ClipLayout.maskRadius(400, .nan, "rounded"), 0)
    XCTAssertEqual(ClipLayout.maskRadius(.infinity, .infinity, "circle"), 0)
    XCTAssertEqual(ClipLayout.maskRadius(.infinity, 400, "circle"), 200)   // the shorter side decides, as in the TS
    XCTAssertEqual(ClipLayout.maskRadius(-10, 400, "circle"), 0)
  }

  func testFitScaleAndCoverFactor() {
    XCTAssertEqual(ClipLayout.fitScale(portrait, .full, 0, 1080, 1920), 1, accuracy: 1e-6)
    XCTAssertEqual(ClipLayout.fitScale(landscape, .full, 0, 1080, 1920), 0.31640625, accuracy: 1e-6)
    XCTAssertEqual(ClipLayout.fitScale(landscape, .full, 90, 1080, 1920), 1, accuracy: 1e-6)
    XCTAssertEqual(ClipLayout.coverFactor(landscape, .full, 0, 1080, 1920), 1.7777778, accuracy: 1e-6)
  }

  func testIsQuarterTurn() {
    for (d, e) in [(90, true), (-90, true), (270, true), (89.5, true), (45, false), (0, false), (180, false)] as [(CGFloat, Bool)] {
      XCTAssertEqual(ClipLayout.isQuarterTurn(d), e, "\(d)")
    }
  }

  func testCoversFrame() {
    func place(_ t: ClipTransform, _ source: CGSize) -> ClipPlacement { ClipLayout.placeClip(source, .full, t, 1080, 1920) }
    var t = ClipTransform.identity
    XCTAssertTrue(ClipLayout.coversFrame(place(t, portrait), 1080, 1920))
    XCTAssertTrue(ClipLayout.coversFrame(place(t, landscape), 1080, 1920))
    t.scale = 0.31640625
    XCTAssertFalse(ClipLayout.coversFrame(place(t, landscape), 1080, 1920))
    t = .identity; t.x = 0.01
    XCTAssertFalse(ClipLayout.coversFrame(place(t, portrait), 1080, 1920))
    t = .identity; t.scale = 2; t.x = 0.2; t.y = -0.1
    XCTAssertTrue(ClipLayout.coversFrame(place(t, portrait), 1080, 1920))
    t = .identity; t.scale = 3; t.rotation = 45
    XCTAssertFalse(ClipLayout.coversFrame(place(t, portrait), 1080, 1920))
    t = .identity; t.rotation = 90
    XCTAssertTrue(ClipLayout.coversFrame(place(t, landscape), 1080, 1920))
  }

  /// The default clip through the new path equals the old cover path, for an upright and a portrait-rotated source.
  func testDefaultPlacementMatchesFillTransform() {
    let render = CGSize(width: 720, height: 1280)
    let natural = CGSize(width: 1920, height: 1080)
    let upright = CGAffineTransform.identity
    let rotated = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 1080, ty: 0)   // iPhone portrait recording
    for t in [upright, rotated] {
      let orient = ExportSession.ciOrientTransform(preferredTransform: t, naturalSize: natural)
      let extent = CGRect(origin: .zero, size: natural).applying(orient)
      let p = ClipLayout.ciPlacement(orientedExtent: extent, crop: .full, transform: .identity, frame: render)
      XCTAssertEqual(p.cropRect.origin.x, extent.origin.x, accuracy: 1e-6)
      XCTAssertEqual(p.cropRect.size.width, extent.size.width, accuracy: 1e-6)
      let fill = ExportSession.ciFillTransform(preferredTransform: t, naturalSize: natural, renderSize: render)
      assertTransform(orient.concatenating(p.transform), fill, "\(t)")
    }
  }

  /// A 90° clockwise turn on screen is a 90° clockwise turn in the export: the picture's top-left corner lands at
  /// the frame's top-right (Core Image is y-up, so the top edge is y = frame height).
  func testQuarterTurnIsClockwise() {
    var t = ClipTransform.identity
    t.rotation = 90
    let p = ClipLayout.ciPlacement(orientedExtent: CGRect(x: 0, y: 0, width: 200, height: 100), crop: .full, transform: t, frame: CGSize(width: 100, height: 200))
    assertPoint(CGPoint(x: 0, y: 100).applying(p.transform), 100, 200, "top-left → top-right")
    assertPoint(CGPoint(x: 200, y: 0).applying(p.transform), 0, 0, "bottom-right → bottom-left")
  }

  /// Flips mirror the picture about its own axes before the turn (ClipFrame.tsx: rotate, then scaleX / scaleY).
  func testFlipsAreLocalAndApplyBeforeRotation() {
    var t = ClipTransform.identity
    t.flipH = true
    let extent = CGRect(x: 0, y: 0, width: 100, height: 200)
    let frame = CGSize(width: 100, height: 200)
    var p = ClipLayout.ciPlacement(orientedExtent: extent, crop: .full, transform: t, frame: frame)
    assertPoint(CGPoint(x: 0, y: 200).applying(p.transform), 100, 200, "flipH: top-left → top-right")
    t = .identity; t.flipV = true
    p = ClipLayout.ciPlacement(orientedExtent: extent, crop: .full, transform: t, frame: frame)
    assertPoint(CGPoint(x: 0, y: 200).applying(p.transform), 0, 0, "flipV: top-left → bottom-left")
    // flipH then a clockwise quarter turn: the picture's top-left (mirrored to its top-right) turns to the bottom-right.
    t = .identity; t.flipH = true; t.rotation = 90
    p = ClipLayout.ciPlacement(orientedExtent: CGRect(x: 0, y: 0, width: 200, height: 100), crop: .full, transform: t, frame: CGSize(width: 100, height: 200))
    assertPoint(CGPoint(x: 0, y: 100).applying(p.transform), 100, 0, "flipH + 90°: top-left → bottom-right")
  }

  /// A crop is measured from the TOP-LEFT of the upright picture: the top-left quarter of a 200×100 frame is the
  /// y-up rect (0, 50, 100, 50), and it is what fills the frame.
  func testCropUsesTopLeftOrigin() {
    let crop = ClipCrop(x: 0, y: 0, w: 0.5, h: 0.5)
    let p = ClipLayout.ciPlacement(orientedExtent: CGRect(x: 0, y: 0, width: 200, height: 100), crop: crop, transform: .identity, frame: CGSize(width: 100, height: 50))
    XCTAssertEqual(p.cropRect, CGRect(x: 0, y: 50, width: 100, height: 50))
    assertPoint(CGPoint(x: 0, y: 100).applying(p.transform), 0, 50, "crop top-left → frame top-left")
    assertPoint(CGPoint(x: 100, y: 50).applying(p.transform), 100, 0, "crop bottom-right → frame bottom-right")
  }

  /// The two-step draw (local: crop centre → origin, flip, scale; then outer: rotate, translate) is the same mapping
  /// as `transform`, and `localRect` is the unrotated placed box centred on the origin.
  func testLocalThenOuterEqualsTransform() {
    var t = ClipTransform.identity
    t.scale = 1.3; t.x = 0.1; t.y = -0.05; t.rotation = 30; t.flipH = true
    let crop = ClipCrop(x: 0.1, y: 0.2, w: 0.6, h: 0.5)
    let p = ClipLayout.ciPlacement(orientedExtent: CGRect(x: 0, y: 0, width: 1920, height: 1080), crop: crop, transform: t, frame: portrait)
    assertTransform(p.local.concatenating(p.outer), p.transform, "local ∘ outer")
    XCTAssertEqual(p.localRect.midX, 0, accuracy: 1e-6); XCTAssertEqual(p.localRect.midY, 0, accuracy: 1e-6)
    XCTAssertEqual(p.localRect.width, p.placed.width, accuracy: 1e-6); XCTAssertEqual(p.localRect.height, p.placed.height, accuracy: 1e-6)
    // The crop rect lands exactly on localRect in local space (so cropping there is a hard cut of the picture's edge).
    let mapped = p.cropRect.applying(p.local)
    XCTAssertEqual(mapped.minX, p.localRect.minX, accuracy: 1e-6); XCTAssertEqual(mapped.maxX, p.localRect.maxX, accuracy: 1e-6)
    XCTAssertEqual(mapped.minY, p.localRect.minY, accuracy: 1e-6); XCTAssertEqual(mapped.maxY, p.localRect.maxY, accuracy: 1e-6)
  }

  /// Offsets are fractions of the frame, y downwards on screen (so upwards is a larger Core Image y).
  func testOffsetMovesTheCentre() {
    var t = ClipTransform.identity
    t.x = 0.1; t.y = -0.2
    let p = ClipLayout.ciPlacement(orientedExtent: CGRect(x: 0, y: 0, width: 1080, height: 1920), crop: .full, transform: t, frame: portrait)
    assertPoint(CGPoint(x: 540, y: 960).applying(p.transform), 648, 1920 - 576, "centre")
  }

  func testBackgroundParsing() {
    if case .blur = LayerBackground(type: "blur", color: nil) {} else { XCTFail("blur") }
    if case .black = LayerBackground(type: "color", color: nil) {} else { XCTFail("colour without a value → black") }
    if case .black = LayerBackground(type: "sparkle", color: "#FF0000") {} else { XCTFail("unknown → black") }
    for bad in ["", "#", "red", "#FFF", "#GG0000", "#FF00001", "+FF000"] {
      if case .black = LayerBackground(type: "color", color: bad) {} else { XCTFail("malformed \"\(bad)\" → black") }
    }
    XCTAssertTrue(LayerBackground.isHexColor("#1a2B3c"))
    XCTAssertTrue(LayerBackground.isHexColor(" 1A2B3C "))
    guard case .color(let c) = LayerBackground(type: "color", color: "#FF0000") else { return XCTFail("colour") }
    XCTAssertEqual(c.red, 1, accuracy: 1e-3); XCTAssertEqual(c.green, 0, accuracy: 1e-3); XCTAssertEqual(c.blue, 0, accuracy: 1e-3)
  }
}
