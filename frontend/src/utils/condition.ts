import { STATUS } from "@/components/charts/chartTheme"
import type { AccountRole, AssetCondition, RateSource } from "@/types"

/**
 * The six action levels of the decision support (backend/decision_support.py), with the
 * status band each belongs to. Colour always means urgency here and always comes with
 * the level's name, never alone.
 */
export const ACTION_LEVELS: ReadonlyArray<{
  level: number
  strategy: string
  short: string
  band: "good" | "warning" | "serious" | "critical"
}> = [
  { level: 1, strategy: "No maintenance painting", short: "No work", band: "good" },
  { level: 2, strategy: "Spot touch-up", short: "Touch-up", band: "warning" },
  { level: 3, strategy: "Spot repair", short: "Spot repair", band: "warning" },
  { level: 4, strategy: "Spot repair and full overcoat", short: "Overcoat", band: "serious" },
  { level: 5, strategy: "Full removal and recoating", short: "Full recoat", band: "serious" },
  { level: 6, strategy: "Structural assessment", short: "Assess", band: "critical" },
]

export const BANDS: ReadonlyArray<{
  key: "good" | "warning" | "serious" | "critical"
  label: string
  levels: number[]
}> = [
  { key: "good", label: "No work (level 1)", levels: [1] },
  { key: "warning", label: "Spot work (levels 2-3)", levels: [2, 3] },
  { key: "serious", label: "Overcoat or full recoat (levels 4-5)", levels: [4, 5] },
  { key: "critical", label: "Structural assessment (level 6)", levels: [6] },
]

export function levelInfo(level: number) {
  return ACTION_LEVELS.find((item) => item.level === level) ?? ACTION_LEVELS[0]
}

export function levelColor(level: number): string {
  return STATUS[levelInfo(level).band]
}

export const ROLE_LABELS: Record<AccountRole, string> = {
  user: "Inspector",
  engineer: "Engineer",
  admin: "Admin",
}

export const RATE_SOURCE_LABELS: Record<RateSource, string> = {
  assumed: "Assumed",
  measured: "Measured",
  no_growth: "No growth measured",
}

/** A day count in the words people plan with. */
export function formatDays(days: number): string {
  if (days <= 0) return "now"
  if (days > 3650) return "more than 10 years"
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`
  if (days < 730) return `${Math.round(days / 30.4)} months`
  return `${Math.round(days / 365)} years`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function formatArea(area: number | null | undefined): string {
  if (area === null || area === undefined) return "-"
  return `${area.toLocaleString("en-US", { maximumFractionDigits: 2 })} m²`
}

export function formatRate(rate: number): string {
  return `${rate.toFixed(rate < 0.01 ? 4 : 3)}% per day`
}

/** When the current strategy should be carried out, in one phrase. */
export function deadlineText(condition: AssetCondition): string {
  if (condition.actionLevel === 6) return "Now"
  if (condition.actionLevel === 1) return "No work due"
  if (condition.rateSource === "no_growth") return "No growth measured"
  if (condition.actWithinDays === null || !condition.dueDate) return "-"
  const remaining = daysUntil(condition.dueDate)
  if (remaining < 0) return `Overdue since ${formatDate(condition.dueDate)}`
  if (remaining > 3650) return "More than 10 years away"
  return `By ${formatDate(condition.dueDate)}`
}

export function daysUntil(isoDate: string): number {
  const due = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

/** How the rate behind the deadline was obtained, in one sentence. */
export function rateExplanation(condition: AssetCondition): string {
  const trend = condition.trend
  if (trend.source === "measured") {
    const blended =
      trend.blendWeight < 1
        ? ` It is blended with the assumed rate (the measurement counts ${Math.round(trend.blendWeight * 100)}%) until there are 5 inspections.`
        : ""
    return `Measured from ${trend.usableInspections} inspections over ${Math.round(trend.spanDays)} days: ${formatRate(trend.fittedRate ?? 0)}.${blended}`
  }
  if (trend.source === "no_growth") {
    return `The ${trend.usableInspections} inspections over ${Math.round(trend.spanDays)} days show no growth, so no date is projected.`
  }
  const needed = Math.max(0, 3 - trend.usableInspections)
  const more =
    needed > 0
      ? `${needed} more inspection${needed === 1 ? "" : "s"}`
      : "inspections spanning at least 7 days"
  return `Assumed from the exposure environment: ${formatRate(trend.assumedRate)}. A measured rate needs ${more}.`
}
