import CoreGraphics
import CoreImage
import Foundation
import UIKit

/// Shadows take `shadow`, highlights `highlight` (#RRGGBB); `amount` 0…1 is how much of the toned picture is mixed in.
struct SplitTone: Equatable {
  let shadow: String
  let highlight: String
  let amount: Double
}

/// One recipe filter: its Adjust values and, for six of the twelve, a split tone.
struct FilterRecipe: Equatable {
  let adjust: AdjustValues
  let tone: SplitTone?
}

/// Mirror of the `FilterStep` union in src/editor/model/filterRecipes.ts.
enum FilterStep: Equatable {
  case adjust(AdjustStep)
  case splitTone(shadow: String, highlight: String, amount: Double)
}

/// Mirror of src/editor/model/filterRecipes.ts — the ids, the rows and the stage rule must stay identical (checked by
/// src/editor/model/__tests__/filterRecipes.parity.test.ts). The 20 older filters are Core Image chains in
/// Effects.swift; these twelve are Adjust values run through `Adjust.apply` in two stages, with the split tone between.
enum FilterRecipes {
  static let ids = ["kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"]

  static let recipes: [String: FilterRecipe] = [
    "kodak": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: 0.15, saturation: 0.15, exposure: 0, temperature: 0.2, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0.08, grain: 0.15), tone: SplitTone(shadow: "#27413A", highlight: "#FFC98A", amount: 0.25)),
    "fuji": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: 0.1, saturation: 0.1, exposure: 0, temperature: -0.12, tint: -0.15, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0.1, grain: 0), tone: SplitTone(shadow: "#1F4A45", highlight: "#F2F5E6", amount: 0.2)),
    "matte": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: -0.25, saturation: -0.2, exposure: 0, temperature: 0.08, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0.7, grain: 0.3), tone: nil),
    "bleach": FilterRecipe(adjust: AdjustValues(brightness: -0.05, contrast: 0.5, saturation: -0.55, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0.2, vignette: 0, fade: 0, grain: 0.2), tone: nil),
    "dusk": FilterRecipe(adjust: AdjustValues(brightness: -0.1, contrast: 0, saturation: 0.15, exposure: 0, temperature: 0.15, tint: 0.3, highlights: 0, shadows: 0, sharpen: 0, vignette: 0.25, fade: 0, grain: 0), tone: SplitTone(shadow: "#3B2A6B", highlight: "#FF9E6B", amount: 0.35)),
    "moody": FilterRecipe(adjust: AdjustValues(brightness: -0.12, contrast: 0.25, saturation: -0.3, exposure: 0, temperature: -0.35, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0.35, fade: 0.15, grain: 0), tone: nil),
    "tealOrange": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: 0.2, saturation: 0.1, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0), tone: SplitTone(shadow: "#0E6E78", highlight: "#FF9A45", amount: 0.5)),
    "blush": FilterRecipe(adjust: AdjustValues(brightness: 0.2, contrast: -0.2, saturation: -0.15, exposure: 0, temperature: 0, tint: 0.25, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0.3, grain: 0), tone: SplitTone(shadow: "#8A5A7A", highlight: "#FFE3EA", amount: 0.25)),
    "grit": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: 0.7, saturation: -1, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: -0.4, sharpen: 0.5, vignette: 0.3, fade: 0, grain: 0.6), tone: nil),
    "silver": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: -0.2, saturation: -1, exposure: 0, temperature: 0, tint: 0, highlights: -0.2, shadows: 0, sharpen: 0, vignette: 0, fade: 0.45, grain: 0.15), tone: nil),
    "indigo": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: 0.15, saturation: -1, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0), tone: SplitTone(shadow: "#10214F", highlight: "#DCE9FF", amount: 0.8)),
    "drama": FilterRecipe(adjust: AdjustValues(brightness: -0.15, contrast: 0.5, saturation: -0.25, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: -0.5, sharpen: 0.2, vignette: 0.6, fade: 0, grain: 0), tone: nil),
  ]

  /// The row as its two Adjust stages and the tone between them (`BEFORE_TONE`: the colour stage runs first); nil for
  /// any id that is not one of the twelve.
  static func stages(_ id: String?) -> (before: AdjustValues, tone: SplitTone?, after: AdjustValues)? {
    guard let id, let row = recipes[id] else { return nil }
    let a = row.adjust.sanitized
    var before = AdjustValues.neutral
    before.exposure = a.exposure
    before.temperature = a.temperature
    before.tint = a.tint
    before.brightness = a.brightness
    before.contrast = a.contrast
    before.saturation = a.saturation
    var after = AdjustValues.neutral
    after.highlights = a.highlights
    after.shadows = a.shadows
    after.sharpen = a.sharpen
    after.vignette = a.vignette
    after.fade = a.fade
    after.grain = a.grain
    return (before, row.tone, after)
  }

  /// The export recipe in order: colour stage, split tone, finishing stage. Empty for an old filter, nil or an unknown id.
  static func steps(_ id: String?) -> [FilterStep] {
    guard let s = stages(id) else { return [] }
    var out: [FilterStep] = Adjust.steps(s.before).map { (step: AdjustStep) -> FilterStep in FilterStep.adjust(step) }
    if let t = s.tone { out.append(FilterStep.splitTone(shadow: t.shadow, highlight: t.highlight, amount: t.amount)) }
    out.append(contentsOf: Adjust.steps(s.after).map { (step: AdjustStep) -> FilterStep in FilterStep.adjust(step) })
    return out
  }

  /// The filter `id` on `image` (`time` = the frame's composition time, for the grain), cropped to the image's
  /// extent. Nil when `id` is not a recipe filter — the caller then leaves the picture as it is.
  static func apply(_ id: String?, to image: CIImage, time: Double) -> CIImage? {
    guard let s = stages(id) else { return nil }
    let extent = image.extent
    var out = Adjust.apply(s.before, to: image, time: time)
    if let tone = s.tone { out = splitTone(out, tone: tone).cropped(to: extent) }
    return Adjust.apply(s.after, to: out, time: time).cropped(to: extent)
  }

  /// The split tone: `CIFalseColor` maps the picture's brightness onto the two colours (dark → shadow, light →
  /// highlight); that is laid over the picture with `CISoftLightBlendMode`, and the result is mixed in by `amount`
  /// (1 = all of it, no mix). A colour that is not #RRGGBB, an amount of 0 or less, an image without a finite extent,
  /// or a filter / key Core Image does not know → `image` unchanged.
  static func splitTone(_ image: CIImage, tone: SplitTone) -> CIImage {
    let extent = image.extent
    guard tone.amount.isFinite, tone.amount > 0, !extent.isInfinite, !extent.isEmpty,
          LayerBackground.isHexColor(tone.shadow), LayerBackground.isHexColor(tone.highlight),
          let ramp = Adjust.filtered(image, "CIFalseColor", [
            "inputColor0": CIColor(color: UIColor(hex: tone.shadow)),
            "inputColor1": CIColor(color: UIColor(hex: tone.highlight)),
          ]),
          let toned = Adjust.filtered(ramp.cropped(to: extent), "CISoftLightBlendMode", [kCIInputBackgroundImageKey: image])
    else { return image }
    let k = CGFloat(min(1, tone.amount))
    let full = toned.cropped(to: extent)
    return k >= 1 ? full : ClipyCompositor.dissolve(from: image, to: full, progress: k).cropped(to: extent)
  }
}
