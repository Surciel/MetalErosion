import { useState } from "react"
import InfoTooltip from "@/components/InfoTooltip"
import { CATEGORY_INFO } from "@/utils/classificationInfo"
import type { AssetCategory, ScanResult } from "@/types"

/**
 * Shows the asset category a scan was analysed with and the rate it implies. When
 * `onChange` is given, the owner can correct the category; the backend then redoes the
 * prediction with the new rate.
 */
export default function AssetCategoryLine({
  scan,
  categories,
  onChange,
}: {
  scan: ScanResult
  categories: AssetCategory[]
  onChange?: (assetCategory: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const details = categories.find((option) => option.name === scan.assetCategory)

  const save = async () => {
    if (!onChange) return
    if (!draft) {
      setError("Choose a category.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onChange(draft)
      setEditing(false)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The category could not be changed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="text-xs text-white/60">
      <p className="flex flex-wrap items-center gap-x-1">
        <span>
          Asset category:{" "}
          <span className="text-white/85">
            {scan.assetCategory ?? "Not recorded (Hardware rate used)"}
          </span>
          {scan.categoryRate !== null && ` · ${scan.categoryRate.toFixed(3)}% per day`}
        </span>
        <InfoTooltip label="About the asset category" align="right">
          <span className="block">{CATEGORY_INFO}</span>
          {details && (
            <>
              <span className="mt-2 block text-white/70">{details.basis}</span>
              <span className="mt-1 block text-white/55">{details.evidence}</span>
            </>
          )}
        </InfoTooltip>
        {onChange && !editing && categories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setDraft(scan.assetCategory ?? "")
              setError("")
              setEditing(true)
            }}
            className="ml-1 underline decoration-white/30 hover:text-white"
          >
            {scan.assetCategory ? "Change" : "Set"}
          </button>
        )}
      </p>

      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`category-${scan.id}`}>
            Asset category
          </label>
          <select
            id={`category-${scan.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={saving}
            className="rounded-md border border-white/20 px-2 py-1 text-xs text-white outline-none"
            style={{ background: "var(--color-btn)" }}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name} ({option.ratePerDay}% per day)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !draft || draft === scan.assetCategory}
            className="rounded-md px-2 py-1 text-xs font-medium text-green-200 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save and recalculate"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-md px-2 py-1 text-xs text-white/60 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="mt-1 text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
