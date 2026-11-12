import ChartCard, { type ChartTable } from "@/components/charts/ChartCard"
import { CHART, SEVERITY_STATUS } from "@/components/charts/chartTheme"
import { ASTM_GRADES } from "@/utils/classificationInfo"
import { severityLevel } from "@/utils/severity"
import type { ScanResult } from "@/types"

function rangeText(maxPercent: number | null): string {
  return maxPercent === null ? "over 50%" : `up to ${maxPercent}%`
}

/**
 * Where one scan sits on the ASTM D610 scale: eleven grade blocks from 10 (no rust) to
 * 0 (over half rusted), with this scan's grade highlighted and the rest neutral.
 */
export default function AstmScale({ scan, className }: { scan: ScanResult; className?: string }) {
  const current = ASTM_GRADES.find((band) => band.grade === scan.astmGrade)
  const color = SEVERITY_STATUS[severityLevel(scan)]
  const table: ChartTable = {
    columns: ["Grade", "Rust coverage", "Description", "This scan"],
    rows: ASTM_GRADES.map((band) => [
      band.grade,
      rangeText(band.maxPercent),
      band.label,
      band.grade === scan.astmGrade ? `Yes (${scan.rustPercent}%)` : "",
    ]),
  }

  return (
    <ChartCard
      title="Position on the ASTM D610 scale"
      subtitle={
        current
          ? `Grade ${current.grade}: ${current.label.toLowerCase()} (${rangeText(current.maxPercent)} rust). This scan measured ${scan.rustPercent}%.`
          : undefined
      }
      table={table}
      className={className}
    >
      <div
        role="img"
        aria-label={`ASTM grade ${scan.astmGrade} on a scale from 10 (no rust) to 0 (over 50% rust)`}
      >
        <div className="flex gap-[2px]">
          {ASTM_GRADES.map((band) => {
            const active = band.grade === scan.astmGrade
            return (
              <div
                key={band.grade}
                title={`Grade ${band.grade}: ${band.label} (${rangeText(band.maxPercent)} rust)`}
                className="flex h-7 flex-1 items-center justify-center rounded-[4px] text-xs font-semibold"
                style={{
                  background: active ? color : CHART.neutral,
                  // Near-black on the light warning fill, white on the others.
                  color: active ? (color === "#fab219" ? "#0b0b0b" : "#ffffff") : CHART.textMuted,
                }}
              >
                {band.grade}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px]" style={{ color: CHART.textMuted }}>
          <span>10 · no rust</span>
          <span>0 · over 50% rusted</span>
        </div>
      </div>
    </ChartCard>
  )
}
