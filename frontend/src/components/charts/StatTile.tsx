import { CHART } from "@/components/charts/chartTheme"

/** One headline number: a label, the value, and an optional line of context. */
export default function StatTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: CHART.surface }}>
      <p className="text-xs" style={{ color: CHART.textSecondary }}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold" style={{ color: CHART.textPrimary }}>
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-[11px]" style={{ color: CHART.textMuted }}>
          {detail}
        </p>
      )}
    </div>
  )
}

/** A row of preset ranges that scopes every chart below it. */
export function RangeFilter<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs text-white/50">{label}</span>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            style={{
              borderColor: selected ? "#f0efec" : "rgba(255,255,255,0.15)",
              background: selected ? "rgba(255,255,255,0.12)" : "transparent",
              color: selected ? "#f0efec" : "rgba(240,237,232,0.65)",
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
