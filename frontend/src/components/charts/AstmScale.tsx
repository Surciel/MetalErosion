import ChartCard, { type ChartTable } from "@/components/charts/ChartCard"
import { CHART, SEVERITY_STATUS } from "@/components/charts/chartTheme"
import { ASTM_GRADES } from "@/utils/classificationInfo"
import { severityLevel } from "@/utils/severity"
import type { ScanResult } from "@/types"

function rangeText(maxPercent: number | null): string {
  return maxPercent === null ? "over 50%" : `up to ${maxPercent}%`
}

/** A distance between two percentages, in percentage points. */
function points(value: number): string {
  const rounded = Number(value.toFixed(2))
  return `${rounded} point${rounded === 1 ? "" : "s"}`
}

/** A percentage without trailing zeros: 0.01, 0.3, 16, 2.82. */
function pct(value: number): string {
  return `${Number(value.toFixed(2))}%`
}

/**
 * Where one scan sits on the ASTM D610 scale. Two views of the same reading:
 * the eleven grades from 10 (no rust) to 0 (over half rusted) with this scan's grade
 * marked, and a close-up of that grade's range showing how near the reading is to the
 * neighbouring grades (a reading near a boundary may belong to the next grade).
 */
export default function AstmScale({ scan, className }: { scan: ScanResult; className?: string }) {
  const index = ASTM_GRADES.findIndex((band) => band.grade === scan.astmGrade)
  const current = index >= 0 ? ASTM_GRADES[index] : undefined
  const color = SEVERITY_STATUS[severityLevel(scan)]
  const onColor = color === "#fab219" ? "#0b0b0b" : "#ffffff"
  const table: ChartTable = {
    columns: ["Grade", "Rust coverage", "Description", "This scan"],
    rows: ASTM_GRADES.map((band) => [
      band.grade,
      rangeText(band.maxPercent),
      band.label,
      band.grade === scan.astmGrade ? `Yes (${scan.rustPercent}%)` : "",
    ]),
  }

  // This grade's range: above the better grade's limit, up to its own limit.
  const lower = index > 0 ? (ASTM_GRADES[index - 1].maxPercent ?? 0) : 0
  const upper = current?.maxPercent ?? 100
  const within = Math.min(1, Math.max(0, (scan.rustPercent - lower) / (upper - lower || 1)))
  const better = index > 0 ? ASTM_GRADES[index - 1] : null
  const worse = index >= 0 && index < ASTM_GRADES.length - 1 ? ASTM_GRADES[index + 1] : null

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
      <div className="flex flex-1 flex-col justify-center gap-7">
        {/* The whole scale */}
        <div role="img" aria-label={`ASTM grade ${scan.astmGrade} on a scale from 10 (no rust) to 0 (over 50% rust)`}>
          <div className="flex gap-[3px]">
            {ASTM_GRADES.map((band) => {
              const active = band.grade === scan.astmGrade
              return (
                <div key={band.grade} className="min-w-0 flex-1 text-center">
                  <p className="h-5 text-[11px] font-bold leading-5" style={{ color: CHART.textPrimary }}>
                    {active ? "▼" : ""}
                  </p>
                  <div
                    title={`Grade ${band.grade}: ${band.label} (${rangeText(band.maxPercent)} rust)`}
                    className="flex h-11 items-center justify-center rounded-md text-sm font-semibold"
                    style={{
                      background: active ? color : CHART.neutral,
                      color: active ? onColor : CHART.textMuted,
                      outline: active ? `2px solid ${CHART.textPrimary}` : undefined,
                      outlineOffset: 1,
                    }}
                  >
                    {band.grade}
                  </div>
                  <p className="mt-1.5 truncate text-[10px] tabular-nums" style={{ color: active ? CHART.textPrimary : CHART.textMuted }}>
                    {band.maxPercent === null ? ">50" : `≤${band.maxPercent}`}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px]" style={{ color: CHART.textMuted }}>
            <span>10 · no rust</span>
            <span className="hidden sm:inline">% rust, upper limit of each grade</span>
            <span>0 · over 50% rusted</span>
          </div>
        </div>

        {/* Close-up of this grade's range */}
        {current && (
          <div role="img" aria-label={`${scan.rustPercent}% within grade ${current.grade}, which covers ${pct(lower)} to ${pct(upper)}`}>
            <p className="mb-2 text-[11px] font-mono uppercase tracking-wider" style={{ color: CHART.textMuted }}>
              Within grade {current.grade}
            </p>
            <div className="relative pt-6">
              <div
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs font-bold"
                style={{ left: `${within * 100}%`, color: CHART.textPrimary }}
              >
                {scan.rustPercent}%
              </div>
              <div className="h-3 rounded-full" style={{ background: `${color}55` }} />
              <div
                className="absolute top-5 h-5 w-1 -translate-x-1/2 rounded"
                style={{ left: `${within * 100}%`, background: CHART.textPrimary }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px]" style={{ color: CHART.textSecondary }}>
              <span>{pct(lower)}{better ? ` · grade ${better.grade} below` : ""}</span>
              <span>{pct(upper)}{worse ? ` · grade ${worse.grade} above` : ""}</span>
            </div>
            <p className="mt-3 text-xs leading-5" style={{ color: CHART.textSecondary }}>
              {better && `${points(scan.rustPercent - lower)} above grade ${better.grade}`}
              {better && worse && " · "}
              {worse && `${points(upper - scan.rustPercent)} below grade ${worse.grade}`}
              {!better && !worse && "The only grade."}
            </p>
          </div>
        )}
      </div>
    </ChartCard>
  )
}
