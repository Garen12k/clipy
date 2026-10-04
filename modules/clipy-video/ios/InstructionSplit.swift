import AVFoundation

/// One picture-in-picture layer on the composition timeline: how the compositor draws it (`spec`, a transparent
/// `LayerSpec` on the layer's own video track) and the composition range it is shown in — its start to its end,
/// already cut at the end of the video.
struct PlacedOverlay {
  let spec: LayerSpec
  let range: CMTimeRange
}

/// Layers start and end anywhere on the timeline, but a compositor instruction lists the tracks it needs for its
/// WHOLE range. So the instructions built for the main clips are cut at every layer start / end inside them: each
/// piece then has one constant set of layers. `splitRanges` and `intersects` are pure (InstructionSplitTests).
enum InstructionSplit {
  /// Each range cut at the boundaries lying STRICTLY inside it, in time order: one list of pieces per range, back to
  /// back from the range's start to its end. A boundary on an edge or outside a range, a repeated boundary and one
  /// that is not a number cut nothing, so a range no boundary falls into comes back as its one piece.
  static func splitRanges(ranges: [CMTimeRange], boundaries: [CMTime]) -> [[CMTimeRange]] {
    let usable: [CMTime] = boundaries.filter { (t: CMTime) -> Bool in t.isNumeric }
    let cuts: [CMTime] = usable.sorted { (a: CMTime, b: CMTime) -> Bool in CMTimeCompare(a, b) < 0 }
    return ranges.map { (range: CMTimeRange) -> [CMTimeRange] in
      var pieces: [CMTimeRange] = []
      var from = range.start
      for cut in cuts {
        guard CMTimeCompare(cut, from) > 0 && CMTimeCompare(cut, range.end) < 0 else { continue }
        pieces.append(CMTimeRange(start: from, end: cut))
        from = cut
      }
      pieces.append(CMTimeRange(start: from, end: range.end))
      return pieces
    }
  }

  /// True when `[a.start, a.end)` and `[b.start, b.end)` share any time (touching ends do not count).
  static func intersects(_ a: CMTimeRange, _ b: CMTimeRange) -> Bool {
    return CMTimeCompare(a.start, b.end) < 0 && CMTimeCompare(a.end, b.start) > 0
  }

  /// The instructions with the layers attached: each `ClipyInstruction` is cut at the layer starts / ends inside it
  /// and every piece lists, in draw order, the layers shown during it (their tracks join the piece's required
  /// tracks). A piece keeps its instruction's main layers and transition — the window's own start and duration, so
  /// the transition's progress is unchanged — and the effects overlapping it. An instruction no layer touches is
  /// passed through as the same object; without layers the list comes back as it is.
  static func attach(_ overlays: [PlacedOverlay], to instructions: [AVVideoCompositionInstructionProtocol]) -> [AVVideoCompositionInstructionProtocol] {
    guard !overlays.isEmpty else { return instructions }
    var boundaries: [CMTime] = []
    for o in overlays {
      boundaries.append(o.range.start)
      boundaries.append(o.range.end)
    }
    let ranges: [CMTimeRange] = instructions.map { (i: AVVideoCompositionInstructionProtocol) -> CMTimeRange in i.timeRange }
    let pieces = splitRanges(ranges: ranges, boundaries: boundaries)
    var out: [AVVideoCompositionInstructionProtocol] = []
    for (i, instruction) in instructions.enumerated() {
      guard let inst = instruction as? ClipyInstruction else { out.append(instruction); continue }
      for piece in pieces[i] {
        let shown: [PlacedOverlay] = overlays.filter { (o: PlacedOverlay) -> Bool in intersects(o.range, piece) }
        let active: [LayerSpec] = shown.map { (o: PlacedOverlay) -> LayerSpec in o.spec }
        if active.isEmpty, pieces[i].count == 1 { out.append(inst); continue }
        let from = piece.start.seconds, to = piece.end.seconds
        let effects: [ActiveEffectSpec] = inst.effects.filter { (e: ActiveEffectSpec) -> Bool in e.overlaps(from: from, to: to) }
        out.append(ClipyInstruction(timeRange: piece, layers: inst.layers, transition: inst.transition, overlays: active,
                                    effects: effects))
      }
    }
    return out
  }
}
