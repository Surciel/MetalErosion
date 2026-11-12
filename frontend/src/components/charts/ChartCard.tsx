import { useState, type ReactNode } from "react"
import { CHART } from "@/components/charts/chartTheme"

export type ChartTable = {
  columns: string[]
  rows: (string | number)[][]
}

/**
 * Frame for one chart: title, what it shows, the chart, and a table view of the same
 * numbers so no value is reachable only by hovering.
 */
export default function ChartCard({
  title,
  subtitle,
  table,
  empty,
  dimmed = false,
  className = "",
  children,
}: {
  title: string
  subtitle?: string
  table?: ChartTable
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string
  /** Hold the previous render at reduced opacity while new data loads. */
  dimmed?: boolean
  className?: string
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  const hasTable = Boolean(table && table.rows.length > 0 && !empty)

  return (
    <section
      className={`flex flex-col rounded-2xl p-5 transition-opacity ${className}`}
      style={{ background: CHART.surface, opacity: dimmed ? 0.55 : 1 }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: CHART.textPrimary }}>
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-xs leading-5" style={{ color: CHART.textSecondary }}>
              {subtitle}
            </p>
          )}
        </div>
        {hasTable && (
          <button
            type="button"
            onClick={() => setShowTable((current) => !current)}
            aria-pressed={showTable}
            className="flex-shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:border-white/40 hover:text-white"
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </div>

      {empty ? (
        <p className="py-8 text-center text-sm" style={{ color: CHART.textMuted }}>
          {empty}
        </p>
      ) : showTable && table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" style={{ color: CHART.textSecondary }}>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column} className="border-b border-white/10 px-2 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-white/5 px-2 py-1.5">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

/** Tooltip shell shared by the charts: the value leads, the label follows. */
export function ChartTooltip({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div
      className="rounded-lg border border-white/15 px-3 py-2 shadow-xl"
      style={{ background: "#14190f" }}
    >
      <p className="text-sm font-semibold" style={{ color: CHART.textPrimary }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: CHART.textSecondary }}>
        {label}
      </p>
      {detail && (
        <p className="mt-0.5 text-[11px]" style={{ color: CHART.textMuted }}>
          {detail}
        </p>
      )}
    </div>
  )
}
