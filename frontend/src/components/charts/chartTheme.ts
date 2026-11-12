import type { SeverityLevel } from "@/types"

/**
 * Chart colours. Checked with the dataviz palette validator against CHART.surface:
 * every mark colour is at least 3:1 on it (series 4.2, good 4.6, warning 8.3,
 * serious 5.8, critical 3.2) and axis text is 4.3:1. The app's normal card colour
 * (#415232) fails that check, which is why charts sit on this darker inset surface.
 */
export const CHART = {
  surface: "#1f2818",
  /** The single series colour: one series, one colour for every bar, line and dot. */
  series: "#3987e5",
  /** Neutral fill for the not-selected parts of an emphasis figure. */
  neutral: "rgba(255,255,255,0.10)",
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.20)",
  textPrimary: "#f0efec",
  textSecondary: "#c3c2b7",
  textMuted: "#898781",
} as const

/** Reserved status colours: used only where the colour means a state, always with a label. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const

export const SEVERITY_STATUS: Record<SeverityLevel, string> = {
  none: STATUS.good,
  low: STATUS.good,
  moderate: STATUS.warning,
  high: STATUS.serious,
  critical: STATUS.critical,
}

export const PRIORITY_STATUS: Record<string, string> = {
  "Monitoring Required": STATUS.good,
  "Elevated Priority": STATUS.warning,
  CRITICAL: STATUS.critical,
}

export const AXIS_TICK = { fill: CHART.textMuted, fontSize: 11 } as const
