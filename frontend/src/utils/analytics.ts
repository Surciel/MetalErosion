import type { CountDatum } from "@/components/charts/CountBarChart"
import { PRIORITY_STATUS } from "@/components/charts/chartTheme"
import { ASTM_GRADES, DISTRIBUTION_TYPES } from "@/utils/classificationInfo"
import type { DistributionType, ScanResult } from "@/types"

/** Priority tiers in order of urgency (matches backend/predictive_engine.py). */
export const PRIORITY_ORDER = ["Monitoring Required", "Elevated Priority", "CRITICAL"] as const

export const PRIORITY_LABELS: Record<string, string> = {
  "Monitoring Required": "Monitoring",
  "Elevated Priority": "Elevated",
  CRITICAL: "Critical",
}

const DISTRIBUTION_ORDER: DistributionType[] = ["S", "G", "P", "H"]

/** Counts for ASTM grades 10 down to 0, including grades with no scans. */
export function gradeCounts(counts: Record<number, number>): CountDatum[] {
  return ASTM_GRADES.map((band) => ({
    label: String(band.grade),
    value: counts[band.grade] ?? 0,
    detail: `Grade ${band.grade}: ${band.label}`,
  }))
}

export function priorityCounts(counts: Record<string, number>): CountDatum[] {
  return PRIORITY_ORDER.map((tier) => ({
    label: PRIORITY_LABELS[tier],
    value: counts[tier] ?? 0,
    color: PRIORITY_STATUS[tier],
    detail: tier === "CRITICAL" ? "Critical" : tier,
  }))
}

/** Distribution types plus "No rust" for scans that found none. */
export function distributionCounts(counts: Record<string, number>): CountDatum[] {
  return [
    ...DISTRIBUTION_ORDER.map((type) => ({
      label: `${DISTRIBUTION_TYPES[type].name} (${type})`,
      value: counts[type] ?? 0,
      detail: `${DISTRIBUTION_TYPES[type].name}: ${DISTRIBUTION_TYPES[type].description}`,
    })),
    { label: "No rust", value: counts.none ?? 0, detail: "No rust detected" },
  ]
}

function tally<K extends string | number>(keys: K[]): Record<K, number> {
  const counts = {} as Record<K, number>
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1
  return counts
}

export type ScanSummary = {
  total: number
  averageRust: number | null
  critical: number
  byGrade: CountDatum[]
  byPriority: CountDatum[]
  byDistribution: CountDatum[]
}

export function summarizeScans(scans: ScanResult[]): ScanSummary {
  return {
    total: scans.length,
    averageRust: scans.length
      ? scans.reduce((sum, scan) => sum + scan.rustPercent, 0) / scans.length
      : null,
    critical: scans.filter((scan) => scan.priorityLevel === "CRITICAL").length,
    byGrade: gradeCounts(tally(scans.map((scan) => scan.astmGrade))),
    byPriority: priorityCounts(tally(scans.map((scan) => scan.priorityLevel))),
    byDistribution: distributionCounts(tally(scans.map((scan) => scan.distributionType ?? "none"))),
  }
}

export function toTable(firstColumn: string, valueColumn: string, data: CountDatum[]) {
  return {
    columns: [firstColumn, valueColumn],
    rows: data.map((datum) => [datum.detail ?? datum.label, datum.value]),
  }
}
