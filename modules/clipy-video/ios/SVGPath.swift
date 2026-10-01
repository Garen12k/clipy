import CoreGraphics
import Foundation

/// Minimal SVG path-data parser for the sticker shapes: absolute `M L C Q Z` commands and numbers only
/// (separated by whitespace and/or commas; a sign starts a new number). Any other command → nil.
/// After `M`, extra coordinate pairs are treated as implicit `L` (SVG rule); other commands repeat implicitly.
///
/// Test reference (ExportSessionTests.testSVGPathParsesShapes): every `Effects.shapePaths` value parses, and
/// `square` ("M0 0 L100 0 L100 100 L0 100 Z") yields 4 points — 1 moveToPoint + 3 addLineToPoint (+ 1 closeSubpath,
/// which carries no point).
enum SVGPath {
  enum Token {
    case command(Character)
    case number(CGFloat)
  }

  static func tokenize(_ d: String) -> [Token]? {
    var tokens: [Token] = []
    var num = ""
    func flush() -> Bool {
      if num.isEmpty { return true }
      guard let v = Double(num) else { return false }
      tokens.append(.number(CGFloat(v)))
      num = ""
      return true
    }
    for ch in d {
      if ch == " " || ch == "," || ch == "\n" || ch == "\t" || ch == "\r" {
        guard flush() else { return nil }
      } else if ch == "M" || ch == "L" || ch == "C" || ch == "Q" || ch == "Z" {
        guard flush() else { return nil }
        tokens.append(.command(ch))
      } else if ch == "-" || ch == "+" {
        if let last = num.last, last == "e" || last == "E" {
          num.append(ch)                                  // exponent sign
        } else {
          guard flush() else { return nil }
          num.append(ch)
        }
      } else if ch == "." || ch == "e" || ch == "E" || (ch.isASCII && ch.isNumber) {
        num.append(ch)
      } else {
        return nil                                        // unsupported command or character
      }
    }
    guard flush() else { return nil }
    return tokens
  }

  /// The path in its own (SVG, y-down) coordinates, or nil if the data is malformed or uses other commands.
  static func cgPath(from d: String) -> CGPath? {
    guard let tokens = tokenize(d) else { return nil }
    let path = CGMutablePath()
    var i = 0
    var command: Character? = nil
    var hasCurrentPoint = false

    func numbers(_ n: Int) -> [CGFloat]? {
      guard i + n <= tokens.count else { return nil }
      var out: [CGFloat] = []
      for k in 0..<n {
        guard case .number(let v) = tokens[i + k] else { return nil }
        out.append(v)
      }
      i += n
      return out
    }

    while i < tokens.count {
      if case .command(let c) = tokens[i] {
        command = c
        i += 1
        if c == "Z" {
          guard hasCurrentPoint else { return nil }
          path.closeSubpath()
          continue
        }
      } else if command == nil || command == "Z" {
        return nil                                        // a number with no command (or straight after Z)
      }
      guard let c = command else { return nil }
      switch c {
      case "M":
        guard let p = numbers(2) else { return nil }
        path.move(to: CGPoint(x: p[0], y: p[1]))
        hasCurrentPoint = true
        command = "L"                                     // implicit lineto for further pairs
      case "L":
        guard hasCurrentPoint, let p = numbers(2) else { return nil }
        path.addLine(to: CGPoint(x: p[0], y: p[1]))
      case "C":
        guard hasCurrentPoint, let p = numbers(6) else { return nil }
        path.addCurve(to: CGPoint(x: p[4], y: p[5]), control1: CGPoint(x: p[0], y: p[1]), control2: CGPoint(x: p[2], y: p[3]))
      case "Q":
        guard hasCurrentPoint, let p = numbers(4) else { return nil }
        path.addQuadCurve(to: CGPoint(x: p[2], y: p[3]), control: CGPoint(x: p[0], y: p[1]))
      default:
        return nil
      }
    }
    return path.isEmpty ? nil : path
  }
}
