import Foundation

/// `slideOffsets`' result: where the outgoing frame (a) and the incoming frame (b) sit — how far each is moved from its
/// place, as fractions of the frame in SCREEN coordinates (x to the right, y DOWN; Core Image is y-up, so the drawing
/// code negates y) — and which one is drawn on top.
struct SlideOffsets: Equatable {
  let ax: Double
  let ay: Double
  let bx: Double
  let by: Double
  let incomingOnTop: Bool
}

/// Mirror of src/editor/model/transitionMath.ts — the constants and the formulas must stay identical (checked by
/// src/editor/model/__tests__/transitionMath.parity.test.ts). Pure maths: the images are built in TransitionMasks.swift.
///
/// `progress` = 0…1 across the transition window: at 0 only the OUTGOING frame (a) shows, at 1 only the INCOMING
/// frame (b). Every function clamps it first (`unitProgress`), so every result is finite and in its range.
///
/// Space: everything is a FRACTION OF THE FRAME in SCREEN coordinates — origin at the frame's top-left corner, x to
/// the right, y DOWN. So "left" is −x, "right" +x, "up" −y, "down" +y, and "clockwise" is as seen on the screen.
/// Nothing here is in pixels or in Core Image's bottom-left space: the renderer converts once, where it draws
/// (y_ci = height − y_screen, so a y offset changes sign).
enum TransitionMath {
  static let pixelMax: Double = 0.05

  /// Content value burned into the video (`TRANSITION_COLORS.flash`).
  static let flashColor = "#FFFFFF"

  private static let tau = 2 * Double.pi

  /// The progress every function works with: inside 0…1; not a number counts as 0 (the outgoing frame).
  static func unitProgress(_ progress: Double) -> Double {
    if progress.isNaN { return 0 }
    return min(1, max(0, progress))
  }

  /// 0 at both ends of the window, 1 at the cut. The white flash's weight (over the outgoing frame before the cut,
  /// p < 0.5; over the incoming one from it on).
  static func dip(_ progress: Double) -> Double {
    let p = unitProgress(progress)
    return 1 - abs(2 * p - 1)
  }

  /// The four transitions in which one frame slides over or off the other, which stays still; nil for any other type.
  static func slideOffsets(_ type: String, _ progress: Double) -> SlideOffsets? {
    let p = unitProgress(progress)
    switch type {
    case "cover": return SlideOffsets(ax: 0, ay: 0, bx: 1 - p, by: 0, incomingOnTop: true)            // in from the right
    case "reveal": return SlideOffsets(ax: 0 - p, ay: 0, bx: 0, by: 0, incomingOnTop: false)          // off to the left
    case "coverUp": return SlideOffsets(ax: 0, ay: 0, bx: 0, by: 1 - p, incomingOnTop: true)          // up from below
    case "revealDown": return SlideOffsets(ax: 0, ay: p, bx: 0, by: 0, incomingOnTop: false)          // down and off
    default: return nil
    }
  }

  /// The circle's radius as a fraction of the frame's half-diagonal (1 = it passes through the four corners), centred
  /// on the frame: inside it is the incoming frame (open) or the outgoing one (close). Nil for any other type.
  static func irisRadius(_ type: String, _ progress: Double) -> Double? {
    let p = unitProgress(progress)
    switch type {
    case "circleOpen": return p
    case "circleClose": return 1 - p
    default: return nil
    }
  }

  /// The diagonal wipe: the incoming frame shows where u + v < this (u, v = fractions from the top-left corner: 0
  /// there, 2 at the bottom-right).
  static func diagonalEdge(_ progress: Double) -> Double {
    let p = unitProgress(progress)
    return 2 * p
  }

  /// The clock wipe: radians swept clockwise (on screen) from 12 o'clock about the frame's centre; the incoming frame
  /// shows inside the sweep. A point at (u, v) is at the angle atan2(u − 0.5, 0.5 − v), taken in 0…2π: straight up 0,
  /// right π/2, down π, left 3π/2.
  static func clockAngle(_ progress: Double) -> Double {
    let p = unitProgress(progress)
    return tau * p
  }

  /// Pixelate: the block's side as a fraction of the frame's shorter side. 0 at both ends: no blocks (the drawing
  /// code skips the filter).
  static func pixelSize(_ progress: Double) -> Double {
    let p = unitProgress(progress)
    return TransitionMath.pixelMax * dip(p)
  }
}
