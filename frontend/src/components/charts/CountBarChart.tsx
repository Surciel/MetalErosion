import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AXIS_TICK, CHART } from "@/components/charts/chartTheme"
import { ChartTooltip } from "@/components/charts/ChartCard"

export type CountDatum = {
  label: string
  value: number
  /** Only for status meaning (e.g. priority); otherwise every bar wears the series colour. */
  color?: string
  /** Longer name for the tooltip, when the axis label is abbreviated. */
  detail?: string
}

type TooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: CountDatum }>
}

/**
 * Counts per category. `direction="columns"` puts categories on the x-axis (ordered or
 * time categories); `direction="bars"` lists them down the y-axis with the value at the
 * bar tip (a few named categories).
 */
export default function CountBarChart({
  data,
  direction,
  unit,
  height,
}: {
  data: CountDatum[]
  direction: "columns" | "bars"
  /** Noun for the tooltip, e.g. "scans". */
  unit: string
  height?: number
}) {
  const horizontalBars = direction === "bars"
  const chartHeight = height ?? (horizontalBars ? Math.max(120, data.length * 38 + 30) : 220)
  // Long category axes (30 days) cannot label every column; show about 8 ticks.
  const columnInterval = data.length > 12 ? Math.ceil(data.length / 8) - 1 : 0

  const tooltip = ({ active, payload }: TooltipProps) => {
    const datum = payload?.[0]?.payload
    if (!active || !datum) return null
    return (
      <ChartTooltip
        value={`${datum.value} ${unit}`}
        label={datum.detail ?? datum.label}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout={horizontalBars ? "vertical" : "horizontal"}
        margin={{ top: 8, right: horizontalBars ? 36 : 8, bottom: 0, left: 0 }}
        barCategoryGap="20%"
      >
        <CartesianGrid
          stroke={CHART.grid}
          horizontal={!horizontalBars}
          vertical={horizontalBars}
        />
        {horizontalBars ? (
          <>
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={118}
              tick={{ fill: CHART.textSecondary, fontSize: 12 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
            />
          </>
        ) : (
          <>
            <XAxis
              type="category"
              dataKey="label"
              interval={columnInterval}
              tick={AXIS_TICK}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
            />
            <YAxis type="number" allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          </>
        )}
        <Tooltip
          content={(props) => tooltip(props as unknown as TooltipProps)}
          cursor={{ fill: "rgba(255,255,255,0.06)" }}
        />
        <Bar
          dataKey="value"
          maxBarSize={24}
          radius={horizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          isAnimationActive={false}
        >
          {data.map((datum) => (
            <Cell key={datum.label} fill={datum.color ?? CHART.series} />
          ))}
          {horizontalBars && (
            <LabelList dataKey="value" position="right" fill={CHART.textPrimary} fontSize={12} />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
