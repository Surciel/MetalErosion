import { useCallback, useEffect, useState } from "react"
import PageShell, { ActionButton, EmptyState, Notice } from "@/components/PageShell"
import { AssetForm, FormDialog, SiteForm } from "@/components/InventoryForms"
import { isManager, useNav } from "@/components/NavContext"
import ChartCard from "@/components/charts/ChartCard"
import CountBarChart from "@/components/charts/CountBarChart"
import StatTile from "@/components/charts/StatTile"
import { LevelChip, Reading, gradeBars, levelCounts } from "@/components/charts/LevelCharts"
import { ApiError, createAsset, deleteSite, getSiteRegister, updateSite } from "@/services/api"
import { errorMessage, withToken } from "@/services/session"
import { downloadCsv } from "@/utils/csv"
import { ACTION_LEVELS, RATE_SOURCE_LABELS, deadlineText, formatArea, formatDate, formatRate } from "@/utils/condition"
import { toTable } from "@/utils/analytics"
import type { Asset, AssetInput, RegisterTotals, SiteInput, SiteRegister } from "@/types"

/** One sentence that says what the register's numbers mean for planning. */
/** One line for the grade chart: the worst grade and the most common one. */
export function gradeReading(byGrade: Record<string, number>): string {
  const grades = Object.entries(byGrade)
    .filter(([, count]) => count > 0)
    .map(([grade, count]) => ({ grade: Number(grade), count }))
  if (grades.length === 0) return "No asset has been graded yet."
  const worst = grades.reduce((a, b) => (b.grade < a.grade ? b : a))
  const common = grades.reduce((a, b) => (b.count > a.count || (b.count === a.count && b.grade < a.grade) ? b : a))
  const assets = (n: number) => `${n} asset${n === 1 ? "" : "s"}`
  return `Worst grade on this site: ${worst.grade} (${assets(worst.count)}). Most common: grade ${common.grade} (${assets(common.count)}).`
}

/** One line for the area chart: the total and the biggest share. */
export function areaReading(areas: { label: string; value: number; detail?: string }[]): string {
  const total = areas.reduce((sum, item) => sum + item.value, 0)
  const largest = areas.reduce((a, b) => (b.value > a.value ? b : a))
  return `${formatArea(total)} of work in total; the largest share is ${(largest.detail ?? largest.label).toLowerCase()} (${formatArea(largest.value)}).`
}

export function registerReading(totals: RegisterTotals): string {
  if (totals.inspected === 0) return "No asset on this site has been inspected yet."
  const parts = [`${totals.needingAction} of ${totals.inspected} inspected assets need coating work`]
  if (totals.critical > 0) parts.push(`${totals.critical} ${totals.critical === 1 ? "needs" : "need"} a structural assessment first`)
  if (totals.overdue > totals.critical) parts.push(`${totals.overdue - totals.critical} ${totals.overdue - totals.critical === 1 ? "is" : "are"} past ${totals.overdue - totals.critical === 1 ? "its" : "their"} deadline`)
  if (totals.notInspected > 0) parts.push(`${totals.notInspected} ${totals.notInspected === 1 ? "has" : "have"} not been inspected`)
  return `${parts.join("; ")}.`
}

export function registerCsvRows(register: SiteRegister): (string | number | null)[][] {
  return [
    [
      "Site", "Environment", "Tag", "Description", "Element type", "Inspections", "Latest inspection",
      "Rust %", "ASTM D610 rating", "Action level", "Strategy", "Surface preparation", "Act by",
      "Days to next level", "Rate (% per day)", "Rate source", "Coated area (m2)", "Rusted area (m2)",
      "Work area (m2)", "Review",
    ],
    ...register.assets.map((asset) => {
      const condition = asset.condition
      return [
        register.site.name, register.site.environment, asset.tag, asset.name, asset.elementType, asset.scanCount,
        condition?.date ? condition.date.slice(0, 10) : null,
        condition?.rustPercent ?? null, condition?.astmRating ?? null, condition?.actionLevel ?? null,
        condition?.strategy ?? null, condition?.surfacePreparation ?? null, condition?.dueDate ?? null,
        condition?.daysToNext ?? null, condition?.ratePerDay ?? null,
        condition ? RATE_SOURCE_LABELS[condition.rateSource] : null,
        asset.surfaceAreaM2, condition?.rustedAreaM2 ?? null, condition?.workAreaM2 ?? null,
        condition?.reviewStatus ?? (condition ? "unreviewed" : null),
      ]
    }),
  ]
}

/** A site's priority register: every asset, ranked by how soon it needs work. */
export default function SitePage() {
  const nav = useNav()
  const siteId = nav.selectedSiteId
  const [register, setRegister] = useState<SiteRegister | null>(null)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState<"asset" | "site" | null>(null)

  const load = useCallback(async () => {
    if (!siteId) return
    setError("")
    try {
      setRegister(await withToken((token) => getSiteRegister(token, siteId)))
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) return nav.sessionExpired()
      setError(errorMessage(cause, "The site could not be loaded."))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  useEffect(() => {
    void load()
  }, [load])

  if (!siteId) return null
  const site = register?.site
  const canManage = Boolean(site && (isManager(nav.role) || site.createdBy === nav.userId))

  const addAsset = async (input: AssetInput) => {
    await withToken((token) => createAsset(token, siteId, input))
    setDialog(null)
    await load()
  }
  const saveSite = async (input: SiteInput) => {
    await withToken((token) => updateSite(token, siteId, input))
    setDialog(null)
    await load()
  }
  const removeSite = async () => {
    if (!site) return
    const warning = `Delete the site "${site.name}" and its ${site.assetCount} asset(s)? Their scans are kept as scans with no asset. This cannot be undone.`
    if (!window.confirm(warning)) return
    try {
      await withToken((token) => deleteSite(token, siteId))
      nav.navigate("sites")
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The site could not be deleted."))
    }
  }

  const totals = register?.totals
  const environment = nav.scanOptions.environments.find((option) => option.code === site?.environment)
  const areaData = totals
    ? ACTION_LEVELS.filter((item) => totals.areaByStrategy[item.strategy]).map((item) => ({
        label: item.short,
        value: totals.areaByStrategy[item.strategy],
        detail: item.strategy,
      }))
    : []

  return (
    <PageShell
      title={site?.name ?? "Site"}
      badge={site?.isDemo ? <span className="rounded-full border border-amber-300/50 px-2 py-0.5 text-[11px] text-amber-200">Demo data</span> : undefined}
      subtitle={site ? `${site.location ?? "No location recorded"} · Exposure ${site.environment}${environment ? ` (${environment.name})` : ""}` : undefined}
      crumbs={[{ label: "Sites and assets", onClick: () => nav.navigate("sites") }, { label: site?.name ?? "Site" }]}
      actions={
        site && (
          <>
            <ActionButton primary onClick={() => setDialog("asset")}>Add an asset</ActionButton>
            <ActionButton onClick={() => nav.openSiteReport(siteId)} disabled={!register || register.assets.length === 0}>Site report</ActionButton>
            <ActionButton
              onClick={() => register && downloadCsv(`${site.name.replace(/[^\w-]+/g, "_")}_register.csv`, registerCsvRows(register))}
              disabled={!register || register.assets.length === 0}
            >
              Export CSV
            </ActionButton>
            {canManage && <ActionButton onClick={() => setDialog("site")}>Edit site</ActionButton>}
            {canManage && <ActionButton danger onClick={() => void removeSite()}>Delete</ActionButton>}
          </>
        )
      }
    >
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {!register && !error ? (
        <p className="py-16 text-center text-sm text-white/50">Loading the register...</p>
      ) : register && register.assets.length === 0 ? (
        <EmptyState
          title="No assets on this site yet"
          text="Add each steel element you inspect: a truss, a railing, a roof bay, a tank. Give it the tag used on the drawings so the next inspector finds the same element."
          action={<ActionButton primary onClick={() => setDialog("asset")}>Add an asset</ActionButton>}
        />
      ) : register && totals ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Assets" value={String(totals.assets)} detail={`${totals.inspected} inspected, ${totals.notInspected} not yet`} />
            <StatTile label="Need coating work" value={String(totals.needingAction)} detail="Action level 2 or higher" />
            <StatTile label="Critical or overdue" value={String(totals.overdue)} detail={`${totals.critical} ${totals.critical === 1 ? "needs" : "need"} a structural assessment`} />
            <StatTile label="Area to treat" value={formatArea(totals.workAreaM2)} detail="Where a coated area is recorded" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Assets by action level"
              subtitle="How many assets need each kind of work. L1 needs none; L6 needs a structural assessment."
              table={toTable("Action level", "Assets", levelCounts(totals.byLevel))}
              empty={totals.inspected === 0 ? "No asset has been inspected yet." : undefined}
            >
              <CountBarChart data={levelCounts(totals.byLevel)} direction="columns" unit="assets" />
              <Reading>{registerReading(totals)}</Reading>
            </ChartCard>
            <ChartCard
              title="Assets by ASTM D610 grade"
              subtitle="Grade 10 is no rust; grade 0 is more than half the surface rusted."
              table={toTable("Grade", "Assets", gradeBars(totals.byGrade))}
              empty={totals.inspected === 0 ? "No asset has been inspected yet." : undefined}
            >
              <CountBarChart data={gradeBars(totals.byGrade)} direction="columns" unit="assets" />
              <Reading>{gradeReading(totals.byGrade)}</Reading>
            </ChartCard>
            {areaData.length > 0 && (
              <ChartCard
                title="Area to treat, by strategy"
                subtitle="Square metres of work, for assets with a recorded coated area. Spot work counts the rusted area only; the feathering allowance follows the project specification."
                table={toTable("Strategy", "m²", areaData)}
                className="lg:col-span-2"
              >
                <CountBarChart data={areaData} direction="bars" unit="m²" />
                <Reading>{areaReading(areaData)}</Reading>
              </ChartCard>
            )}
          </div>

          <RegisterTable assets={register.assets} onOpen={(asset) => nav.openAsset(asset.id)} />
        </div>
      ) : null}

      {dialog === "asset" && (
        <FormDialog title="Add an asset" onClose={() => setDialog(null)}>
          <AssetForm scanOptions={nav.scanOptions} onSave={addAsset} onCancel={() => setDialog(null)} />
        </FormDialog>
      )}
      {dialog === "site" && site && (
        <FormDialog title="Edit site" onClose={() => setDialog(null)}>
          <SiteForm site={site} scanOptions={nav.scanOptions} onSave={saveSite} onCancel={() => setDialog(null)} />
        </FormDialog>
      )}
    </PageShell>
  )
}

/** The priority register: one row per asset, most urgent first. */
export function RegisterTable({
  assets,
  onOpen,
  showSite = false,
}: {
  assets: Asset[]
  onOpen?: (asset: Asset) => void
  showSite?: boolean
}) {
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: "var(--color-card)" }}>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Priority register</h2>
        <p className="mt-1 text-xs text-white/55">Ranked by urgency: the highest action level first, then the nearest deadline.</p>
      </div>
      <p className="px-5 pt-3 text-[11px] text-white/45 md:hidden">Swipe the table sideways to see every column.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-xs text-white/50">
              <th className="px-5 py-3 font-medium">Asset</th>
              <th className="px-3 py-3 font-medium">Rust</th>
              <th className="px-3 py-3 font-medium">ASTM</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Act by</th>
              <th className="px-3 py-3 font-medium">Rate</th>
              <th className="px-3 py-3 font-medium text-right">Area to treat</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const condition = asset.condition
              return (
                <tr
                  key={asset.id}
                  onClick={onOpen ? () => onOpen(asset) : undefined}
                  onKeyDown={onOpen ? (event) => { if (event.key === "Enter") onOpen(asset) } : undefined}
                  tabIndex={onOpen ? 0 : undefined}
                  className={`border-t border-white/8 align-top ${onOpen ? "cursor-pointer hover:bg-white/5 focus:bg-white/5 focus:outline-none" : ""}`}
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white">{asset.tag}</p>
                    <p className="text-xs text-white/55">
                      {showSite && asset.siteName ? `${asset.siteName} · ` : ""}
                      {asset.name ?? asset.elementType}
                    </p>
                  </td>
                  {condition ? (
                    <>
                      <td className="px-3 py-3 font-mono text-white">{condition.rustPercent}%</td>
                      <td className="px-3 py-3 font-mono text-white/85">{condition.astmRating ?? "-"}</td>
                      <td className="px-3 py-3">
                        <LevelChip level={condition.actionLevel} strategy={condition.strategy} />
                        {condition.reviewStatus && (
                          <p className="mt-1 text-[11px] text-white/45">{condition.reviewStatus === "corrected" ? "Corrected by engineer" : "Confirmed by engineer"}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-white/85">
                        {deadlineText(condition)}
                        <p className="text-[11px] text-white/45">Inspected {formatDate(condition.date)}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-white/70">
                        {RATE_SOURCE_LABELS[condition.rateSource]}
                        {condition.ratePerDay > 0 && <p className="text-[11px] text-white/45">{formatRate(condition.ratePerDay)}</p>}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-white/85">{formatArea(condition.workAreaM2)}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="px-3 py-3 text-xs text-white/50">Not inspected yet. Open the asset to scan it.</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
