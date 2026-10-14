import CoreText
import Foundation
import QuartzCore
import UIKit
import XCTest
@testable import ClipyVideo

/// A text's reveal in the export: the checked steps, and one copy of each text layer per step but the last, shown only
/// during its step, with the characters not yet revealed clear in fill and stroke.
final class TextRevealTests: XCTestCase {
  private let size = CGSize(width: 1080, height: 1920)
  private let colorKey = NSAttributedString.Key(rawValue: kCTForegroundColorAttributeName as String)

  func testStepsEndWhereTheNextBegins() {
    let s = TextReveal.steps(cuts: [3, 6], from: [0, 0.25], length: 6, life: 3)
    XCTAssertEqual(s.count, 2)
    XCTAssertEqual(s[0].cut, 3); XCTAssertEqual(s[0].from, 0); XCTAssertEqual(s[0].to, 0.25)
    XCTAssertEqual(s[1].cut, 6); XCTAssertEqual(s[1].from, 0.25); XCTAssertEqual(s[1].to, 3)
  }

  func testAnythingOddIsNoReveal() {
    XCTAssertTrue(TextReveal.steps(cuts: [6], from: [0], length: 6, life: 3).isEmpty)                     // one step
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0], length: 6, life: 3).isEmpty)                  // counts differ
    XCTAssertTrue(TextReveal.steps(cuts: [3, 5], from: [0, 0.25], length: 6, life: 3).isEmpty)            // not the whole text at the end
    XCTAssertTrue(TextReveal.steps(cuts: [3, 3, 6], from: [0, 0.1, 0.2], length: 6, life: 3).isEmpty)     // not increasing
    XCTAssertTrue(TextReveal.steps(cuts: [0, 6], from: [0, 0.25], length: 6, life: 3).isEmpty)            // an empty first step
    XCTAssertTrue(TextReveal.steps(cuts: [2.5, 6], from: [0, 0.25], length: 6, life: 3).isEmpty)          // not a whole number
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0.1, 0.25], length: 6, life: 3).isEmpty)          // does not start at 0
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, 0], length: 6, life: 3).isEmpty)               // times not increasing
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, 3], length: 6, life: 3).isEmpty)               // past the life
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, .nan], length: 6, life: 3).isEmpty)
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, 0.25], length: 6, life: .infinity).isEmpty)
    XCTAssertTrue(TextReveal.steps(cuts: [3, 7], from: [0, 0.25], length: 6, life: 3).isEmpty)            // beyond the text
    // More steps than the safety bound (`TextReveal.maxSteps`, 120 — above anything the app sends): drawn whole.
    let many = (1...121).map { Double($0) }
    XCTAssertTrue(TextReveal.steps(cuts: many, from: (0..<121).map { Double($0) * 0.01 }, length: 121, life: 3).isEmpty)
    XCTAssertEqual(TextReveal.steps(cuts: Array(many[..<120]), from: (0..<120).map { Double($0) * 0.01 }, length: 120, life: 3).count, 120)
  }

  /// The app's segmentation vectors (src/editor/model/__tests__/textReveal.vectors.ts, copied verbatim): every list of
  /// two or more cuts is accepted against the text's UTF-16 length as NSString counts it — the JS offsets ARE Swift's.
  private let vectors: [(name: String, text: String, typewriter: [Double], wordByWord: [Double])] = [
    (name: "a space belongs to the unit before it", text: "Hi you", typewriter: [1, 3, 4, 5, 6], wordByWord: [3, 6]),
    (name: "leading space in every prefix; a newline is space", text: "  Hi\nyou ", typewriter: [3, 5, 6, 7, 9], wordByWord: [5, 9]),
    (name: "multiple spaces", text: "a   b", typewriter: [4, 5], wordByWord: [4, 5]),
    (name: "trailing spaces end with the last unit", text: "ab  ", typewriter: [1, 4], wordByWord: [4]),
    (name: "two newlines", text: "a\n\nb", typewriter: [3, 4], wordByWord: [3, 4]),
    (name: "combining accents stay on their letter", text: "e\u{0301}te\u{0301}", typewriter: [2, 3, 5], wordByWord: [5]),
    (name: "a leading combining mark shows from the first step", text: "\u{0301}ab", typewriter: [2, 3], wordByWord: [3]),
    (name: "a ZWJ family is one character", text: "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}!", typewriter: [8, 9], wordByWord: [9]),
    (name: "ZWJ sequence with a variation selector", text: "\u{2764}\u{FE0F}\u{200D}\u{1F525}x", typewriter: [5, 6], wordByWord: [6]),
    (name: "flags are pairs; a lone indicator is one", text: "\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}\u{1F1EE}", typewriter: [4, 8, 10], wordByWord: [10]),
    (name: "a skin tone stays on its emoji", text: "\u{1F44D}\u{1F3FD} ok", typewriter: [5, 6, 7], wordByWord: [5, 7]),
    (name: "keycap", text: "1\u{FE0F}\u{20E3}", typewriter: [3], wordByWord: [3]),
    (name: "Arabic with tashkeel: whole words in both", text: "\u{0633}\u{064E}\u{0644}\u{0627}\u{0645} \u{062F}\u{0646}\u{06CC}\u{0627}", typewriter: [6, 10], wordByWord: [6, 10]),
    (name: "Persian: a ZWNJ is inside the word", text: "\u{0645}\u{06CC}\u{200C}\u{062E}\u{0648}\u{0627}\u{0647}\u{0645} \u{0628}\u{0631}\u{0648}\u{0645}", typewriter: [9, 13], wordByWord: [9, 13]),
    (name: "Hebrew: letter by letter, its points glued", text: "\u{05E9}\u{05B8}\u{05C1}\u{05DC}\u{05D5}\u{05B9}\u{05DD}", typewriter: [3, 4, 6, 7], wordByWord: [7]),
    (name: "mixed LTR / RTL: logical order; the Arabic word is one unit", text: "Hi \u{0633}\u{0644}\u{0627}\u{0645} you", typewriter: [1, 3, 8, 9, 10, 11], wordByWord: [3, 8, 11]),
    (name: "Hebrew first, then Latin", text: "\u{05E9}\u{05DC}\u{05D5}\u{05DD} hi", typewriter: [1, 2, 3, 5, 6, 7], wordByWord: [5, 7]),
    (name: "Devanagari: whole words", text: "\u{0928}\u{092E}\u{0938}\u{094D}\u{0924}\u{0947} \u{0926}\u{0941}\u{0928}\u{093F}\u{092F}\u{093E}", typewriter: [7, 13], wordByWord: [7, 13]),
    (name: "Thai: whole words", text: "\u{0E2A}\u{0E27}\u{0E31}\u{0E2A}\u{0E14}\u{0E35} \u{0E04}\u{0E23}\u{0E31}\u{0E1A}", typewriter: [7, 11], wordByWord: [7, 11]),
    (name: "CJK: each character is a word", text: "\u{4F60}\u{597D}\u{4E16}\u{754C}", typewriter: [1, 2, 3, 4], wordByWord: [1, 2, 3, 4]),
    (name: "CJK then Latin", text: "\u{65E5}\u{672C} go", typewriter: [1, 3, 4, 5], wordByWord: [1, 3, 5]),
    (name: "plain Latin", text: "fi", typewriter: [1, 2], wordByWord: [2]),
    (name: "only spaces: nothing to reveal", text: "   ", typewriter: [], wordByWord: []),
    (name: "empty", text: "", typewriter: [], wordByWord: []),
  ]

  func testTheAppsCutsFitTheText() {
    XCTAssertEqual(vectors.count, 24)
    for v in vectors {
      let length = (v.text as NSString).length
      for cuts in [v.typewriter, v.wordByWord] {
        let from = (0..<cuts.count).map { Double($0) * 0.1 }
        let s = TextReveal.steps(cuts: cuts, from: from, length: length, life: 10)
        XCTAssertEqual(s.count, cuts.count >= 2 ? cuts.count : 0, v.name)
        if let last = s.last { XCTAssertEqual(last.cut, length, v.name) }
      }
    }
  }

  /// "Hi you" from 1 s to 4 s, outlined; Word by word: "Hi " from 1 s, the whole text from 1.25 s.
  private func text(reveal: Bool, glow: Bool = false, shadow: Bool = false, kind: String = "text") -> ExportOverlay {
    var o = ExportOverlay()
    o.kind = kind; o.text = "Hi you"; o.start = 1; o.end = 4; o.fontScale = 0.07; o.outline = true
    var style = ExportTextStyle()
    if glow { style.glowColor = "#FF0000"; style.glowSize = 0.5 }
    if shadow { style.shadowColor = "#0000FF"; style.shadowOpacity = 0.6; style.shadowDistance = 0.1; style.shadowBlur = 0.25 }
    o.style = style
    if reveal { var r = ExportReveal(); r.cuts = [3, 6]; r.from = [0, 0.25]; o.reveal = r }
    return o
  }

  func testWithoutARevealTheLayersAreTheOldOnes() {
    XCTAssertEqual(ExportSession.overlayLayer(text(reveal: false), renderSize: size).sublayers?.count, 1)
    XCTAssertEqual(ExportSession.overlayLayer(text(reveal: false, glow: true, shadow: true), renderSize: size).sublayers?.count, 3)
  }

  func testOneCopyPerLayerPerStepButTheLast() {
    let layer = ExportSession.overlayLayer(text(reveal: true, glow: true, shadow: true), renderSize: size)
    let subs = layer.sublayers ?? []
    XCTAssertEqual(subs.count, 6)
    XCTAssertTrue(layer.allowsGroupOpacity)
    for copy in subs[3...] {                                    // step 1's glow, shadow and fill copies: 1 s … 1.25 s
      let anim = copy.animation(forKey: "visible") as? CABasicAnimation
      XCTAssertEqual(anim?.beginTime ?? -1, 1, accuracy: 1e-9)
      XCTAssertEqual(anim?.duration ?? -1, 0.25, accuracy: 1e-9)
      XCTAssertEqual(copy.opacity, 0)
      XCTAssertEqual(copy.frame, subs[2].frame)
    }
    for whole in subs[..<3] {                                   // the three layers: the whole text from 1.25 s to the end
      let anim = whole.animation(forKey: "visible") as? CABasicAnimation
      XCTAssertEqual(anim?.beginTime ?? -1, 1.25, accuracy: 1e-9)
      XCTAssertEqual(anim?.duration ?? -1, 2.75, accuracy: 1e-9)
    }
    // The shadow copy keeps the shadow's strength and its layer shadow.
    XCTAssertEqual(((subs[4].animation(forKey: "visible") as? CABasicAnimation)?.fromValue as? Double) ?? -1, 0.6, accuracy: 1e-6)
    XCTAssertEqual(subs[4].shadowRadius, subs[1].shadowRadius)
    XCTAssertEqual(subs[4].shadowOffset, subs[1].shadowOffset)
    XCTAssertEqual(subs[3].shadowOpacity, 1)
  }

  func testTheHiddenRangeIsClear() {
    let layer = ExportSession.overlayLayer(text(reveal: true), renderSize: size)
    let copy = (layer.sublayers ?? [])[1] as? CATextLayer
    let string = copy?.string as? NSAttributedString
    XCTAssertEqual(string?.string, "Hi you")                    // the whole text is laid out
    let shown = string?.attribute(colorKey, at: 0, effectiveRange: nil)
    let hidden = string?.attribute(colorKey, at: 4, effectiveRange: nil)
    XCTAssertEqual((shown as! CGColor).alpha, 1)
    XCTAssertEqual((hidden as! CGColor).alpha, 0)
    let strokeKey = NSAttributedString.Key(rawValue: kCTStrokeColorAttributeName as String)
    XCTAssertEqual((string?.attribute(strokeKey, at: 4, effectiveRange: nil) as! CGColor).alpha, 0)
  }

  func testACaptionIgnoresTheKey() {
    XCTAssertEqual(ExportSession.overlayLayer(text(reveal: true, kind: "caption"), renderSize: size).sublayers?.count, 1)
  }
}
