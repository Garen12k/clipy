import CoreGraphics
import CoreImage
import Foundation

/// A green screen as the compositor uses it: the key colour (`#RRGGBB`) and the strength (0…1).
struct ChromaKey: Equatable {
  let color: String
  let strength: Double
}

/// Mirror of src/editor/model/chroma.ts — the constants (`CHROMA` in types.ts) and every expression must stay
/// identical (checked by src/editor/model/__tests__/chroma.parity.test.ts; vectors in Tests/ChromaTests.swift).
/// The export keys a picture through a colour cube built from `alpha`; no other code keys a pixel.
enum Chroma {
  static let hueBase: Double = 12
  static let hueRange: Double = 48
  static let soft: Double = 10
  static let minSat: Double = 0.25
  static let minVal: Double = 0.2
  static let defaultStrength: Double = 0.5
  static let cube: Int = 32

  /// A number clamped to 0–1; a non-finite one counts as 0.
  static func unit(_ v: Double) -> Double {
    if !v.isFinite { return 0 }
    return min(1, max(0, v))
  }

  /// The standard hexcone conversion. Inputs are clamped to 0–1 (non-finite → 0). `h` is in degrees [0, 360) and 0
  /// for greys; `s = max == 0 ? 0 : (max − min) / max`; `v = max`.
  static func rgbToHsv(_ r: Double, _ g: Double, _ b: Double) -> (h: Double, s: Double, v: Double) {
    let red = unit(r)
    let green = unit(g)
    let blue = unit(b)
    let high = max(red, green, blue)
    let low = min(red, green, blue)
    let delta = high - low
    let v = high
    let s = high == 0 ? 0 : delta / high
    var h = 0.0
    if delta > 0 {
      if high == red { h = 60 * ((green - blue) / delta) }
      else if high == green { h = 60 * ((blue - red) / delta + 2) }
      else { h = 60 * ((red - green) / delta + 4) }
    }
    if h < 0 { h = h + 360 }
    if h >= 360 { h = h - 360 }   // a hue a hair below 0 rounds to exactly 360 when 360 is added
    return (h, s, v)
  }

  /// `#RRGGBB` (either case) → components / 255; anything else → nil. Exactly seven characters, ASCII hex digits
  /// only — the TS pattern `^#[0-9a-fA-F]{6}$` (no surrounding whitespace, no short form, no alpha).
  static func hexToRgb(_ hex: String) -> (r: Double, g: Double, b: Double)? {
    let scalars = Array(hex.unicodeScalars)
    guard scalars.count == 7, scalars[0] == "#" else { return nil }
    var n: UInt32 = 0
    for scalar in scalars.dropFirst() {
      let code = scalar.value
      let digit: UInt32
      switch code {
      case 48...57: digit = code - 48            // 0–9
      case 65...70: digit = code - 55            // A–F
      case 97...102: digit = code - 87           // a–f
      default: return nil
      }
      n = n * 16 + digit
    }
    let r = Double((n >> 16) & 0xFF) / 255
    let g = Double((n >> 8) & 0xFF) / 255
    let b = Double(n & 0xFF) / 255
    return (r, g, b)
  }

  /// The shortest way round the hue circle between two hues in degrees: 0…180.
  static func hueDistance(_ a: Double, _ b: Double) -> Double {
    let d = abs(a - b).truncatingRemainder(dividingBy: 360)
    return d > 180 ? 360 - d : d
  }

  /// How much of a pixel (r, g, b in 0–1) is left by a green screen with key colour `key` (already parsed) at
  /// `strength` (0–1, clamped; non-finite → 0): 0 = fully see-through, 1 = untouched. A pixel whose hue is within
  /// `tol = hueBase + hueRange × strength` degrees of the key's hue is removed, with a ramp `soft` degrees wide
  /// outside that. Greys, whites and darks (saturation < minSat or value < minVal) are never keyed; a key that is
  /// itself grey (saturation < minSat) keys nothing.
  static func alpha(r: Double, g: Double, b: Double, key: (r: Double, g: Double, b: Double), strength: Double) -> Double {
    let keyHsv = rgbToHsv(key.r, key.g, key.b)
    if keyHsv.s < minSat { return 1 }
    let pixel = rgbToHsv(r, g, b)
    if pixel.s < minSat || pixel.v < minVal { return 1 }
    let tol = hueBase + hueRange * unit(strength)
    let d = hueDistance(pixel.h, keyHsv.h)
    let alpha = (d - tol) / soft
    return min(1, max(0, alpha))
  }

  /// `chromaAlpha` as the TS has it: the key given as `#RRGGBB`; a key that is not one keys nothing (1).
  static func alpha(r: Double, g: Double, b: Double, hex: String, strength: Double) -> Double {
    guard let key = hexToRgb(hex) else { return 1 }
    return alpha(r: r, g: g, b: b, key: key, strength: strength)
  }

  /// The parsed key when it can key anything: a `#RRGGBB` colour that is not grey. Nil otherwise — such a green
  /// screen is no green screen, and the picture takes the path it always took.
  static func usableKey(_ hex: String) -> (r: Double, g: Double, b: Double)? {
    guard let key = hexToRgb(hex), rgbToHsv(key.r, key.g, key.b).s >= minSat else { return nil }
    return key
  }

  /// Finished cubes by "KEY-strength in hundredths". The compositor may render frames on several queues, so every
  /// read and write is under `lock`. A cube is 32³ × 4 Float32 = 512 KB; the cache is emptied when it is full.
  private static let lock = NSLock()
  private static var cubes: [String: Data] = [:]
  private static let cubeLimit = 8

  /// The strength a cube is built for: clamped to 0–1 and rounded to hundredths (so a cube can be shared and the
  /// cache key says exactly what is inside it).
  static func cubeStrength(_ strength: Double) -> Double {
    return Double(Int((unit(strength) * 100).rounded())) / 100
  }

  /// The colour cube for `CIColorCube`: `cube × cube × cube` entries of four Float32 each, PREMULTIPLIED RGBA —
  /// for the lattice colour (r, g, b) with `a = alpha(...)`, the entry is (r·a, g·a, b·a, a).
  /// ORDER (as Apple documents `inputCubeData`: columns and rows indexed by red and green, planes by blue): RED
  /// varies fastest, then green, then blue — entry index = red + green·N + blue·N². Unverified until first build.
  /// Nil when the key is not `#RRGGBB`.
  static func cubeData(key: String, strength: Double) -> Data? {
    guard let rgb = hexToRgb(key) else { return nil }
    let level = cubeStrength(strength)
    let id = "\(key.uppercased())-\(Int((level * 100).rounded()))"
    lock.lock()
    let cached = cubes[id]
    lock.unlock()
    if let cached { return cached }

    let n = cube
    guard n >= 2 else { return nil }
    let top = Double(n - 1)
    var values: [Float] = []
    values.reserveCapacity(n * n * n * 4)
    for blue in 0..<n {
      for green in 0..<n {
        for red in 0..<n {
          let r = Double(red) / top
          let g = Double(green) / top
          let b = Double(blue) / top
          let a = alpha(r: r, g: g, b: b, key: rgb, strength: level)
          values.append(Float(r * a))
          values.append(Float(g * a))
          values.append(Float(b * a))
          values.append(Float(a))
        }
      }
    }
    let data = values.withUnsafeBufferPointer { (buffer: UnsafeBufferPointer<Float>) -> Data in Data(buffer: buffer) }
    lock.lock()
    if cubes.count >= cubeLimit { cubes.removeAll() }
    cubes[id] = data
    lock.unlock()
    return data
  }

  /// `image` with the key colour made see-through (premultiplied), cropped to the image's own extent. The picture
  /// handed in is opaque (the green screen runs before the mask), which is what `CIColorCube` expects of its input.
  /// A key that cannot key anything, an image without a finite extent, or a Core Image without the filter / its two
  /// keys → `image` itself, unchanged.
  static func apply(to image: CIImage, key: String, strength: Double) -> CIImage {
    let extent = image.extent
    guard !extent.isInfinite, !extent.isEmpty, usableKey(key) != nil, let data = cubeData(key: key, strength: strength),
          let keyed = Adjust.filtered(image, "CIColorCube", [
            "inputCubeDimension": NSNumber(value: cube),
            "inputCubeData": data as NSData,
          ])
    else { return image }
    return keyed.cropped(to: extent)
  }
}
