import type { ScanResult, SeverityLevel } from "@/types"

type SeverityInput = Pick<ScanResult, "astmGrade" | "priorityLevel">

/**
 * One severity scale shared by colours, badges and the alert pop-up, derived from
 * the ASTM grade and the predictive-engine priority (not arbitrary rust % cut-offs).
 */
export function severityLevel({ astmGrade, priorityLevel }: SeverityInput): SeverityLevel {
  if (priorityLevel === "CRITICAL" || astmGrade <= 1) return "critical"
  if (priorityLevel === "Elevated Priority" || astmGrade <= 3) return "high"
  if (astmGrade <= 6) return "moderate"
  if (astmGrade >= 10) return "none"
  return "low"
}

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: "#c0392b",
  high: "#e67e22",
  moderate: "#d4ac0d",
  low: "#27ae60",
  none: "#27ae60",
}

export function severityColor(scan: SeverityInput): string {
  return SEVERITY_COLORS[severityLevel(scan)]
}
