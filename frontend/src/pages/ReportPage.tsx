import { useEffect, useState, type ReactNode } from "react"
import PageShell, { ActionButton, Notice } from "@/components/PageShell"
import BoundingBoxImage from "@/components/BoundingBoxImage"
import { useNav } from "@/components/NavContext"
import TrendChart from "@/components/charts/TrendChart"
import { ThresholdBar } from "@/components/charts/LevelCharts"
import { trendReading } from "@/pages/AssetPage"
import { registerCsvRows, registerReading } from "@/pages/SitePage"
import { ApiError, getAssetDetail, getSiteRegister } from "@/services/api"
import { errorMessage, withToken } from "@/services/session"
import { downloadCsv } from "@/utils/csv"
import { distributionName } from "@/utils/classificationInfo"
import {
  ACTION_LEVELS,
  RATE_SOURCE_LABELS,
  deadlineText,
  formatArea,
  formatDate,
  formatDays,
  formatRate,
} from "@/utils/condition"
import type { AssetDetail, ScanResult, SiteRegister } from "@/types"

/** A white page laid out for printing; the browser's "Save as PDF" makes the file. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <article className="report-sheet mx-auto w-full max-w-[820px] rounded-lg bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-2xl sm:p-10">
      {children}
    </article>
  )
}

function SheetHeader({ title, reference }: { title: string; reference: string }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">RustScan · Steel corrosion inspection</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">{title}</h1>
      </div>
      <div className="text-right text-[11px] text-neutral-600">
        <p>Report date: {formatDate(new Date().toISOString())}</p>
        <p className="break-all">Ref: {reference}</p>
      </div>
    </header>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report-section mb-6">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[12px] font-bold uppercase tracking-wider text-neutral-700">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-neutral-500">{label}</dt>
          <dd className="font-medium text-neutral-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="report-section mt-6 grid grid-cols-2 gap-10 text-[12px] text-neutral-700">
      {[left, right].map((label) => (
        <div key={label}>
          <div className="h-10 border-b border-neutral-500" />
          <p className="mt-1">{label}</p>
          <p className="text-neutral-500">Name, signature and date</p>
        </div>
      ))}
    </div>
  )
}

function Disclaimer() {
  return (
    <p className="mt-6 border-t border-neutral-300 pt-3 text-[11px] leading-relaxed text-neutral-500">
      This report is produced from photographs. It measures visible surface rust and cannot measure pitting depth or loss of section. It supports an inspection and does not replace one. Deadlines are projections from the stated rate.
    </p>
  )
}

function ReportToolbar({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className="no-print mx-auto mb-4 flex w-full max-w-[820px] flex-wrap items-center justify-between gap-3">
      <ActionButton onClick={onBack}>Back</ActionButton>
      <div className="flex flex-wrap gap-2">
        {children}
        <ActionButton primary onClick={() => window.print()}>Print or save as PDF</ActionButton>
      </div>
    </div>
  )
}

/** The inspection report for one scan. */
export function ScanReportPage({ scan, onBack }: { scan: ScanResult; onBack: () => void }) {
  const nav = useNav()
  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [error, setError] = useState("")
  const assetId = scan.asset?.id

  useEffect(() => {
    if (!assetId) return
    let cancelled = false
    void (async () => {
      try {
        const next = await withToken((token) => getAssetDetail(token, assetId))
        if (!cancelled) setDetail(next)
      } catch (cause: unknown) {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 401) return nav.sessionExpired()
        setError(errorMessage(cause, "The asset's history could not be loaded; the report shows this scan only."))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const answer = scan.decisionSupport
  const environment = nav.scanOptions.environments.find((option) => option.code === scan.environment)
  const asset = detail?.asset
  const condition = asset?.condition ?? null
  // The asset's condition describes its latest inspection; use it only when this is that one.
  const isLatest = Boolean(condition && condition.scanId === scan.id)
  // When this is the asset's latest inspection and its rate was measured, the trend deadline is the one to use.
  const measuredTiming = Boolean(isLatest && condition && condition.rateSource !== "assumed" && (detail?.scans.length ?? 0) > 1)
  const review = scan.review

  return (
    <PageShell title="Inspection report" crumbs={[{ label: "Back to the scan", onClick: onBack }, { label: "Inspection report" }]}>
      {error && <div className="no-print mb-4"><Notice>{error}</Notice></div>}
      <ReportToolbar onBack={onBack} />
      <Sheet>
        <SheetHeader title="Corrosion Inspection Report" reference={scan.id} />

        <Section title="Identification">
          <Facts
            rows={[
              ["Site", scan.asset?.siteName ? `${scan.asset.siteName}${detail?.site?.isDemo ? " (demo data: simulated inspection dates)" : ""}` : "Not assigned to a site"],
              ["Asset", scan.asset ? `${scan.asset.tag}${scan.asset.name ? ` (${scan.asset.name})` : ""}` : "Scan with no asset"],
              ["Element type", scan.elementType ?? "Not recorded"],
              ["Exposure environment", scan.environment ? `${scan.environment}${environment ? ` (${environment.name})` : ""}` : "Not recorded"],
              ["Scan name", scan.title ?? scan.imageName],
              ["Inspection date", formatDate(scan.createdAt)],
              ["Inspector", scan.inspectorName ?? "Not recorded"],
            ]}
          />
        </Section>

        <Section title="Result">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="overflow-hidden rounded border border-neutral-300">
              <BoundingBoxImage src={scan.imageUrl} alt={`Photo of ${scan.title ?? scan.imageName}`} coordinates={scan.boxCoordinates} imageClassName="block w-full" />
            </div>
            <div>
              <Facts
                rows={[
                  ["Rusted area", <span key="rust" className="text-lg font-bold">{scan.rustPercent}%</span>],
                  ["ASTM D610 rating", scan.astmRating],
                  ["Distribution", distributionName(scan.distributionType)],
                  ["Strategy", answer ? `Level ${answer.level}: ${answer.strategy}` : scan.dss],
                  ["Surface preparation", answer?.surfacePreparation || "-"],
                  [measuredTiming ? "Act within (assumed rate)" : "Act within", answer?.actWithinDays != null ? formatDays(answer.actWithinDays) : answer?.level === 6 ? "Now" : "No work due"],
                  ["Inspect again in", answer?.rescanInDays != null ? formatDays(answer.rescanInDays) : "-"],
                  ["Rate used", scan.regressionSlope !== null ? `${formatRate(scan.regressionSlope)} (assumed for the environment)` : "-"],
                ]}
              />
              <p className="mt-2 text-[11px] text-neutral-500">Boxes on the photo mark the largest rust areas measured.</p>
            </div>
          </div>
          <div className="mt-5"><ThresholdBar rustPercent={scan.rustPercent} tone="light" /></div>
        </Section>

        {answer && (
          <Section title="Recommended work">
            <p className="mb-2 font-semibold">{answer.headline} {answer.summary}</p>
            <ol className="list-decimal space-y-1 pl-5">
              {answer.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <p className="mt-3 font-semibold">Basis</p>
            <ul className="list-disc space-y-1 pl-5 text-neutral-700">
              {answer.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            {answer.ifDelayed && <p className="mt-3 text-neutral-700"><span className="font-semibold">If this is left: </span>{answer.ifDelayed}</p>}
          </Section>
        )}

        {asset && detail && detail.scans.length > 1 && (
          <Section title={`Trend of asset ${asset.tag}`}>
            <TrendChart scans={detail.scans} condition={condition} tone="light" height={220} />
            {condition && <p className="mt-2 text-neutral-700">{trendReading(condition)}</p>}
            {condition && isLatest && (
              <p className="mt-1 text-neutral-700">
                Deadline from this asset's trend ({RATE_SOURCE_LABELS[condition.rateSource].toLowerCase()} rate): {deadlineText(condition)}.
                {measuredTiming && " This replaces the assumed-rate timing in the result above."}
                {asset.surfaceAreaM2 !== null && ` Area to treat: ${formatArea(condition.workAreaM2)} of ${formatArea(asset.surfaceAreaM2)}.`}
              </p>
            )}
          </Section>
        )}

        <Section title="Engineer review">
          {review ? (
            <Facts
              rows={[
                ["Status", review.status === "corrected" ? "Corrected by an engineer" : "Confirmed by an engineer"],
                ["Reviewed by", review.byName ?? "Not recorded"],
                ["Reviewed on", formatDate(review.at)],
                ...(review.status === "corrected"
                  ? ([["AI reading", `${review.aiRustPercent}% (ASTM grade ${review.aiAstmGrade}); the values above are the engineer's.`]] as [string, ReactNode][])
                  : []),
                ["Note", review.note ?? "-"],
              ]}
            />
          ) : (
            <p className="text-neutral-700">Not yet reviewed. The values above are the system's reading and have not been confirmed by an engineer.</p>
          )}
        </Section>

        {answer && answer.limits.length > 0 && (
          <Section title="Limits of this result">
            <ul className="list-disc space-y-1 pl-5 text-neutral-700">
              {answer.limits.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          </Section>
        )}

        <Signatures left="Inspected by" right="Reviewed by (engineer)" />
        <Disclaimer />
      </Sheet>
    </PageShell>
  )
}

/** The condition report for one site: its register on paper. */
export function SiteReportPage() {
  const nav = useNav()
  const siteId = nav.selectedSiteId
  const [register, setRegister] = useState<SiteRegister | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!siteId) return
    let cancelled = false
    void (async () => {
      try {
        const next = await withToken((token) => getSiteRegister(token, siteId))
        if (!cancelled) setRegister(next)
      } catch (cause: unknown) {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 401) return nav.sessionExpired()
        setError(errorMessage(cause, "The site report could not be loaded."))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  if (!siteId) return null
  const back = () => nav.openSite(siteId)
  const site = register?.site
  const totals = register?.totals
  const environment = nav.scanOptions.environments.find((option) => option.code === site?.environment)

  return (
    <PageShell
      title="Site condition report"
      crumbs={[
        { label: "Sites and assets", onClick: () => nav.navigate("sites") },
        { label: site?.name ?? "Site", onClick: back },
        { label: "Report" },
      ]}
    >
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {!register && !error && <p className="py-16 text-center text-sm text-white/50">Loading the report...</p>}
      {register && site && totals && (
        <>
          <ReportToolbar onBack={back}>
            <ActionButton onClick={() => downloadCsv(`${site.name.replace(/[^\w-]+/g, "_")}_register.csv`, registerCsvRows(register))}>Export CSV</ActionButton>
          </ReportToolbar>
          <Sheet>
            <SheetHeader title="Site Condition Report" reference={site.id} />
            <Section title="Site">
              <Facts
                rows={[
                  ["Site", `${site.name}${site.isDemo ? " (demo data)" : ""}`],
                  ["Location", site.location ?? "Not recorded"],
                  ["Exposure environment", `${site.environment}${environment ? ` (${environment.name})` : ""}`],
                  ["Assets", `${totals.assets} (${totals.inspected} inspected, ${totals.notInspected} not yet)`],
                  ["Area to treat", formatArea(totals.workAreaM2)],
                ]}
              />
              <p className="mt-3 font-semibold">{registerReading(totals)}</p>
            </Section>

            <Section title="Assets by action level">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-400 text-[11px] uppercase tracking-wide text-neutral-600">
                    <th className="py-1 pr-2">Level</th>
                    <th className="py-1 pr-2">Strategy</th>
                    <th className="py-1 pr-2 text-right">Assets</th>
                    <th className="py-1 text-right">Area to treat</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTION_LEVELS.map((item) => (
                    <tr key={item.level} className="border-b border-neutral-200">
                      <td className="py-1 pr-2">{item.level}</td>
                      <td className="py-1 pr-2">{item.strategy}</td>
                      <td className="py-1 pr-2 text-right">{totals.byLevel[String(item.level)] ?? 0}</td>
                      <td className="py-1 text-right">{totals.areaByStrategy[item.strategy] ? formatArea(totals.areaByStrategy[item.strategy]) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Priority register (most urgent first)">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-neutral-400 text-[10px] uppercase tracking-wide text-neutral-600">
                    <th className="py-1 pr-2">Asset</th>
                    <th className="py-1 pr-2">Inspected</th>
                    <th className="py-1 pr-2 text-right">Rust</th>
                    <th className="py-1 pr-2">ASTM</th>
                    <th className="py-1 pr-2">Strategy</th>
                    <th className="py-1 pr-2">Act by</th>
                    <th className="py-1 pr-2">Rate</th>
                    <th className="py-1 text-right">Area</th>
                  </tr>
                </thead>
                <tbody>
                  {register.assets.map((asset) => {
                    const condition = asset.condition
                    return (
                      <tr key={asset.id} className="border-b border-neutral-200 align-top">
                        <td className="py-1 pr-2">
                          <span className="font-semibold">{asset.tag}</span>
                          <br />
                          <span className="text-neutral-500">{asset.name ?? asset.elementType}</span>
                        </td>
                        {condition ? (
                          <>
                            <td className="whitespace-nowrap py-1 pr-2">{formatDate(condition.date)}</td>
                            <td className="py-1 pr-2 text-right">{condition.rustPercent}%</td>
                            <td className="py-1 pr-2">{condition.astmRating}</td>
                            <td className="py-1 pr-2">L{condition.actionLevel} {condition.strategy}</td>
                            <td className="py-1 pr-2">{deadlineText(condition)}</td>
                            <td className="py-1 pr-2">{RATE_SOURCE_LABELS[condition.rateSource]}</td>
                            <td className="whitespace-nowrap py-1 text-right">{formatArea(condition.workAreaM2)}</td>
                          </>
                        ) : (
                          <td colSpan={7} className="py-1 text-neutral-500">Not inspected yet</td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-neutral-500">
                Spot work counts the rusted area only; the feathering allowance follows the project specification. "Assumed" rates come from the exposure environment; "Measured" rates come from repeated inspections of the asset.
              </p>
            </Section>

            <Signatures left="Prepared by" right="Approved by (engineer)" />
            <Disclaimer />
          </Sheet>
        </>
      )}
    </PageShell>
  )
}
