import ChartCard from "@/components/charts/ChartCard"
import CountBarChart, { type CountDatum } from "@/components/charts/CountBarChart"
import StatTile, { RangeFilter } from "@/components/charts/StatTile"
import {
  categoryCounts,
  distributionCounts,
  gradeCounts,
  priorityCounts,
  toTable,
} from "@/utils/analytics"
import type { AdminAnalytics } from "@/types"

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
] as const

const LIGHTING_LABELS: Record<string, string> = {
  ok: "Good lighting",
  low_light: "Low light",
  overexposed: "Overexposed",
  unknown: "Not recorded",
}

const REJECTION_LABELS: Record<string, string> = {
  not_metal_classifier: "Not metal (classifier)",
  not_metal: "No metal area found",
  too_dark: "Too dark",
  too_bright: "Too bright",
  too_blurry: "Too blurry",
  too_small: "Too small",
  unsupported_format: "Wrong file type",
  invalid_image: "Invalid image",
}

/** Named categories with no natural order: ranked, largest first. */
function ranked(counts: Record<string, number>, labels: Record<string, string>): CountDatum[] {
  return Object.entries(counts)
    .map(([key, value]) => ({ label: labels[key] ?? key, value }))
    .sort((left, right) => right.value - left.value)
}

function dayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** System-wide scan charts for the admin dashboard, all scoped by one period filter. */
export default function AdminAnalyticsSection({
  analytics,
  days,
  loading,
  error,
  onRangeChange,
}: {
  analytics: AdminAnalytics | null
  days: number
  loading: boolean
  error: string
  onRangeChange: (days: number) => void
}) {
  const perDay: CountDatum[] = (analytics?.scansPerDay ?? []).map((entry) => ({
    label: dayLabel(entry.date),
    value: entry.count,
  }))
  const byGrade = gradeCounts(
    Object.fromEntries(Object.entries(analytics?.byGrade ?? {}).map(([grade, count]) => [Number(grade), count])),
  )
  const byPriority = priorityCounts(analytics?.byPriority ?? {})
  const byDistribution = distributionCounts(analytics?.byDistribution ?? {})
  const byLighting = ranked(analytics?.byLighting ?? {}, LIGHTING_LABELS)
  const byCategory = categoryCounts(analytics?.byCategory ?? {})
  const rejections = ranked(analytics?.rejections ?? {}, REJECTION_LABELS)

  const totalScans = analytics?.totalScans ?? 0
  const totalRejections = analytics?.totalRejections ?? 0
  const attempts = totalScans + totalRejections
  const noScans = analytics !== null && totalScans === 0
  const emptyScans = analytics === null ? "Loading..." : noScans ? "No scans in this period." : undefined
  // While a new period loads, keep the previous charts on screen, dimmed.
  const dimmed = loading && analytics !== null

  return (
    <section className="mb-7">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-base font-semibold text-white">Scan analytics</h2>
        <p className="text-xs text-white/40">
          All users' scans. Every chart below follows the selected period.
        </p>
        {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
      </div>

      <div className="mb-4">
        <RangeFilter label="Period" options={RANGES} value={days} onChange={onRangeChange} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Scans analysed" value={String(totalScans)} detail={`In the last ${days} days`} />
        <StatTile
          label="Scans rejected"
          value={analytics?.rejectionsAvailable === false ? "—" : String(totalRejections)}
          detail={
            analytics?.rejectionsAvailable === false
              ? "Run migration 003 to start logging rejections"
              : "Failed a validation check; nothing was saved"
          }
        />
        <StatTile
          label="Rejection rate"
          value={attempts > 0 && analytics?.rejectionsAvailable ? `${((totalRejections / attempts) * 100).toFixed(1)}%` : "—"}
          detail="Rejected ÷ all upload attempts"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Scans per day"
          subtitle="Number of scans saved each day, in your local time."
          table={toTable("Day", "Scans", perDay)}
          empty={emptyScans}
          dimmed={dimmed}
          className="lg:col-span-2"
        >
          <CountBarChart data={perDay} direction="columns" unit="scans" />
        </ChartCard>

        <ChartCard
          title="Scans by ASTM D610 grade"
          subtitle="From 10 (no rust) to 0 (over half rusted)."
          table={toTable("Grade", "Scans", byGrade)}
          empty={emptyScans}
          dimmed={dimmed}
        >
          <CountBarChart data={byGrade} direction="columns" unit="scans" />
        </ChartCard>

        <ChartCard
          title="Scans by maintenance priority"
          subtitle="Priority from the predicted days until 33% rust."
          table={toTable("Priority", "Scans", byPriority)}
          empty={emptyScans}
          dimmed={dimmed}
        >
          <CountBarChart data={byPriority} direction="bars" unit="scans" />
        </ChartCard>

        <ChartCard
          title="Scans by rust distribution"
          subtitle="How the rust was spread on each scanned surface."
          table={toTable("Distribution", "Scans", byDistribution)}
          empty={emptyScans}
          dimmed={dimmed}
        >
          <CountBarChart data={byDistribution} direction="bars" unit="scans" />
        </ChartCard>

        <ChartCard
          title="Scans by photo lighting"
          subtitle="Lighting status recorded when each scan was analysed."
          table={toTable("Lighting", "Scans", byLighting)}
          empty={emptyScans}
          dimmed={dimmed}
        >
          <CountBarChart data={byLighting} direction="bars" unit="scans" />
        </ChartCard>

        <ChartCard
          title="Scans by asset category"
          subtitle="The kind of object chosen for each scan. It sets the baseline corrosion rate."
          table={toTable("Asset category", "Scans", byCategory)}
          empty={emptyScans}
          dimmed={dimmed}
        >
          <CountBarChart data={byCategory} direction="bars" unit="scans" />
        </ChartCard>

        <ChartCard
          title="Rejected scans by reason"
          subtitle="Uploads that failed a validation check, by the check that failed."
          table={toTable("Reason", "Rejections", rejections)}
          empty={
            analytics === null
              ? "Loading..."
              : !analytics.rejectionsAvailable
                ? "The rejection log is not set up yet. Run migration 003 in Supabase."
                : rejections.length === 0
                  ? "No rejected scans in this period."
                  : undefined
          }
          dimmed={dimmed}
        >
          <CountBarChart data={rejections} direction="bars" unit="rejections" />
        </ChartCard>
      </div>
    </section>
  )
}
