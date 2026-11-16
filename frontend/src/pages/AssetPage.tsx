import { useCallback, useEffect, useRef, useState } from "react"
import PageShell, { ActionButton, Card, EmptyState, Notice } from "@/components/PageShell"
import { AssetForm, FormDialog } from "@/components/InventoryForms"
import ScanPreparationModal from "@/components/ScanPreparationModal"
import { isManager, useNav } from "@/components/NavContext"
import ChartCard from "@/components/charts/ChartCard"
import TrendChart from "@/components/charts/TrendChart"
import { LevelChip, Reading, ThresholdBar } from "@/components/charts/LevelCharts"
import { ApiError, deleteAsset, getAssetDetail, updateAsset } from "@/services/api"
import { errorMessage, withToken } from "@/services/session"
import {
  RATE_SOURCE_LABELS,
  deadlineText,
  formatArea,
  formatDate,
  formatDays,
  formatRate,
  rateExplanation,
} from "@/utils/condition"
import type { AssetCondition, AssetDetail, AssetInput } from "@/types"

/** What the trend chart shows, in one sentence. */
export function trendReading(condition: AssetCondition): string {
  const trend = condition.trend
  if (trend.source === "no_growth") {
    return `Rust has not grown across ${trend.usableInspections} inspections over ${Math.round(trend.spanDays)} days. Keep inspecting; no deadline is projected.`
  }
  const basis =
    trend.source === "measured"
      ? `Rust is growing ${formatRate(condition.ratePerDay)}, measured from ${trend.usableInspections} inspections`
      : `Rust is assumed to grow ${formatRate(condition.ratePerDay)} for this environment (not yet measured)`
  if (condition.nextThreshold === null) return `${basis}. The surface is already at the critical level.`
  if (condition.daysToNext === null) return `${basis}.`
  return `${basis}. At that rate it reaches ${condition.nextThreshold}% in ${formatDays(condition.daysToNext)}.`
}

/** One steel element: its condition now, its trend, and every inspection of it. */
export default function AssetPage() {
  const nav = useNav()
  const assetId = nav.selectedAssetId
  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingUrl, setPendingUrl] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!assetId) return
    setError("")
    try {
      setDetail(await withToken((token) => getAssetDetail(token, assetId)))
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) return nav.sessionExpired()
      setError(errorMessage(cause, "The asset could not be loaded."))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => () => {
    if (pendingUrl.startsWith("blob:")) URL.revokeObjectURL(pendingUrl)
  }, [pendingUrl])

  if (!assetId) return null
  const asset = detail?.asset
  const site = detail?.site
  const condition = asset?.condition ?? null
  const canManage = Boolean(asset && (isManager(nav.role) || asset.createdBy === nav.userId))
  const element = nav.scanOptions.elementTypes.find((option) => option.name === asset?.elementType)

  const chooseFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return
    setPendingFile(file)
    setPendingUrl(URL.createObjectURL(file))
  }
  const closeModal = () => {
    setPendingFile(null)
    setPendingUrl("")
    if (inputRef.current) inputRef.current.value = ""
  }
  const save = async (input: AssetInput) => {
    await withToken((token) => updateAsset(token, assetId, input))
    setEditing(false)
    await load()
  }
  const remove = async () => {
    if (!asset || !site) return
    const warning = `Delete the asset "${asset.tag}"? Its ${asset.scanCount} scan(s) are kept as scans with no asset. This cannot be undone.`
    if (!window.confirm(warning)) return
    try {
      await withToken((token) => deleteAsset(token, assetId))
      nav.openSite(site.id)
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The asset could not be deleted."))
    }
  }

  const scanButton = (
    <ActionButton primary onClick={() => inputRef.current?.click()}>Scan this asset</ActionButton>
  )

  return (
    <PageShell
      title={asset ? asset.tag : "Asset"}
      subtitle={asset ? `${asset.name ? `${asset.name} · ` : ""}${asset.elementType}` : undefined}
      badge={site?.isDemo ? <span className="rounded-full border border-amber-300/50 px-2 py-0.5 text-[11px] text-amber-200">Demo data</span> : undefined}
      crumbs={[
        { label: "Sites and assets", onClick: () => nav.navigate("sites") },
        { label: site?.name ?? "Site", onClick: site ? () => nav.openSite(site.id) : undefined },
        { label: asset?.tag ?? "Asset" },
      ]}
      actions={
        asset && (
          <>
            {scanButton}
            {canManage && <ActionButton onClick={() => setEditing(true)}>Edit asset</ActionButton>}
            {canManage && <ActionButton danger onClick={() => void remove()}>Delete</ActionButton>}
          </>
        )
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      {!detail && !error ? (
        <p className="py-16 text-center text-sm text-white/50">Loading the asset...</p>
      ) : asset && site ? (
        <div className="flex flex-col gap-5">
          {!condition ? (
            <EmptyState
              title="Not inspected yet"
              text="Take a photo of this element in even light, with the steel filling most of the frame. The result becomes the first point of its trend."
              action={scanButton}
            />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <Card>
                  <p className="text-xs font-mono uppercase tracking-wider text-white/45">Current condition</p>
                  <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
                    <p className="font-mono text-4xl font-bold text-white">{condition.rustPercent}%</p>
                    <p className="pb-1 font-mono text-lg text-white/80">ASTM {condition.astmRating}</p>
                  </div>
                  <div className="mt-3"><LevelChip level={condition.actionLevel} strategy={condition.strategy} /></div>
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-white/50">Act by</dt>
                    <dd className="text-white">{deadlineText(condition)}</dd>
                    <dt className="text-white/50">Surface preparation</dt>
                    <dd className="text-white/85">{condition.surfacePreparation}</dd>
                    <dt className="text-white/50">Inspected</dt>
                    <dd className="text-white/85">
                      {formatDate(condition.date)}
                      {condition.reviewStatus && ` · ${condition.reviewStatus} by an engineer`}
                    </dd>
                    {asset.surfaceAreaM2 !== null && (
                      <>
                        <dt className="text-white/50">Rusted area</dt>
                        <dd className="text-white/85">{formatArea(condition.rustedAreaM2)} of {formatArea(asset.surfaceAreaM2)}</dd>
                        <dt className="text-white/50">Area to treat</dt>
                        <dd className="text-white/85">{formatArea(condition.workAreaM2)}</dd>
                      </>
                    )}
                  </dl>
                </Card>

                <Card>
                  <p className="text-xs font-mono uppercase tracking-wider text-white/45">Position on the action scale</p>
                  <div className="mt-4"><ThresholdBar rustPercent={condition.rustPercent} /></div>
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <p className="text-xs font-mono uppercase tracking-wider text-white/45">Deterioration rate</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {RATE_SOURCE_LABELS[condition.rateSource]}
                      {condition.ratePerDay > 0 && `: ${formatRate(condition.ratePerDay)}`}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/65">{rateExplanation(condition)}</p>
                    {condition.trend.fittedRateLow !== null && condition.trend.fittedRateHigh !== null && (
                      <p className="mt-1 text-xs leading-5 text-white/50">
                        95% interval of the fitted rate: {condition.trend.fittedRateLow.toFixed(4)} to {condition.trend.fittedRateHigh.toFixed(4)}% per day
                        {condition.trend.rSquared !== null && `, R² ${condition.trend.rSquared.toFixed(2)}`}.
                      </p>
                    )}
                  </div>
                </Card>
              </div>

              <ChartCard
                title="Rust over time"
                subtitle="Each inspection of this asset, the trend fitted through them, and the projection to the next action threshold."
                table={{
                  columns: ["Date", "Rust %", "ASTM rating", "Reviewed"],
                  rows: detail.scans.map((scan) => [formatDate(scan.createdAt), scan.rustPercent, scan.astmRating, scan.review?.status ?? "no"]),
                }}
              >
                <TrendChart scans={detail.scans} condition={condition} />
                <Reading>{trendReading(condition)}</Reading>
              </ChartCard>
            </>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-white">Asset details</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-white/50">Site</dt>
              <dd className="text-white/85">{site.name} · exposure {site.environment}</dd>
              <dt className="text-white/50">Element type</dt>
              <dd className="text-white/85">{asset.elementType}</dd>
              <dt className="text-white/50">Coated area</dt>
              <dd className="text-white/85">{asset.surfaceAreaM2 !== null ? formatArea(asset.surfaceAreaM2) : "Not recorded (needed for square metres of work)"}</dd>
              <dt className="text-white/50">Coating system</dt>
              <dd className="text-white/85">{asset.coatingSystem ?? "Not recorded"}</dd>
              <dt className="text-white/50">Last coated</dt>
              <dd className="text-white/85">{asset.lastCoatedOn ? `${formatDate(asset.lastCoatedOn)} (the trend counts inspections after this date)` : "Not recorded"}</dd>
              {element && (
                <>
                  <dt className="text-white/50">What to check</dt>
                  <dd className="text-white/85">{element.check}</dd>
                </>
              )}
              {asset.notes && (
                <>
                  <dt className="text-white/50">Notes</dt>
                  <dd className="whitespace-pre-wrap text-white/85">{asset.notes}</dd>
                </>
              )}
            </dl>
          </Card>

          {detail.scans.length > 0 && (
            <section className="overflow-hidden rounded-2xl" style={{ background: "var(--color-card)" }}>
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-sm font-semibold text-white">Inspections ({detail.scans.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-white/50">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Rust</th>
                      <th className="px-3 py-3 font-medium">ASTM</th>
                      <th className="px-3 py-3 font-medium">Inspector</th>
                      <th className="px-3 py-3 font-medium">Review</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.scans.map((scan) => (
                      <tr key={scan.id} className="border-t border-white/8">
                        <td className="px-5 py-3 text-white/85">{formatDate(scan.createdAt)}</td>
                        <td className="px-3 py-3 font-mono text-white">{scan.rustPercent}%</td>
                        <td className="px-3 py-3 font-mono text-white/85">{scan.astmRating}</td>
                        <td className="px-3 py-3 text-white/70">{scan.inspectorName ?? "-"}</td>
                        <td className="px-3 py-3 text-xs text-white/70">
                          {scan.review ? `${scan.review.status === "corrected" ? "Corrected" : "Confirmed"}${scan.review.byName ? ` by ${scan.review.byName}` : ""}` : "Not reviewed"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button type="button" onClick={() => nav.openScan(scan, "asset")} className="mr-3 text-xs text-white/75 underline decoration-white/30 hover:text-white">Open</button>
                          <button type="button" onClick={() => nav.openScanReport(scan)} className="text-xs text-white/75 underline decoration-white/30 hover:text-white">Report</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : null}

      {editing && asset && (
        <FormDialog title="Edit asset" onClose={() => setEditing(false)}>
          <AssetForm asset={asset} scanOptions={nav.scanOptions} onSave={save} onCancel={() => setEditing(false)} />
        </FormDialog>
      )}
      {pendingFile && pendingUrl && asset && site && (
        <ScanPreparationModal
          file={pendingFile}
          sourceUrl={pendingUrl}
          scanOptions={nav.scanOptions}
          optionsError={nav.optionsError}
          presetAsset={{ asset, site }}
          onCancel={closeModal}
          onConfirm={(file, previewUrl, title, details) => {
            closeModal()
            nav.startScan(file, previewUrl, title, details)
          }}
        />
      )}
    </PageShell>
  )
}
