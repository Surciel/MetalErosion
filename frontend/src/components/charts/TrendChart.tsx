import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART, STATUS } from "@/components/charts/chartTheme"
import { ChartTooltip } from "@/components/charts/ChartCard"
import type { AssetCondition, ScanResult } from "@/types"

type Row = { t: number; rust?: number; fit?: number; projection?: number; label?: string }

const DAY = 86_400_000

const shortDate = (time: number) =>
  new Date(time).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
const fullDate = (time: number) =>
  new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

const THRESHOLDS = [
  { value: 1, label: "1%: maintenance due", color: STATUS.warning },
  { value: 10, label: "10%: full recoating preferred", color: STATUS.serious },
  { value: 33, label: "33%: critical", color: STATUS.critical },
]

/**
 * An asset's rust % over time: each inspection as a point, the fitted trend through
 * them once a rate has been measured, and the projection from the latest inspection to
 * the next action threshold. `tone="light"` is for the printed report.
 */
export default function TrendChart({
  scans,
  condition,
  tone = "dark",
  height = 280,
}: {
  /** The asset's inspections, in any order. */
  scans: ScanResult[]
  condition: AssetCondition | null
  tone?: "dark" | "light"
  height?: number
}) {
  const light = tone === "light"
  const ink = light
    ? { primary: "#111111", secondary: "#444444", muted: "#666666", grid: "#e2e2e2", axis: "#999999", fit: "#555555", series: "#1d5fb8" }
    : { primary: CHART.textPrimary, secondary: CHART.textSecondary, muted: CHART.textMuted, grid: CHART.grid, axis: CHART.axis, fit: CHART.textSecondary, series: CHART.series }

  const points = scans
    .filter((scan) => scan.createdAt)
    .map((scan) => ({ t: new Date(scan.createdAt as string).getTime(), rust: scan.rustPercent, label: scan.title ?? scan.imageName }))
    .sort((left, right) => left.t - right.t)
  if (points.length === 0) return null

  const rows = new Map<number, Row>()
  const row = (t: number) => {
    if (!rows.has(t)) rows.set(t, { t })
    return rows.get(t) as Row
  }
  for (const point of points) Object.assign(row(point.t), point)

  // The fitted line, across the inspections it was fitted to.
  const trend = condition?.trend
  if (trend && trend.fittedRate !== null && trend.intercept !== null && trend.firstInspection) {
    const start = new Date(trend.firstInspection).getTime()
    const end = points[points.length - 1].t
    for (const t of [start, end]) {
      row(t).fit = Math.max(0, trend.intercept + trend.fittedRate * ((t - start) / DAY))
    }
  }

  // The projection, from the latest inspection to the next threshold.
  const latest = points[points.length - 1]
  let projectionEnd: number | null = null
  if (condition && condition.daysToNext !== null && condition.nextThreshold !== null && condition.ratePerDay > 0) {
    // Keep far-off projections on the page: draw at most five years ahead.
    const days = Math.min(condition.daysToNext, 5 * 365)
    projectionEnd = latest.t + days * DAY
    row(latest.t).projection = latest.rust
    row(projectionEnd).projection = latest.rust + condition.ratePerDay * days
  }

  const data = [...rows.values()].sort((left, right) => left.t - right.t)
  const highest = Math.max(...data.map((item) => Math.max(item.rust ?? 0, item.fit ?? 0, item.projection ?? 0)))
  const yMax = highest <= 1 ? 1.2 : highest <= 10 ? 11 : highest <= 33 ? 36 : 100
  const visibleThresholds = THRESHOLDS.filter((item) => item.value <= yMax)
  const xMin = data[0].t
  const xMax = data[data.length - 1].t
  const pad = Math.max(DAY * 3, (xMax - xMin) * 0.04)

  const tooltip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Row }> }) => {
    const item = payload?.[0]?.payload
    if (!active || !item) return null
    if (item.rust !== undefined) {
      return <ChartTooltip value={`${item.rust}% rust`} label={fullDate(item.t)} detail={item.label} />
    }
    if (item.projection !== undefined) {
      return <ChartTooltip value={`${item.projection.toFixed(1)}% projected`} label={fullDate(item.t)} />
    }
    return null
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={ink.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[xMin - pad, xMax + pad]}
            tickFormatter={shortDate}
            tick={{ fill: ink.muted, fontSize: 11 }}
            axisLine={{ stroke: ink.axis }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            type="number"
            domain={[0, yMax]}
            width={40}
            tickFormatter={(value: number) => `${value}%`}
            tick={{ fill: ink.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          {visibleThresholds.map((item) => (
            <ReferenceLine
              key={item.value}
              y={item.value}
              stroke={item.color}
              strokeDasharray="2 4"
              label={{ value: item.label, position: "insideTopLeft", fill: ink.secondary, fontSize: 11 }}
            />
          ))}
          <Tooltip content={(props) => tooltip(props as never)} cursor={{ stroke: ink.axis }} />
          <Line dataKey="fit" stroke={ink.fit} strokeWidth={2} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="projection" stroke={ink.series} strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          <Line
            dataKey="rust"
            stroke="none"
            dot={{ r: 5, fill: ink.series, stroke: light ? "#ffffff" : CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 7 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: ink.secondary }}>
        <li className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ink.series }} /> Inspection
        </li>
        {trend?.fittedRate !== null && trend?.fittedRate !== undefined && (
          <li className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5" style={{ background: ink.fit }} /> Fitted trend
          </li>
        )}
        {projectionEnd !== null && (
          <li className="flex items-center gap-2">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: ink.series }} /> Projection to the next threshold
          </li>
        )}
      </ul>
    </div>
  )
}
