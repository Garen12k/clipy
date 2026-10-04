import AVFoundation
import CoreMedia
import XCTest
@testable import ClipyVideo

/// The vectors of src/editor/model/__tests__/audioMix.vectors.ts. The tables below are checked against the TS vectors
/// by src/editor/model/__tests__/audioMix.parity.test.ts — keep the literals identical.
struct AudioFitVector {
  let name: String
  let fadeIn: Double
  let fadeOut: Double
  let length: Double
  let fittedIn: Double
  let fittedOut: Double
}

struct AudioEnvelopeVector {
  let name: String
  let local: Double
  let length: Double
  let fadeIn: Double
  let fadeOut: Double
  let expect: Double
}

struct AudioDuckVector {
  let name: String
  let intervals: [MixInterval]
  let time: Double
  let expect: Double
}

/// A gain curve the app built (`trackGainCurve` / `clipGainCurve`): what the export receives and turns into ramps.
struct AudioCurveVector {
  let name: String
  let points: [GainPoint]
}

let audioFitVectors: [AudioFitVector] = [
  AudioFitVector(name: "fits", fadeIn: 1, fadeOut: 2, length: 10, fittedIn: 1, fittedOut: 2),
  AudioFitVector(name: "exactly fills", fadeIn: 4, fadeOut: 6, length: 10, fittedIn: 4, fittedOut: 6),
  AudioFitVector(name: "uneven shrink", fadeIn: 3, fadeOut: 1, length: 2, fittedIn: 1.5, fittedOut: 0.5),
  AudioFitVector(name: "even shrink", fadeIn: 5, fadeOut: 5, length: 4, fittedIn: 2, fittedOut: 2),
  AudioFitVector(name: "negative fade", fadeIn: -1, fadeOut: 2, length: 10, fittedIn: 0, fittedOut: 2),
  AudioFitVector(name: "no length", fadeIn: 1, fadeOut: 1, length: 0, fittedIn: 0, fittedOut: 0),
]

let audioEnvelopeVectors: [AudioEnvelopeVector] = [
  AudioEnvelopeVector(name: "start", local: 0, length: 10, fadeIn: 2, fadeOut: 4, expect: 0),
  AudioEnvelopeVector(name: "mid fade-in", local: 1, length: 10, fadeIn: 2, fadeOut: 4, expect: 0.5),
  AudioEnvelopeVector(name: "end of fade-in", local: 2, length: 10, fadeIn: 2, fadeOut: 4, expect: 1),
  AudioEnvelopeVector(name: "plateau", local: 5, length: 10, fadeIn: 2, fadeOut: 4, expect: 1),
  AudioEnvelopeVector(name: "start of fade-out", local: 6, length: 10, fadeIn: 2, fadeOut: 4, expect: 1),
  AudioEnvelopeVector(name: "mid fade-out", local: 8, length: 10, fadeIn: 2, fadeOut: 4, expect: 0.5),
  AudioEnvelopeVector(name: "end", local: 10, length: 10, fadeIn: 2, fadeOut: 4, expect: 0),
  AudioEnvelopeVector(name: "before", local: -0.5, length: 10, fadeIn: 2, fadeOut: 4, expect: 0),
  AudioEnvelopeVector(name: "after", local: 10.5, length: 10, fadeIn: 2, fadeOut: 4, expect: 0),
  AudioEnvelopeVector(name: "fitted, mid fade-in", local: 0.75, length: 2, fadeIn: 3, fadeOut: 1, expect: 0.5),
  AudioEnvelopeVector(name: "fitted, the peak", local: 1.5, length: 2, fadeIn: 3, fadeOut: 1, expect: 1),
  AudioEnvelopeVector(name: "fitted, mid fade-out", local: 1.75, length: 2, fadeIn: 3, fadeOut: 1, expect: 0.5),
  AudioEnvelopeVector(name: "no fades, start", local: 0, length: 4, fadeIn: 0, fadeOut: 0, expect: 1),
  AudioEnvelopeVector(name: "no fades, middle", local: 2, length: 4, fadeIn: 0, fadeOut: 0, expect: 1),
  AudioEnvelopeVector(name: "no fades, end", local: 4, length: 4, fadeIn: 0, fadeOut: 0, expect: 1),
  AudioEnvelopeVector(name: "fade-in only, end", local: 4, length: 4, fadeIn: 1, fadeOut: 0, expect: 1),
  AudioEnvelopeVector(name: "fade-out only, start", local: 0, length: 4, fadeIn: 0, fadeOut: 1, expect: 1),
]

let audioIntervalTracks: [MixTrack] = [
  MixTrack(start: 12, trimStart: 0, trimEnd: 1, volume: 1, kind: "voice"),
  MixTrack(start: 4, trimStart: 1, trimEnd: 4, volume: 1, kind: "voice"),
  MixTrack(start: 0, trimStart: 0, trimEnd: 20, volume: 1, kind: "music"),
  MixTrack(start: 2, trimStart: 0, trimEnd: 3, volume: 1, kind: "voice"),
  MixTrack(start: 7, trimStart: 0, trimEnd: 1, volume: 1, kind: "voice"),
  MixTrack(start: 9, trimStart: 0, trimEnd: 1, volume: 1, kind: "sfx"),
]
let audioIntervalExpect: [MixInterval] = [MixInterval(start: 2, end: 8), MixInterval(start: 12, end: 13)]

let audioDuckVectors: [AudioDuckVector] = [
  AudioDuckVector(name: "well before", intervals: [MixInterval(start: 2, end: 4)], time: 1, expect: 1),
  AudioDuckVector(name: "ramp down starts", intervals: [MixInterval(start: 2, end: 4)], time: 1.7, expect: 1),
  AudioDuckVector(name: "half way down", intervals: [MixInterval(start: 2, end: 4)], time: 1.85, expect: 0.65),
  AudioDuckVector(name: "interval start", intervals: [MixInterval(start: 2, end: 4)], time: 2, expect: 0.3),
  AudioDuckVector(name: "inside", intervals: [MixInterval(start: 2, end: 4)], time: 3, expect: 0.3),
  AudioDuckVector(name: "interval end", intervals: [MixInterval(start: 2, end: 4)], time: 4, expect: 0.3),
  AudioDuckVector(name: "half way up", intervals: [MixInterval(start: 2, end: 4)], time: 4.15, expect: 0.65),
  AudioDuckVector(name: "ramp up ends", intervals: [MixInterval(start: 2, end: 4)], time: 4.3, expect: 1),
  AudioDuckVector(name: "well after", intervals: [MixInterval(start: 2, end: 4)], time: 5, expect: 1),
  AudioDuckVector(name: "no intervals", intervals: [], time: 3, expect: 1),
  AudioDuckVector(name: "close pair, up ramp wins", intervals: [MixInterval(start: 2, end: 4), MixInterval(start: 4.4, end: 6)], time: 4.1, expect: 0.5333333333333333),
  AudioDuckVector(name: "close pair, the crossing", intervals: [MixInterval(start: 2, end: 4), MixInterval(start: 4.4, end: 6)], time: 4.2, expect: 0.7666666666666666),
  AudioDuckVector(name: "close pair, down ramp wins", intervals: [MixInterval(start: 2, end: 4), MixInterval(start: 4.4, end: 6)], time: 4.3, expect: 0.5333333333333333),
]

let audioCurveVectors: [AudioCurveVector] = [
  AudioCurveVector(name: "ducked music with fades", points: [GainPoint(time: 1, gain: 0), GainPoint(time: 3, gain: 0.8), GainPoint(time: 4.7, gain: 0.8), GainPoint(time: 5, gain: 0.24), GainPoint(time: 7, gain: 0.24), GainPoint(time: 7.3, gain: 0.8), GainPoint(time: 10, gain: 0.8), GainPoint(time: 11, gain: 0)]),
  AudioCurveVector(name: "ducking off", points: [GainPoint(time: 1, gain: 0), GainPoint(time: 3, gain: 0.8), GainPoint(time: 10, gain: 0.8), GainPoint(time: 11, gain: 0)]),
  AudioCurveVector(name: "no fades, volume above 1", points: [GainPoint(time: 2, gain: 1.5), GainPoint(time: 7, gain: 1.5)]),
  AudioCurveVector(name: "two voices close together", points: [GainPoint(time: 0, gain: 1), GainPoint(time: 1.7, gain: 1), GainPoint(time: 2, gain: 0.3), GainPoint(time: 4, gain: 0.3), GainPoint(time: 4.1, gain: 0.5333333333333333), GainPoint(time: 4.2, gain: 0.7666666666666666), GainPoint(time: 4.3, gain: 0.5333333333333333), GainPoint(time: 4.4, gain: 0.3), GainPoint(time: 6, gain: 0.3), GainPoint(time: 6.3, gain: 1), GainPoint(time: 10, gain: 1)]),
  AudioCurveVector(name: "non-representable start, no fades", points: [GainPoint(time: 0.086, gain: 1), GainPoint(time: 0.286, gain: 1)]),
  AudioCurveVector(name: "non-representable start, fade-out", points: [GainPoint(time: 0.086, gain: 1), GainPoint(time: 0.186, gain: 1), GainPoint(time: 0.286, gain: 0)]),
  AudioCurveVector(name: "silent voice does not duck", points: [GainPoint(time: 0, gain: 1), GainPoint(time: 10, gain: 1)]),
  AudioCurveVector(name: "music starting under a voice", points: [GainPoint(time: 3, gain: 0.3), GainPoint(time: 5, gain: 0.3), GainPoint(time: 5.3, gain: 1), GainPoint(time: 7, gain: 1)]),
  AudioCurveVector(name: "speed 2 with fades", points: [GainPoint(time: 0, gain: 0), GainPoint(time: 1, gain: 1.5), GainPoint(time: 2, gain: 1.5), GainPoint(time: 4, gain: 0)]),
  AudioCurveVector(name: "no fades", points: [GainPoint(time: 0, gain: 0.5), GainPoint(time: 6, gain: 0.5)]),
  AudioCurveVector(name: "muted", points: [GainPoint(time: 0, gain: 0), GainPoint(time: 4, gain: 0)]),
  AudioCurveVector(name: "fitted fades", points: [GainPoint(time: 0, gain: 0), GainPoint(time: 1.5, gain: 1), GainPoint(time: 2, gain: 0)]),
]

final class AudioMixTests: XCTestCase {
  private func point(_ time: Double, _ gain: Double) -> GainPoint { GainPoint(time: time, gain: gain) }
  private func ramp(_ start: Double, _ end: Double, _ from: Double, _ to: Double) -> GainRamp { GainRamp(start: start, end: end, from: from, to: to) }
  private func assertRamps(_ got: [GainRamp], _ want: [GainRamp], _ label: String = "", file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(got.count, want.count, label, file: file, line: line)
    for (g, w) in zip(got, want) {
      XCTAssertEqual(g.start, w.start, accuracy: 1e-9, label, file: file, line: line)
      XCTAssertEqual(g.end, w.end, accuracy: 1e-9, label, file: file, line: line)
      XCTAssertEqual(g.from, w.from, accuracy: 1e-9, label, file: file, line: line)
      XCTAssertEqual(g.to, w.to, accuracy: 1e-9, label, file: file, line: line)
    }
  }

  // MARK: - The twins of audioMix.ts

  func testConstantsMatchTheApp() {
    XCTAssertEqual(AudioMix.duckLevel, 0.3)
    XCTAssertEqual(AudioMix.duckRamp, 0.3)
    XCTAssertEqual(AudioMix.tick, 1.0 / 600, accuracy: 1e-15)
    XCTAssertEqual(ExportSession.time(1).timescale, CMTimeScale(AudioMix.ticksPerSecond))
  }

  func testFitFadesVectors() {
    for v in audioFitVectors {
      let f = AudioMix.fitFades(fadeIn: v.fadeIn, fadeOut: v.fadeOut, length: v.length)
      XCTAssertEqual(f.fadeIn, v.fittedIn, accuracy: 1e-9, v.name)
      XCTAssertEqual(f.fadeOut, v.fittedOut, accuracy: 1e-9, v.name)
    }
  }

  func testFitFadesTreatsNonFiniteInputAsZero() {
    XCTAssertEqual(AudioMix.fitFades(fadeIn: .nan, fadeOut: 1, length: 10).fadeIn, 0)
    XCTAssertEqual(AudioMix.fitFades(fadeIn: .nan, fadeOut: 1, length: 10).fadeOut, 1)
    XCTAssertEqual(AudioMix.fitFades(fadeIn: 1, fadeOut: .infinity, length: 10).fadeOut, 0)
    XCTAssertEqual(AudioMix.fitFades(fadeIn: 1, fadeOut: 1, length: .nan).fadeIn, 0)
    XCTAssertEqual(AudioMix.fitFades(fadeIn: 1, fadeOut: 1, length: -3).fadeOut, 0)
  }

  func testFadeEnvelopeVectors() {
    for v in audioEnvelopeVectors {
      XCTAssertEqual(AudioMix.fadeEnvelope(local: v.local, length: v.length, fadeIn: v.fadeIn, fadeOut: v.fadeOut), v.expect, accuracy: 1e-9, v.name)
    }
    XCTAssertEqual(AudioMix.fadeEnvelope(local: .nan, length: 10, fadeIn: 1, fadeOut: 1), 0)
    XCTAssertEqual(AudioMix.fadeEnvelope(local: 1, length: .nan, fadeIn: 1, fadeOut: 1), 0)
    XCTAssertEqual(AudioMix.fadeEnvelope(local: 0, length: 0, fadeIn: 0, fadeOut: 0), 0)
    XCTAssertEqual(AudioMix.fadeEnvelope(local: 5, length: 10, fadeIn: .nan, fadeOut: .nan), 1)
  }

  func testVoiceIntervalsMergeTouchingAndOverlappingVoices() {
    XCTAssertEqual(AudioMix.voiceIntervals(audioIntervalTracks), audioIntervalExpect)
    XCTAssertEqual(AudioMix.voiceIntervals([]), [])
    let silent = MixTrack(start: 2, trimStart: 0, trimEnd: 2, volume: 0, kind: "voice")
    let broken = MixTrack(start: .nan, trimStart: 0, trimEnd: 2, volume: 1, kind: "voice")
    let empty = MixTrack(start: 1, trimStart: 3, trimEnd: 3, volume: 1, kind: "voice")
    XCTAssertEqual(AudioMix.voiceIntervals([silent, broken, empty]), [])
  }

  func testDuckFactorVectors() {
    for v in audioDuckVectors {
      XCTAssertEqual(AudioMix.duckFactorAt(v.intervals, time: v.time), v.expect, accuracy: 1e-9, v.name)
    }
    XCTAssertEqual(AudioMix.duckFactorAt([MixInterval(start: 2, end: 4)], time: .nan), 1)
  }

  // MARK: - Curves → ramps

  /// Every curve the app's vectors produce is usable as it is and becomes one ramp per segment, back to back.
  func testACurveBecomesOneRampPerSegment() {
    for v in audioCurveVectors {
      XCTAssertEqual(AudioMix.usable(v.points), v.points, v.name)
      let ramps = AudioMix.ramps(from: v.points)
      XCTAssertEqual(ramps.count, v.points.count - 1, v.name)
      for (i, r) in ramps.enumerated() {
        XCTAssertEqual(r.start, v.points[i].time, accuracy: 1e-9, v.name)
        XCTAssertEqual(r.end, v.points[i + 1].time, accuracy: 1e-9, v.name)
        XCTAssertEqual(r.from, v.points[i].gain, accuracy: 1e-9, v.name)
        XCTAssertEqual(r.to, v.points[i + 1].gain, accuracy: 1e-9, v.name)
        XCTAssertGreaterThanOrEqual(r.end - r.start, AudioMix.tick, v.name)
        if i > 0 { XCTAssertEqual(r.start, ramps[i - 1].end, v.name) }
        XCTAssertEqual(AudioMix.gain(at: (r.start + r.end) / 2, in: v.points), (r.from + r.to) / 2, accuracy: 1e-9, v.name)
      }
      for p in v.points { XCTAssertEqual(AudioMix.gain(at: p.time, in: v.points), p.gain, v.name) }
    }
  }

  func testGainOutsideACurveIsItsFirstOrLastGain() {
    let curve = [point(1, 0.1), point(3, 0.3), point(4, 0)]
    XCTAssertEqual(AudioMix.gain(at: 0, in: curve), 0.1)
    XCTAssertEqual(AudioMix.gain(at: 2, in: curve), 0.2, accuracy: 1e-9)
    XCTAssertEqual(AudioMix.gain(at: 9, in: curve), 0)
    XCTAssertEqual(AudioMix.gain(at: 1, in: []), 0)
    XCTAssertEqual(AudioMix.gain(at: .nan, in: curve), 0)
  }

  func testUsableSortsRepairsAndDropsBrokenPoints() {
    let points = [point(3, 0.5), point(.nan, 1), point(1, -2), point(2, .infinity), point(2, 1)]
    XCTAssertEqual(AudioMix.usable(points), [point(1, 0), point(2, 1), point(3, 0.5)])
    XCTAssertEqual(AudioMix.usable([]), [])
  }

  /// Breakpoints closer than one tick (1/600 s) are merged: at the very start the LATER gain wins (a fade-in too
  /// short to draw must not become a ramp up to the next breakpoint); anywhere else the earlier one is kept.
  func testUsableMergesBreakpointsCloserThanATick() {
    XCTAssertEqual(AudioMix.usable([point(1, 0), point(1.001, 1), point(5, 1)]), [point(1, 1), point(5, 1)])
    XCTAssertEqual(AudioMix.usable([point(1, 1), point(4.9995, 1), point(5, 0)]), [point(1, 1), point(4.9995, 1)])
    XCTAssertEqual(AudioMix.usable([point(1, 1), point(1, 0.5), point(1, 0.25)]), [point(1, 0.25)])
    XCTAssertEqual(AudioMix.ramps(from: [point(1, 0), point(1.001, 1)]), [])
    XCTAssertEqual(AudioMix.ramps(from: [point(2, 1)]), [])
  }

  /// A clip's curve (clip-local) at `bodyStart` 10, with 0.25 s transition handles each side: flat in the handles.
  func testRampsOverAClipsAudioRangeAreFlatInTheHandles() {
    let curve = [point(0, 0), point(1, 1.5), point(2, 1.5), point(4, 0)]
    assertRamps(AudioMix.ramps(from: curve, offset: 10, over: 9.75, to: 14.25), [
      ramp(9.75, 10, 0, 0), ramp(10, 11, 0, 1.5), ramp(11, 12, 1.5, 1.5), ramp(12, 14, 1.5, 0), ramp(14, 14.25, 0, 0),
    ])
    let plain = [point(0, 0.5), point(6, 0.5)]
    assertRamps(AudioMix.ramps(from: plain, offset: 3, over: 2.5, to: 9.5), [ramp(2.5, 3, 0.5, 0.5), ramp(3, 9, 0.5, 0.5), ramp(9, 9.5, 0.5, 0.5)])
  }

  /// The audio on the track is shorter than the curve (the file ran out, or the previous clip still holds the
  /// track): the ramps are cut at the range's ends, at the curve's gain there.
  func testRampsAreCutAtTheRangeEnds() {
    let curve = [point(0, 0), point(1, 1.5), point(2, 1.5), point(4, 0)]
    assertRamps(AudioMix.ramps(from: curve, offset: 10, over: 10.5, to: 13), [ramp(10.5, 11, 0.75, 1.5), ramp(11, 12, 1.5, 1.5), ramp(12, 13, 1.5, 0.75)])
  }

  func testAOnePointCurveIsOneFlatRamp() {
    assertRamps(AudioMix.ramps(from: [point(0, 0.6)], offset: 0, over: 2, to: 5), [ramp(2, 5, 0.6, 0.6)])
  }

  /// An audio track's curve is already in composition seconds (offset 0) and starts / ends with the track.
  func testRampsOfAnAudioTrack() {
    let curve = [point(1, 0), point(3, 0.8), point(10, 0.8), point(11, 0)]
    assertRamps(AudioMix.ramps(from: curve, offset: 0, over: 1, to: 11), [ramp(1, 3, 0, 0.8), ramp(3, 10, 0.8, 0.8), ramp(10, 11, 0.8, 0)])
  }

  func testABreakpointWithinATickOfARangeEndIsLeftOut() {
    let curve = [point(0, 1), point(3, 1), point(4, 0)]
    assertRamps(AudioMix.ramps(from: curve, offset: 0, over: 0, to: 3.001), [ramp(0, 3.001, 1, 0.999)])
    assertRamps(AudioMix.ramps(from: curve, offset: 0, over: 2.999, to: 4), [ramp(2.999, 4, 1, 0)])
  }

  func testNoRampsForABrokenRangeOrNoPoints() {
    let curve = [point(0, 1), point(4, 1)]
    XCTAssertEqual(AudioMix.ramps(from: curve, offset: 0, over: 2, to: 2), [])
    XCTAssertEqual(AudioMix.ramps(from: curve, offset: 0, over: 3, to: 2), [])
    XCTAssertEqual(AudioMix.ramps(from: curve, offset: 0, over: 2, to: 2.001), [])
    XCTAssertEqual(AudioMix.ramps(from: curve, offset: .nan, over: 0, to: 2), [])
    XCTAssertEqual(AudioMix.ramps(from: curve, offset: 0, over: .nan, to: 2), [])
    XCTAssertEqual(AudioMix.ramps(from: [], offset: 0, over: 0, to: 2), [])
  }

  /// Clips i and i + 2 share an audio track; their audio ranges do not overlap, so neither do their ramps.
  func testRampsOfTwoClipsOnOneTrackNeverOverlap() {
    let faded = [point(0, 0), point(1, 1), point(3, 1), point(4, 0)]
    let first = AudioMix.ramps(from: faded, offset: 0, over: 0, to: 4.25)
    let second = AudioMix.ramps(from: faded, offset: 6, over: 4.25, to: 10)
    let all = first + second
    for i in all.indices.dropFirst() { XCTAssertGreaterThanOrEqual(all[i].start, all[i - 1].end) }
    XCTAssertEqual(first.last?.end, 4.25)
    XCTAssertEqual(second.first?.start, 4.25)
  }

  // MARK: - The request → the mix

  func testARequestCurveIsUsedAndAMissingOneFallsBack() {
    var a = ExportGainPoint(); a.time = 0; a.gain = 0
    var b = ExportGainPoint(); b.time = 2; b.gain = 1.5
    var clip = ExportClip()
    clip.volume = 0.5
    XCTAssertEqual(ExportSession.clipGain(clip), [point(0, 0.5)])
    clip.muted = true
    XCTAssertEqual(ExportSession.clipGain(clip), [point(0, 0)])
    clip.gain = [b, a]
    XCTAssertEqual(ExportSession.clipGain(clip), [point(0, 0), point(2, 1.5)], "the curve wins over volume / muted")
    XCTAssertEqual(ExportSession.gainPoints([], fallback: 1), [point(0, 1)])
    XCTAssertEqual(ExportSession.gainPoints([], fallback: -1), [point(0, 0)])
    XCTAssertEqual(ExportSession.gainPoints([], fallback: .nan), [point(0, 0)])
  }

  /// The mix parameters hold one volume ramp per segment; before the first ramp the volume is its start.
  func testApplyRampsDrawsEachRampOnTheMixParameters() {
    let params = AVMutableAudioMixInputParameters()
    ExportSession.applyRamps([ramp(1, 3, 0, 0.8), ramp(3, 10, 0.8, 0.8), ramp(10, 11, 0.8, 0)], to: params)
    func volumes(at seconds: Double) -> (from: Float, to: Float, range: CMTimeRange)? {
      var from: Float = -1
      var to: Float = -1
      var range = CMTimeRange.zero
      guard params.getVolumeRamp(for: ExportSession.time(seconds), startVolume: &from, endVolume: &to, timeRange: &range) else { return nil }
      return (from: from, to: to, range: range)
    }
    let fadeIn = volumes(at: 2)
    XCTAssertEqual(fadeIn?.from ?? -1, 0, accuracy: 1e-6); XCTAssertEqual(fadeIn?.to ?? -1, 0.8, accuracy: 1e-6)
    XCTAssertEqual(fadeIn?.range.start.seconds ?? -1, 1, accuracy: 1e-6); XCTAssertEqual(fadeIn?.range.end.seconds ?? -1, 3, accuracy: 1e-6)
    let plateau = volumes(at: 5)
    XCTAssertEqual(plateau?.from ?? -1, 0.8, accuracy: 1e-6); XCTAssertEqual(plateau?.to ?? -1, 0.8, accuracy: 1e-6)
    let fadeOut = volumes(at: 10.5)
    XCTAssertEqual(fadeOut?.from ?? -1, 0.8, accuracy: 1e-6); XCTAssertEqual(fadeOut?.to ?? -1, 0, accuracy: 1e-6)
    let before = volumes(at: 0.5)
    XCTAssertEqual(before?.from ?? -1, 0, accuracy: 1e-6); XCTAssertEqual(before?.to ?? -1, 0, accuracy: 1e-6)
  }
}
