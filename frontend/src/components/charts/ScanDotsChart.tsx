import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChartTooltip } from "@/components/charts/ChartCard"
import { AXIS_TICK, CHART, STATUS } from "@/components/charts/chartTheme"
import { CRITICAL_RUST_PERCENT } from "@/utils/classificationInfo"
import type { ScanResult } from "@/types"

type Dot = { time: number; rust: number; title: string; rating: string }

type TooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Dot }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function formatDay(time: number): string {
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** A dot with a 2px surface ring and a 24px transparent hit area around it. */
function DotShape({ cx, cy }: { cx?: number; cy?: number }) {
  if (cx === undefined || cy === undefined) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={CHART.series} stroke={CHART.surface} strokeWidth={2} />
    </g>
  )
}

/**
 * Rust % of each scan against the date it was taken. Dots are not joined: the scans
 * are of different objects, so a line between them would suggest a trend that is not
 * in the data.
 */
export default function ScanDotsChart({ scans }: { scans: ScanResult[] }) {
  const dots: Dot[] = scans
    .filter((scan) => scan.createdAt && !Number.isNaN(Date.parse(scan.createdAt)))
    .map((scan) => ({
      time: Date.parse(scan.createdAt as string),
      rust: scan.rustPercent,
      title: scan.title || scan.imageName,
      rating: scan.classification,
    }))
  const times = dots.map((dot) => dot.time)
  // Pad the time axis so a single day of scans is not a zero-width range.
  const domain: [number, number] = [Math.min(...times) - DAY_MS / 2, Math.max(...times) + DAY_MS / 2]
  const yMax = Math.max(40, Math.ceil(Math.max(...dots.map((dot) => dot.rust)) / 20) * 20)

  const tooltip = ({ active, payload }: TooltipProps) => {
    const dot = payload?.[0]?.payload
    if (!active || !dot) return null
    return (
      <ChartTooltip
        value={`${dot.rust}% rust`}
        label={dot.title}
        detail={`${dot.rating} · ${new Date(dot.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          type="number"
          dataKey="time"
          domain={domain}
          tickCount={6}
          tickFormatter={formatDay}
          tick={AXIS_TICK}
          axisLine={{ stroke: CHART.axis }}
          tickLine={false}
        />
        <YAxis
          type="number"
          dataKey="rust"
          domain={[0, yMax]}
          tickFormatter={(value: number) => `${value}%`}
          width={40}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={(props) => tooltip(props as unknown as TooltipProps)} cursor={false} />
        <ReferenceLine
          y={CRITICAL_RUST_PERCENT}
          stroke={STATUS.critical}
          strokeWidth={1}
          label={{
            value: `Critical threshold ${CRITICAL_RUST_PERCENT}%`,
            position: "insideTopLeft",
            fill: CHART.textSecondary,
            fontSize: 11,
          }}
        />
        <Scatter data={dots} shape={<DotShape />} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
