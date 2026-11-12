import type { DistributionType, LightingStatus, QualityWarning } from "@/types"

/**
 * Single source for every explanation shown in tooltips and analysis panels.
 * Values mirror backend/predictive_engine.py (ASTM D610 scale) and
 * backend/spread_analysis.py (distribution types).
 */

export const RUST_PERCENT_INFO =
  "Share of the detected metal surface covered by rust. The AI segments the photo into metal and rust areas; background is ignored, so the value is rust ÷ metal surface, not rust ÷ whole photo."

export const ASTM_GRADE_INFO =
  "ASTM D610 is the standard scale for rating rust on steel surfaces. Grades run from 10 (no rust) to 0 (more than half the surface rusted). The letter after the grade is the distribution type, e.g. 5-S."

export const DISTRIBUTION_INFO =
  "How the rust is spread across the surface, measured from the shape, size and position of the detected rust areas (geometric spread analysis)."

export const PRIORITY_INFO =
  "Maintenance urgency from the predictive engine: a linear-regression corrosion rate projects how many days remain until the surface reaches 33% rust (ASTM grade 1). The rate is scaled by how widely the rust is spread: rust found across more of the surface is projected to grow faster (×0.85 when concentrated, up to ×1.30 when it covers the whole surface)."

export const DSS_INFO =
  "Decision Support System: the recommended maintenance action for this ASTM grade."

export const LIGHTING_INFO =
  "Brightness check of the photo. Very dark or blown-out photos are rejected; dim or glare-heavy photos are analyzed but may be less accurate."

/** ASTM D610 grade bands: [grade, maximum rust %, short label]. */
export const ASTM_GRADES: ReadonlyArray<{ grade: number; maxPercent: number | null; label: string }> = [
  { grade: 10, maxPercent: 0.01, label: "No rust" },
  { grade: 9, maxPercent: 0.03, label: "Minute traces" },
  { grade: 8, maxPercent: 0.1, label: "Few isolated spots" },
  { grade: 7, maxPercent: 0.3, label: "Scattered spots" },
  { grade: 6, maxPercent: 1, label: "Light rusting" },
  { grade: 5, maxPercent: 3, label: "Moderate rusting" },
  { grade: 4, maxPercent: 10, label: "Considerable rusting" },
  { grade: 3, maxPercent: 16, label: "Heavy rusting" },
  { grade: 2, maxPercent: 33, label: "Severe rusting" },
  { grade: 1, maxPercent: 50, label: "Extensive rusting" },
  { grade: 0, maxPercent: null, label: "Over half the surface rusted" },
]

export const DISTRIBUTION_TYPES: Record<
  DistributionType,
  { name: string; description: string }
> = {
  S: {
    name: "Spot",
    description: "Rust concentrated in a few larger, localized areas.",
  },
  G: {
    name: "General",
    description: "Rust spread widely across most of the surface.",
  },
  P: {
    name: "Pinpoint",
    description: "Rust as many very small, scattered points.",
  },
  H: {
    name: "Hybrid",
    description: "A mix of larger spots and many pinpoints on the same surface.",
  },
}

export const PRIORITY_TIERS: Record<string, string> = {
  "Monitoring Required": "More than 180 days until critical. Keep inspecting on schedule.",
  "Elevated Priority": "180 days or fewer until critical. Plan maintenance soon.",
  CRITICAL: "33% rust or more (ASTM grade 1 or 0). Act immediately.",
}

export const LIGHTING_STATUSES: Record<LightingStatus, string> = {
  ok: "Lighting is good.",
  low_light: "The photo is dim. Results may under- or over-estimate rust; retake in brighter light if possible.",
  overexposed: "The photo is very bright or has glare. Results may be less accurate; avoid direct light or flash.",
}

export const QUALITY_WARNINGS: Record<QualityWarning, { title: string; text: string }> = {
  slightly_blurry: {
    title: "Slightly blurry",
    text: "Fine rust spots may be missed or merged. Hold the camera steady and tap to focus for a sharper photo.",
  },
  small_surface: {
    title: "Metal is small in the frame",
    text: "The metal covers less than 15% of the photo, so small rust areas are measured from few pixels. Move closer so the metal fills most of the frame.",
  },
}

export const QUALITY_INFO =
  "Checks on the photo itself before analysis: lighting, sharpness and how much of the frame the metal fills. Unusable photos are rejected; usable but imperfect ones are analyzed and flagged here."

/** Rust coverage at which a surface is treated as critical (start of ASTM grade 1). */
export const CRITICAL_RUST_PERCENT = 33

/** ASTM D610 grade for a rust percentage (mirrors backend/predictive_engine.py). */
export function gradeForPercent(rustPercent: number): number {
  const band = ASTM_GRADES.find(
    (entry) => entry.maxPercent !== null && rustPercent <= entry.maxPercent,
  )
  return band ? band.grade : 0
}

export function gradeBandText(grade: number): string {
  const band = ASTM_GRADES.find((entry) => entry.grade === grade)
  if (!band) return `Grade ${grade}`
  const range =
    band.maxPercent === null ? "more than 50% rust" : `up to ${band.maxPercent}% rust`
  return `Grade ${grade}: ${band.label} (${range})`
}

export function distributionName(type: DistributionType | null): string {
  return type ? `${DISTRIBUTION_TYPES[type].name} (${type})` : "—"
}

export function rustExplanation(
  rustPercent: number,
  distributionType: DistributionType | null,
): string {
  if (rustPercent <= 0) {
    return "No rust was detected on the metal surface."
  }
  const spread = distributionType
    ? ` The rust pattern is ${DISTRIBUTION_TYPES[distributionType].name.toLowerCase()}: ${DISTRIBUTION_TYPES[distributionType].description.charAt(0).toLowerCase()}${DISTRIBUTION_TYPES[distributionType].description.slice(1)}`
    : ""
  return `About ${rustPercent}% of the detected metal surface is covered by rust.${spread}`
}

export function classificationExplanation(
  astmGrade: number,
  astmRating: string,
  priorityLevel: string,
  daysToCritical: number | null,
  spreadCoverage: number | null = null,
  spreadFactor: number | null = null,
): string {
  const band = gradeBandText(astmGrade)
  const critical = priorityLevel === "CRITICAL"
  const timeline = critical
    ? "The surface is at or beyond the critical threshold (33% rust)."
    : daysToCritical !== null
      ? `At the current corrosion rate it is projected to reach the critical threshold (33% rust) in about ${daysToCritical} days.`
      : ""
  // How the measured spread changed the projected rate (not shown once already critical).
  const spread =
    !critical && spreadCoverage !== null && spreadFactor !== null
      ? ` Rust is found across ${Math.round(spreadCoverage * 100)}% of the surface, so the projected rate is scaled ×${spreadFactor.toFixed(2)}.`
      : ""
  return `ASTM D610 rating ${astmRating}. ${band}. Priority: ${priorityLevel}. ${timeline}${spread}`.trim()
}
