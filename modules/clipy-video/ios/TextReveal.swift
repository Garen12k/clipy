import Foundation

/// The steps of a text's reveal (Typewriter / Word by word) in the export, as the request carries them. Pure: no
/// layers. Where each step ends and when it begins are the app's (`revealPlan` in src/editor/model/textReveal.ts —
/// TypeScript only, NOT mirrored here); this only checks the numbers and gives every step its end.
enum TextReveal {
  /// A SAFETY bound on the steps a request may carry, well above the app's own `REVEAL.maxSteps` (which is TypeScript
  /// only and may be tuned without a build; textReveal.swift.test.ts pins REVEAL.maxSteps <= this).
  /// Each step but the last is one more copy of every text layer, so a request with more is drawn whole.
  static let maxSteps = 120

  /// `cuts[i]` (UTF-16 offsets into the text: the text before it is shown) and `from[i]` (seconds since the text's
  /// start) as steps `(cut, from, to)`: `to` is the next step's `from`, the last step's is `life`.
  /// Empty — the text is then drawn whole, as before — unless: at least two steps and at most `maxSteps`, as many
  /// cuts as times, every cut a whole number strictly increasing within 1 … `length` with the last exactly `length`,
  /// every time finite, strictly increasing from exactly 0 and below `life`, and `life` finite and above 0.
  static func steps(cuts: [Double], from: [Double], length: Int, life: Double) -> [(cut: Int, from: Double, to: Double)] {
    guard cuts.count >= 2, cuts.count == from.count, length > 0, life.isFinite, life > 0 else { return [] }
    guard cuts.count <= maxSteps else { return [] }
    var out: [(cut: Int, from: Double, to: Double)] = []
    var lastCut = 0
    var lastFrom: Double = -1
    for i in 0..<cuts.count {
      let c = cuts[i]
      let t = from[i]
      guard c.isFinite, c == c.rounded(), c > Double(lastCut), c <= Double(length) else { return [] }
      guard t.isFinite, t > lastFrom, t < life else { return [] }
      if i == 0 && t != 0 { return [] }
      lastCut = Int(c)
      lastFrom = t
      out.append((cut: lastCut, from: t, to: life))
    }
    guard lastCut == length else { return [] }
    for i in 0..<(out.count - 1) { out[i].to = out[i + 1].from }
    return out
  }
}
