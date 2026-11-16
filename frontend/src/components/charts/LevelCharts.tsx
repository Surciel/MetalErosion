import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AXIS_TICK, CHART, STATUS } from "@/components/charts/chartTheme"
import type { CountDatum } from "@/components/charts/CountBarChart"
import { ACTION_LEVELS, BANDS, levelColor } from "@/utils/condition"

/** Assets per action level, one bar each, coloured by how urgent the level is. */
export function levelCounts(byLevel: Record<string, number>): CountDatum[] {
  return ACTION_LEVELS.map((item) => ({
    label: `L${item.level}`,
    value: byLevel[String(item.level)] ?? 0,
    color: levelColor(item.level),
    detail: `Level ${item.level}: ${item.strategy}`,
  }))
}

/** Assets per ASTM D610 grade, from 10 (no rust) to 0. */
export function gradeBars(byGrade: Record<string, number>): CountDatum[] {
  return Array.from({ length: 11 }, (_, index) => 10 - index).map((grade) => ({
    label: String(grade),
    value: byGrade[String(grade)] ?? 0,
    detail: `ASTM D610 grade ${grade}`,
  }))
}

type StackRow = { name: string; good: number; warning: number; serious: number; critical: number; none: number }

function toStackRow(name: string, byLevel: Record<string, number>, notInspected = 0): StackRow {
  const sum = (levels: number[]) => levels.reduce((total, level) => total + (byLevel[String(level)] ?? 0), 0)
  return {
    name,
    good: sum(BANDS[0].levels),
    warning: sum(BANDS[1].levels),
    serious: sum(BANDS[2].levels),
    critical: sum(BANDS[3].levels),
    none: notInspected,
  }
}

const SERIES: ReadonlyArray<{ key: keyof Omit<StackRow, "name">; label: string; color: string }> = [
  { key: "critical", label: BANDS[3].label, color: STATUS.critical },
  { key: "serious", label: BANDS[2].label, color: STATUS.serious },
  { key: "warning", label: BANDS[1].label, color: STATUS.warning },
  { key: "good", label: BANDS[0].label, color: STATUS.good },
  { key: "none", label: "Not inspected yet", color: "rgba(255,255,255,0.22)" },
]

/**
 * One stacked bar per group (a site, or an element type): how many of its assets sit in
 * each urgency band. The most urgent band is drawn first so it starts at the axis.
 */
export function StackedLevelChart({
  groups,
}: {
  groups: { name: string; byLevel: Record<string, number>; notInspected?: number }[]
}) {
  const data = groups.map((group) => toStackRow(group.name, group.byLevel, group.notInspected ?? 0))
  const used = SERIES.filter((series) => data.some((row) => row[series.key] > 0))
  const height = Math.max(120, data.length * 44 + 36)

  const tooltip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: StackRow }> }) => {
    const row = payload?.[0]?.payload
    if (!active || !row) return null
    return (
      <div className="rounded-lg border border-white/15 px-3 py-2 shadow-xl" style={{ background: "#14190f" }}>
        <p className="text-sm font-semibold" style={{ color: CHART.textPrimary }}>{row.name}</p>
        {SERIES.filter((series) => row[series.key] > 0).map((series) => (
          <p key={series.key} className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: CHART.textSecondary }}>
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: series.color }} />
            {row[series.key]} · {series.label}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fill: CHART.textSecondary, fontSize: 12 }}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
          />
          <Tooltip content={(props) => tooltip(props as never)} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
          {used.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              stackId="levels"
              fill={series.color}
              stroke={CHART.surface}
              strokeWidth={2}
              maxBarSize={22}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: CHART.textSecondary }}>
        {used.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The table view of a stacked level chart. */
export function stackTable(
  firstColumn: string,
  groups: { name: string; byLevel: Record<string, number>; notInspected?: number }[],
) {
  return {
    columns: [firstColumn, ...ACTION_LEVELS.map((item) => `L${item.level}`), "Not inspected"],
    rows: groups.map((group) => [
      group.name,
      ...ACTION_LEVELS.map((item) => group.byLevel[String(item.level)] ?? 0),
      group.notInspected ?? 0,
    ]),
  }
}

/**
 * Where a rust % sits on the action scale. The four bands are drawn equally wide, so
 * the low end, where most decisions are made, is not squeezed into a sliver.
 */
export function ThresholdBar({ rustPercent, tone = "dark" }: { rustPercent: number; tone?: "dark" | "light" }) {
  const bands = [
    { from: 0, to: 1, label: "Touch-up", color: STATUS.good },
    { from: 1, to: 10, label: "Spot repair", color: STATUS.warning },
    { from: 10, to: 33, label: "Full recoating", color: STATUS.serious },
    { from: 33, to: 100, label: "Assessment", color: STATUS.critical },
  ]
  const index = Math.max(0, bands.findIndex((band) => rustPercent < band.to || band.to === 100))
  const band = bands[index]
  const within = Math.min(1, Math.max(0, (rustPercent - band.from) / (band.to - band.from)))
  const position = ((index + within) / bands.length) * 100
  const ink = tone === "light" ? { text: "#333333", marker: "#111111", muted: "#666666" } : { text: CHART.textSecondary, marker: "#ffffff", muted: CHART.textMuted }

  return (
    <div role="img" aria-label={`${rustPercent}% rust, in the ${band.label} band`}>
      <div className="relative pt-5">
        <div className="absolute top-0 -translate-x-1/2 text-xs font-semibold" style={{ left: `${position}%`, color: ink.marker }}>
          {rustPercent}%
        </div>
        <div className="flex gap-0.5">
          {bands.map((item) => (
            <div key={item.label} className="h-3 flex-1 first:rounded-l-full last:rounded-r-full" style={{ background: item.color, opacity: item === band ? 1 : 0.35 }} />
          ))}
        </div>
        <div className="absolute top-4 h-5 w-0.5 -translate-x-1/2 rounded" style={{ left: `${position}%`, background: ink.marker }} />
      </div>
      <div className="mt-2 flex text-[11px]" style={{ color: ink.text }}>
        {bands.map((item) => (
          <div key={item.label} className="flex-1">
            <p className={item === band ? "font-semibold" : ""}>{item.label}</p>
            <p style={{ color: ink.muted }}>{item.to === 100 ? `${item.from}% and over` : `${item.from} to ${item.to}%`}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A coloured chip naming an asset's action level. Colour is never the only signal. */
export function LevelChip({ level, strategy }: { level: number; strategy: string }) {
  const color = levelColor(level)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium text-white" style={{ borderColor: color, background: `${color}22` }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      L{level} · {strategy}
    </span>
  )
}

/** The plain-language reading under a chart: what the picture means, in one line. */
export function Reading({ children }: { children: string }) {
  return (
    <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5" style={{ color: CHART.textSecondary }}>
      <span className="font-semibold" style={{ color: CHART.textPrimary }}>Reading: </span>
      {children}
    </p>
  )
}
