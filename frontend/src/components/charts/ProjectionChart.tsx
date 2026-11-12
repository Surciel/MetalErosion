import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import ChartCard, { ChartTooltip, type ChartTable } from "@/components/charts/ChartCard"
import { AXIS_TICK, CHART, STATUS } from "@/components/charts/chartTheme"
import {
  ASTM_GRADES,
  CRITICAL_RUST_PERCENT,
  gradeForPercent,
} from "@/utils/classificationInfo"
import type { ScanResult } from "@/types"

type Point = { day: number; rust: number }

type Projection = {
  slope: number
  daysToCritical: number
  horizon: number
  points: Point[]
}

const STEPS = 24

function formatDuration(days: number): string {
  if (days < 730) return `${Math.round(days)} days`
  return `${(days / 365).toFixed(1)} years`
}

function buildProjection(scan: ScanResult): Projection | null {
  const rust = scan.rustPercent
  if (rust >= CRITICAL_RUST_PERCENT) return null
  const slope =
    scan.regressionSlope ??
    (scan.daysToCritical ? (CRITICAL_RUST_PERCENT - rust) / scan.daysToCritical : null)
  if (!slope || slope <= 0) return null

  const daysToCritical = (CRITICAL_RUST_PERCENT - rust) / slope
  // Run a little past the threshold so the crossing is visible inside the plot.
  const horizon = Math.max(1, Math.ceil(daysToCritical * 1.12))
  const points: Point[] = Array.from({ length: STEPS + 1 }, (_, index) => {
    const day = Math.round((horizon * index) / STEPS)
    return { day, rust: Number((rust + slope * day).toFixed(2)) }
  })
  return { slope, daysToCritical, horizon, points }
}

type TooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Point }>
}

/**
 * Projected rust % over time for one scan, from the scan's rust % and its corrosion
 * rate, up to the critical threshold. The line is dashed because it is a projection;
 * only the first point is a measurement.
 */
export default function ProjectionChart({ scan, className }: { scan: ScanResult; className?: string }) {
  const projection = buildProjection(scan)
  const title = "Projected corrosion"

  if (!projection) {
    const critical = scan.rustPercent >= CRITICAL_RUST_PERCENT
    return (
      <ChartCard
        title={title}
        className={className}
        empty={
          critical
            ? `This surface is already at or past the critical threshold (${CRITICAL_RUST_PERCENT}% rust), so there is nothing left to project.`
            : "No projection is available for this scan."
        }
      >
        {null}
      </ChartCard>
    )
  }

  const { slope, daysToCritical, horizon, points } = projection
  const inYears = horizon >= 730
  const yMax = 40

  // Table view: today, each ASTM grade boundary still ahead, and the critical day.
  const milestones = ASTM_GRADES.filter(
    (band) =>
      band.maxPercent !== null &&
      band.maxPercent > scan.rustPercent &&
      band.maxPercent <= CRITICAL_RUST_PERCENT,
  ).map((band) => {
    const limit = band.maxPercent as number
    const critical = limit === CRITICAL_RUST_PERCENT
    return [
      critical
        ? `Reaches the critical threshold (${limit}%)`
        : `Passes ${limit}% and drops to grade ${band.grade - 1}`,
      formatDuration((limit - scan.rustPercent) / slope),
      `${limit}%`,
    ]
  })
  const table: ChartTable = {
    columns: ["Milestone", "Time from this scan", "Rust"],
    rows: [
      [`Measured now (grade ${gradeForPercent(scan.rustPercent)})`, "0 days", `${scan.rustPercent}%`],
      ...milestones,
    ],
  }

  const tooltip = ({ active, payload }: TooltipProps) => {
    const point = payload?.[0]?.payload
    if (!active || !point) return null
    return (
      <ChartTooltip
        value={`${point.rust.toFixed(1)}% rust`}
        label={point.day === 0 ? "Measured today" : `Projected after ${formatDuration(point.day)}`}
        detail={`ASTM grade ${gradeForPercent(point.rust)}`}
      />
    )
  }

  return (
    <ChartCard
      title={title}
      subtitle={`Measured today: ${scan.rustPercent}% rust. At this scan's rate of ${slope.toFixed(4)}% per day it reaches the ${CRITICAL_RUST_PERCENT}% critical threshold in about ${formatDuration(daysToCritical)}. Only today's point is measured; the dashed line is a projection, not a forecast from repeated scans.`}
      table={table}
      className={className}
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 16, right: 20, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            type="number"
            dataKey="day"
            domain={[0, horizon]}
            tickCount={6}
            tickFormatter={(day: number) =>
              day === 0 ? "Today" : inYears ? `${(day / 365).toFixed(1)}y` : `${day}d`
            }
            tick={AXIS_TICK}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
          />
          <YAxis
            type="number"
            domain={[0, yMax]}
            ticks={[0, 10, 20, 30, 40]}
            tickFormatter={(value: number) => `${value}%`}
            width={40}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={(props) => tooltip(props as unknown as TooltipProps)}
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
          />
          <ReferenceLine
            y={CRITICAL_RUST_PERCENT}
            stroke={STATUS.critical}
            strokeWidth={1}
            label={{
              value: `Critical threshold ${CRITICAL_RUST_PERCENT}%`,
              // Above the threshold line: the projection approaches it from below.
              position: "insideBottomLeft",
              fill: CHART.textSecondary,
              fontSize: 11,
            }}
          />
          <Line
            type="linear"
            dataKey="rust"
            stroke={CHART.series}
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 5, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={0}
            y={scan.rustPercent}
            r={5}
            fill={CHART.series}
            stroke={CHART.surface}
            strokeWidth={2}
          />
          {/* Only the crossing is labelled; the measured point is named in the subtitle
              and the tooltip, where it cannot collide with the line. */}
          <ReferenceDot
            x={Math.round(daysToCritical)}
            y={CRITICAL_RUST_PERCENT}
            r={5}
            fill={STATUS.critical}
            stroke={CHART.surface}
            strokeWidth={2}
            label={{
              value: formatDuration(daysToCritical),
              position: "top",
              fill: CHART.textPrimary,
              fontSize: 11,
              dx: -26,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
