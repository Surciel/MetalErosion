import { useEffect, useState } from "react"
import PageShell, { ActionButton, EmptyState, Notice } from "@/components/PageShell"
import { isManager, useNav } from "@/components/NavContext"
import ChartCard from "@/components/charts/ChartCard"
import CountBarChart, { type CountDatum } from "@/components/charts/CountBarChart"
import StatTile from "@/components/charts/StatTile"
import { CHART, STATUS } from "@/components/charts/chartTheme"
import { Reading, StackedLevelChart, levelCounts, stackTable } from "@/components/charts/LevelCharts"
import { RegisterTable, registerReading } from "@/pages/SitePage"
import { ApiError, getDashboard, getReviewAgreement } from "@/services/api"
import { errorMessage, withToken } from "@/services/session"
import { toTable } from "@/utils/analytics"
import { formatArea } from "@/utils/condition"
import type { DashboardData, ReviewAgreement } from "@/types"

const monthLabel = (month: string) => {
  const [year, number] = month.split("-").map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

function deadlineReading(deadlines: DashboardData["deadlines"]): string {
  const soon = deadlines.months.slice(0, 3).reduce((total, month) => total + month.count, 0)
  const year = deadlines.months.reduce((total, month) => total + month.count, 0)
  if (deadlines.overdue === 0 && year === 0) {
    return deadlines.later > 0
      ? `No deadline falls in the next 12 months; ${deadlines.later} fall later.`
      : "No asset has a deadline yet."
  }
  const parts = []
  if (deadlines.overdue > 0) parts.push(`${deadlines.overdue} asset${deadlines.overdue === 1 ? " is" : "s are"} overdue or critical`)
  parts.push(`${soon} due in the next 3 months`)
  parts.push(`${year} in the next 12`)
  return `${parts.join(", ")}.`
}

/** The home screen: the condition of every asset, and what needs attention first. */
export default function DashboardPage() {
  const nav = useNav()
  const [data, setData] = useState<DashboardData | null>(null)
  const [agreement, setAgreement] = useState<ReviewAgreement | null>(null)
  const [error, setError] = useState("")
  const manager = isManager(nav.role)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await withToken(getDashboard)
        if (!cancelled) setData(next)
      } catch (cause: unknown) {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 401) return nav.sessionExpired()
        setError(errorMessage(cause, "The dashboard could not be loaded."))
      }
      if (manager) {
        try {
          const next = await withToken(getReviewAgreement)
          if (!cancelled) setAgreement(next)
        } catch {
          // The agreement panel is optional; the dashboard stands without it.
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = data?.totals
  const siteGroups = (data?.bySite ?? []).map((site) => ({ name: site.site, byLevel: site.byLevel, notInspected: site.notInspected }))
  const elementGroups = (data?.byElement ?? []).map((item) => ({ name: item.elementType, byLevel: item.byLevel }))
  const deadlineBars: CountDatum[] = data
    ? [
        { label: "Overdue", value: data.deadlines.overdue, color: STATUS.critical, detail: "Past the deadline, or critical now" },
        ...data.deadlines.months.map((month) => ({ label: monthLabel(month.month), value: month.count, detail: `Due in ${monthLabel(month.month)}` })),
      ]
    : []
  const inspectionBars: CountDatum[] = (data?.inspectionsByMonth ?? []).map((month) => ({
    label: monthLabel(month.month),
    value: month.count,
    detail: month.averageRust !== null ? `${monthLabel(month.month)}, average rust ${month.averageRust}%` : monthLabel(month.month),
  }))
  const inspectionsThisYear = inspectionBars.reduce((total, month) => total + month.value, 0)
  const reviewTotal = data ? data.reviews.confirmed + data.reviews.corrected + data.reviews.unreviewed : 0
  const worstSite = [...(data?.bySite ?? [])].sort(
    (left, right) =>
      (right.byLevel["6"] ?? 0) + (right.byLevel["5"] ?? 0) + (right.byLevel["4"] ?? 0) -
      ((left.byLevel["6"] ?? 0) + (left.byLevel["5"] ?? 0) + (left.byLevel["4"] ?? 0)),
  )[0]
  const worstCount = worstSite ? (worstSite.byLevel["6"] ?? 0) + (worstSite.byLevel["5"] ?? 0) + (worstSite.byLevel["4"] ?? 0) : 0

  return (
    <PageShell
      title="Dashboard"
      subtitle="The condition of every steel asset, and what needs attention first."
      actions={<ActionButton primary onClick={() => nav.navigate("home")}>New scan</ActionButton>}
    >
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {!data && !error ? (
        <p className="py-16 text-center text-sm text-white/50">Loading the dashboard...</p>
      ) : data && totals && totals.assets === 0 ? (
        <EmptyState
          title="Nothing to show yet"
          text="The dashboard fills in once there are assets and inspections. Start by adding a site and its steel elements, then scan them."
          action={<ActionButton primary onClick={() => nav.navigate("sites")}>Add a site</ActionButton>}
        />
      ) : data && totals ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Assets inspected" value={`${totals.inspected} of ${totals.assets}`} detail={`${totals.sites} site${totals.sites === 1 ? "" : "s"}, ${totals.inspections} inspections`} />
            <StatTile label="Need coating work" value={String(totals.needingAction)} detail="Action level 2 or higher" />
            <StatTile label="Critical or overdue" value={String(totals.overdue)} detail={`${totals.critical} need a structural assessment`} />
            <StatTile label="Area to treat" value={formatArea(totals.workAreaM2)} detail="Where a coated area is recorded" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Assets by action level"
              subtitle="How many assets need each kind of work, across all sites. L1 needs none; L6 needs a structural assessment."
              table={toTable("Action level", "Assets", levelCounts(totals.byLevel))}
              empty={totals.inspected === 0 ? "No asset has been inspected yet." : undefined}
            >
              <CountBarChart data={levelCounts(totals.byLevel)} direction="columns" unit="assets" />
              <Reading>{registerReading(totals)}</Reading>
            </ChartCard>

            <ChartCard
              title="Work coming due"
              subtitle="Assets by the month their current strategy should be carried out, projected from each asset's rate."
              table={toTable("Month", "Assets", deadlineBars)}
              empty={totals.inspected === 0 ? "No asset has been inspected yet." : undefined}
            >
              <CountBarChart data={deadlineBars} direction="columns" unit="assets" />
              <Reading>{deadlineReading(data.deadlines)}</Reading>
            </ChartCard>

            <ChartCard
              title="Condition by site"
              subtitle="Each site's assets, grouped by how urgent their work is."
              table={stackTable("Site", siteGroups)}
              empty={siteGroups.length === 0 ? "No sites yet." : undefined}
            >
              <StackedLevelChart groups={siteGroups} />
              <Reading>
                {worstSite && worstCount > 0
                  ? `${worstSite.site} has the most assets needing an overcoat, full recoating or assessment (${worstCount}).`
                  : "No site has an asset at level 4 or higher."}
              </Reading>
            </ChartCard>

            <ChartCard
              title="Condition by element type"
              subtitle="Which kinds of steel element are in the worst condition."
              table={stackTable("Element type", elementGroups)}
              empty={elementGroups.length === 0 ? "No asset has been inspected yet." : undefined}
            >
              <StackedLevelChart groups={elementGroups} />
            </ChartCard>

            <ChartCard
              title="Inspections per month"
              subtitle="Scans of assets in the last 12 months. Hover a bar for the average rust % found that month."
              table={{
                columns: ["Month", "Inspections", "Average rust %"],
                rows: data.inspectionsByMonth.map((month) => [monthLabel(month.month), month.count, month.averageRust ?? "-"]),
              }}
              empty={inspectionsThisYear === 0 ? "No inspections in the last 12 months." : undefined}
            >
              <CountBarChart data={inspectionBars} direction="columns" unit="inspections" />
              <Reading>
                {`${inspectionsThisYear} inspections in the last 12 months. ${totals.measuredRateAssets} of ${totals.inspected} inspected assets have a measured rate; the rest use the assumed rate for their environment.`}
              </Reading>
            </ChartCard>

            <ChartCard
              title="Engineer review"
              subtitle="How many inspections an engineer has confirmed or corrected."
              empty={reviewTotal === 0 ? "No inspections yet." : undefined}
            >
              <ReviewShare reviews={data.reviews} />
              {manager && agreement && agreement.reviewed > 0 && <AgreementSummary agreement={agreement} />}
              <Reading>
                {`${data.reviews.confirmed + data.reviews.corrected} of ${reviewTotal} inspections are reviewed; ${data.reviews.corrected} were corrected.`}
              </Reading>
            </ChartCard>
          </div>

          {data.mostUrgent.length > 0 && (
            <div>
              <RegisterTable assets={data.mostUrgent} showSite onOpen={(asset) => nav.openAsset(asset.id)} />
              <p className="mt-2 text-xs text-white/45">The ten most urgent assets across all sites. Open a site for its full register.</p>
            </div>
          )}
        </div>
      ) : null}
    </PageShell>
  )
}

/** One bar split into reviewed and unreviewed inspections, with the counts beside it. */
function ReviewShare({ reviews }: { reviews: DashboardData["reviews"] }) {
  const parts = [
    { label: "Confirmed", value: reviews.confirmed, color: STATUS.good },
    { label: "Corrected", value: reviews.corrected, color: STATUS.warning },
    { label: "Not reviewed", value: reviews.unreviewed, color: "rgba(255,255,255,0.22)" },
  ]
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        {parts.filter((part) => part.value > 0).map((part) => (
          <div key={part.label} style={{ width: `${(part.value / total) * 100}%`, background: part.color }} title={`${part.label}: ${part.value}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: CHART.textSecondary }}>
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: part.color }} />
            {part.label}: <span style={{ color: CHART.textPrimary }}>{part.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** AI grade against engineer grade, as counts. Shown to engineers and admins. */
function AgreementSummary({ agreement }: { agreement: ReviewAgreement }) {
  const percent = (count: number) => `${Math.round((count / agreement.reviewed) * 100)}%`
  return (
    <div className="mt-4 rounded-xl border border-white/10 p-3">
      <p className="text-xs font-semibold" style={{ color: CHART.textPrimary }}>AI grade against engineer grade</p>
      <p className="mt-1 text-xs leading-5" style={{ color: CHART.textSecondary }}>
        Same ASTM grade on {agreement.exact} of {agreement.reviewed} reviewed inspections ({percent(agreement.exact)}); within one grade on {agreement.withinOne} ({percent(agreement.withinOne)}).
      </p>
      <table className="mt-2 w-full text-left text-[11px]" style={{ color: CHART.textSecondary }}>
        <thead>
          <tr>
            <th className="py-1 font-medium">AI grade</th>
            <th className="py-1 font-medium">Engineer grade</th>
            <th className="py-1 text-right font-medium">Inspections</th>
          </tr>
        </thead>
        <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
          {agreement.pairs.map((pair) => (
            <tr key={`${pair.aiGrade}-${pair.engineerGrade}`} className="border-t border-white/5">
              <td className="py-1">{pair.aiGrade}</td>
              <td className="py-1">{pair.engineerGrade}{pair.aiGrade === pair.engineerGrade ? "" : " (differs)"}</td>
              <td className="py-1 text-right">{pair.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
