import { useState } from "react"
import { isManager, useNav } from "@/components/NavContext"
import { clearScanReview, reviewScan } from "@/services/api"
import { errorMessage, withToken } from "@/services/session"
import { DISTRIBUTION_TYPES } from "@/utils/classificationInfo"
import { formatDate } from "@/utils/condition"
import type { DistributionType, ScanResult } from "@/types"

/**
 * The engineer's verdict on a scan. The AI proposes a reading; an engineer confirms it
 * or corrects it with a note. Everyone sees the verdict; only engineers and admins can
 * give one.
 */
export default function ReviewPanel({ scan }: { scan: ScanResult }) {
  const nav = useNav()
  const manager = isManager(nav.role)
  const review = scan.review ?? null
  const [correcting, setCorrecting] = useState(false)
  const [rust, setRust] = useState("")
  const [distribution, setDistribution] = useState<DistributionType | "">("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const run = async (action: () => Promise<ScanResult>) => {
    setBusy(true)
    setError("")
    try {
      nav.scanUpdated(await action())
      setCorrecting(false)
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The review could not be saved."))
    } finally {
      setBusy(false)
    }
  }

  const submitCorrection = () => {
    const value = Number(rust)
    if (rust.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) {
      return setError("Enter the corrected rust percentage, from 0 to 100.")
    }
    if (!note.trim()) return setError("Add a short note saying why the reading was corrected.")
    void run(() =>
      withToken((token) =>
        reviewScan(token, scan.id, {
          action: "correct",
          rustPercent: value,
          distributionType: distribution || null,
          note: note.trim(),
        }),
      ),
    )
  }

  const startCorrection = () => {
    setRust(String(scan.rustPercent))
    setDistribution(scan.distributionType ?? "")
    setNote("")
    setError("")
    setCorrecting(true)
  }

  const fieldClass = "rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/60"
  const buttonClass = "min-h-10 rounded-lg border px-4 py-2 text-sm font-medium text-white/85 hover:text-white disabled:opacity-40"

  return (
    <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.05)" }}>
      <p className="text-xs font-mono uppercase tracking-wider text-white/40">Engineer review</p>

      {review ? (
        <div className="mt-3">
          <p className="text-base font-semibold text-white">
            {review.status === "corrected" ? "Corrected by an engineer" : "Confirmed by an engineer"}
          </p>
          <p className="mt-1 text-sm text-white/65">
            {review.byName ?? "An engineer"} · {formatDate(review.at)}
          </p>
          {review.status === "corrected" && (
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              The AI measured {review.aiRustPercent}% (ASTM grade {review.aiAstmGrade}). The engineer's value of {scan.rustPercent}% is used for the grade, the recommendation and the trend.
            </p>
          )}
          {review.note && <p className="mt-2 text-sm leading-relaxed text-white/75">Note: {review.note}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Not yet reviewed. This is the system's reading; it has not been confirmed by an engineer.
          {!manager && " An engineer or admin can confirm or correct it."}
        </p>
      )}

      {manager && !correcting && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(!review || review.status === "corrected") && (
            <button type="button" disabled={busy} className={buttonClass} style={{ borderColor: "var(--color-border)" }}
              onClick={() => void run(() => withToken((token) => reviewScan(token, scan.id, { action: "confirm" })))}>
              Confirm the AI reading
            </button>
          )}
          <button type="button" disabled={busy} className={buttonClass} style={{ borderColor: "var(--color-border)" }} onClick={startCorrection}>
            {review?.status === "corrected" ? "Correct again" : "Correct the reading"}
          </button>
          {review && (
            <button type="button" disabled={busy} className={buttonClass} style={{ borderColor: "var(--color-border)" }}
              onClick={() => void run(() => withToken((token) => clearScanReview(token, scan.id)))}>
              Withdraw the review
            </button>
          )}
        </div>
      )}

      {manager && correcting && (
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); submitCorrection() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm text-white/80">
              Corrected rust %
              <input value={rust} onChange={(event) => setRust(event.target.value)} inputMode="decimal" autoFocus className={fieldClass} style={{ borderColor: "var(--color-border)" }} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-white/80">
              Distribution
              <select value={distribution} onChange={(event) => setDistribution(event.target.value as DistributionType | "")} className={fieldClass} style={{ borderColor: "var(--color-border)", background: "var(--color-btn)" }}>
                <option value="">Keep the AI's</option>
                {(Object.keys(DISTRIBUTION_TYPES) as DistributionType[]).map((key) => (
                  <option key={key} value={key}>{DISTRIBUTION_TYPES[key].name} ({key})</option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-white/80">
            Why it was corrected
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} className={fieldClass} style={{ borderColor: "var(--color-border)" }} placeholder="e.g. The underside, not visible in the photo, is also rusted." />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-10 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--color-accent)" }}>
              {busy ? "Saving..." : "Save the correction"}
            </button>
            <button type="button" disabled={busy} className={buttonClass} style={{ borderColor: "var(--color-border)" }} onClick={() => setCorrecting(false)}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-200" role="alert">{error}</p>}
    </div>
  )
}
