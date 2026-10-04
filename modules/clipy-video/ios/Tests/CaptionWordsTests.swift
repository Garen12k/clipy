import Foundation
import QuartzCore
import UIKit
import XCTest
@testable import ClipyVideo

/// The word list behind the caption highlight in the export (`CaptionWords`): which characters each word covers
/// and when it is lit, on the composition's clock.
final class CaptionWordsTests: XCTestCase {
  private func word(_ text: String, _ start: Double, _ end: Double) -> (text: String, start: Double, end: Double) {
    return (text: text, start: start, end: end)
  }

  func testRangesAndCompositionTimes() {
    // A caption shown from 2 s to 4 s; word times are seconds since its start.
    let s = CaptionWords.spans(text: "Hello big world", words: [word("Hello", 0, 0.5), word("big", 0.5, 1), word("world", 1.25, 2)], start: 2, end: 4)
    XCTAssertEqual(s.count, 3)
    XCTAssertEqual(s[0].range, NSRange(location: 0, length: 5))
    XCTAssertEqual(s[0].start, 2)
    XCTAssertEqual(s[0].end, 2.5)
    XCTAssertEqual(s[1].range, NSRange(location: 6, length: 3))
    XCTAssertEqual(s[1].start, 2.5)
    XCTAssertEqual(s[1].end, 3)
    XCTAssertEqual(s[2].range, NSRange(location: 10, length: 5))
    XCTAssertEqual(s[2].start, 3.25)
    XCTAssertEqual(s[2].end, 4)
  }

  func testRepeatedWordsAreFoundInOrder() {
    // The second "the" is the one after "cat", not the first again.
    let s = CaptionWords.spans(text: "the cat the hat", words: [word("the", 0, 1), word("cat", 1, 2), word("the", 2, 3), word("hat", 3, 4)], start: 0, end: 4)
    XCTAssertEqual(s.map { $0.range.location }, [0, 4, 8, 12])
    XCTAssertEqual(s.map { $0.range.length }, [3, 3, 3, 3])
  }

  func testUTF16Ranges() {
    // "😀" is two UTF-16 units, so "ok" starts at 3 (not 2).
    let s = CaptionWords.spans(text: "😀 ok", words: [word("😀", 0, 1), word("ok", 1, 2)], start: 0, end: 2)
    XCTAssertEqual(s.count, 2)
    XCTAssertEqual(s[0].range, NSRange(location: 0, length: 2))
    XCTAssertEqual(s[1].range, NSRange(location: 3, length: 2))
  }

  func testTimesAreClampedIntoTheCaption() {
    let s = CaptionWords.spans(text: "a b c", words: [word("a", -1, 0.5), word("b", 0.5, 9), word("c", 5, 6)], start: 10, end: 11)
    // "a" starts at the caption's start, "b" ends at its end, "c" lies wholly after it → no time left → skipped.
    XCTAssertEqual(s.count, 2)
    XCTAssertEqual(s[0].start, 10)
    XCTAssertEqual(s[0].end, 10.5)
    XCTAssertEqual(s[1].start, 10.5)
    XCTAssertEqual(s[1].end, 11)
  }

  func testSkipsMissingAndEmptyWords() {
    // "zzz" is not in the text and "" is empty: both skipped, and the search goes on from where it was.
    let s = CaptionWords.spans(text: "one two", words: [word("one", 0, 1), word("zzz", 1, 2), word("", 1, 2), word("two", 2, 3)], start: 0, end: 3)
    XCTAssertEqual(s.map { $0.range.location }, [0, 4])
    // Out of order: "one" comes before the end of "two" in the text, so it cannot be placed.
    let backwards = CaptionWords.spans(text: "one two", words: [word("two", 0, 1), word("one", 1, 2)], start: 0, end: 3)
    XCTAssertEqual(backwards.map { $0.range.location }, [4])
    // A word with no length in time, or a time that is not a number.
    let timeless = CaptionWords.spans(text: "one two", words: [word("one", 1, 1), word("two", .nan, 2)], start: 0, end: 3)
    XCTAssertTrue(timeless.isEmpty)
  }

  func testNoWords() {
    XCTAssertTrue(CaptionWords.spans(text: "Hello", words: [], start: 0, end: 2).isEmpty)
    XCTAssertTrue(CaptionWords.spans(text: "", words: [word("Hello", 0, 1)], start: 0, end: 2).isEmpty)
  }

  /// The layer part: a default text has the one text layer it always had; glow and shadow go below it, one layer
  /// per word above it.
  func testLayerTree() {
    let size = CGSize(width: 1080, height: 1920)
    // A fresh record each time: `@Field` storage is a reference, so a copied record would share its values.
    func text() -> ExportOverlay {
      var o = ExportOverlay()
      o.text = "Hello there"; o.start = 0; o.end = 2
      return o
    }
    let plain = text()
    let still = ExportSession.overlayLayer(plain, renderSize: size)
    XCTAssertEqual(still.sublayers?.count, 1)
    XCTAssertEqual((still.animation(forKey: "visible") as? CABasicAnimation)?.fromValue as? Double, 1)

    var styled = text()
    var style = ExportTextStyle()
    style.opacity = 0.5
    style.shadowColor = "#000000"; style.shadowOpacity = 0.6; style.shadowDistance = 0.06; style.shadowBlur = 0.1
    style.glowColor = "#FFFFFF"; style.glowSize = 0.25
    styled.style = style
    let rich = ExportSession.overlayLayer(styled, renderSize: size)
    XCTAssertEqual(rich.sublayers?.count, 3)                       // glow, shadow, fill
    XCTAssertEqual(rich.sublayers?[0].shadowOffset, CGSize.zero)
    XCTAssertEqual(rich.sublayers?[1].opacity ?? 0, 0.6, accuracy: 1e-6)
    XCTAssertEqual(rich.sublayers?[2].shadowOpacity, 0)
    XCTAssertEqual((rich.animation(forKey: "visible") as? CABasicAnimation)?.fromValue as? Double, 0.5)

    var caption = text()
    caption.kind = "caption"; caption.highlightColor = "#FFE600"; caption.start = 2; caption.end = 4
    var hello = ExportCaptionWord(); hello.text = "Hello"; hello.start = 0; hello.end = 1
    var there = ExportCaptionWord(); there.text = "there"; there.start = 1; there.end = 2
    caption.words = [hello, there]
    let sung = ExportSession.overlayLayer(caption, renderSize: size)
    XCTAssertEqual(sung.sublayers?.count, 3)                       // fill, then one layer per word
    XCTAssertEqual(sung.sublayers?[1].animation(forKey: "visible")?.beginTime, 2)
    XCTAssertEqual(sung.sublayers?[1].animation(forKey: "visible")?.duration, 1)
    XCTAssertEqual(sung.sublayers?[2].animation(forKey: "visible")?.beginTime, 3)
    XCTAssertEqual(sung.sublayers?[1].opacity, 0)
  }
}
