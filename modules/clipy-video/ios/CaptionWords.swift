import Foundation

/// When each spoken word of a caption is highlighted in the export, and which characters it covers. Pure: no layers.
enum CaptionWords {
  /// `words` (times in seconds since the caption's start) as character ranges of `text` with times on the
  /// composition's clock, for a caption shown during [start, end).
  /// - Each word is searched for after the end of the previous match, so a repeated word gets its own place.
  /// - Ranges are UTF-16 (`NSRange`), as `NSAttributedString` wants them.
  /// - Times are clamped into [start, end].
  /// - Skipped: an empty word, a word that is not found (the search position does not move), a word with a
  ///   non-finite time, and a word left with no time (`end ≤ start` after clamping).
  static func spans(text: String, words: [(text: String, start: Double, end: Double)], start: Double, end: Double) -> [(range: NSRange, start: Double, end: Double)] {
    let whole = text as NSString
    var cursor = 0
    var out: [(range: NSRange, start: Double, end: Double)] = []
    for word in words {
      guard !word.text.isEmpty, cursor < whole.length else { continue }
      let found = whole.range(of: word.text, options: [], range: NSRange(location: cursor, length: whole.length - cursor))
      guard found.location != NSNotFound else { continue }
      cursor = found.location + found.length
      guard word.start.isFinite, word.end.isFinite else { continue }
      let from = min(max(start + word.start, start), end)
      let to = min(max(start + word.end, start), end)
      guard to > from else { continue }
      out.append((range: found, start: from, end: to))
    }
    return out
  }
}
