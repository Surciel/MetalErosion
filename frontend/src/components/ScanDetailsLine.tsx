import { useState } from "react"
import InfoTooltip from "@/components/InfoTooltip"
import { useOptionalNav } from "@/components/NavContext"
import { EXPOSURE_INFO } from "@/utils/classificationInfo"
import type { ScanDetails, ScanOptions, ScanResult } from "@/types"

/**
 * Shows the element type and exposure environment a scan was analysed with, and the
 * baseline rate the environment implies. When `onChange` is given, the owner can correct
 * them; the backend then redoes the prediction and the maintenance answer.
 */
export default function ScanDetailsLine({
  scan,
  scanOptions,
  onChange,
}: {
  scan: ScanResult
  scanOptions: ScanOptions
  onChange?: (details: ScanDetails) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [elementType, setElementType] = useState("")
  const [environment, setEnvironment] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const exposure = scanOptions.environments.find((option) => option.code === scan.environment)
  const optionsLoaded =
    scanOptions.elementTypes.length > 0 && scanOptions.environments.length > 0
  const recorded = Boolean(scan.elementType && scan.environment)
  const unchanged = elementType === scan.elementType && environment === scan.environment
  const nav = useOptionalNav()
  const asset = scan.asset ?? null
  // A scan of an asset takes both details from the asset and its site, so they are
  // changed there and not on the scan.
  const editable = Boolean(onChange) && !asset

  const save = async () => {
    if (!onChange) return
    if (!elementType || !environment) {
      setError("Choose both the element type and the exposure environment.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onChange({ elementType, environment })
      setEditing(false)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The scan details could not be changed.")
    } finally {
      setSaving(false)
    }
  }

  const selectClass =
    "rounded-md border border-white/20 px-2 py-1 text-xs text-white outline-none"

  return (
    <div className="text-xs text-white/60">
      {asset && (
        <p className="mb-0.5">
          Asset:{" "}
          {nav ? (
            <button type="button" onClick={() => nav.openAsset(asset.id)} className="font-semibold text-white underline decoration-white/30 hover:decoration-white">
              {asset.tag}
            </button>
          ) : (
            <span className="font-semibold text-white">{asset.tag}</span>
          )}
          {asset.siteName && ` · ${asset.siteName}`}
        </p>
      )}
      {asset && (
        <p className="mb-0.5 text-white/50">
          This scan's projection uses the assumed rate for its exposure. The asset page shows the rate measured from all its inspections.
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1">
        <span>
          Element:{" "}
          <span className="text-white/85">{scan.elementType ?? "Not recorded"}</span>
          {" · "}Exposure:{" "}
          <span className="text-white/85">
            {scan.environment
              ? `${scan.environment}${exposure ? ` (${exposure.name})` : ""}`
              : scan.legacyCategory
                ? `Not recorded (earlier "${scan.legacyCategory}" rate used)`
                : "Not recorded (earlier default rate used)"}
          </span>
          {scan.baselineRate !== null && ` · ${scan.baselineRate.toFixed(4)}% per day`}
        </span>
        <InfoTooltip label="About the element type and exposure environment" align="right">
          <span className="block">{EXPOSURE_INFO}</span>
          {exposure && (
            <>
              <span className="mt-2 block text-white/70">{exposure.basis}</span>
              <span className="mt-1 block text-white/55">{exposure.evidence}</span>
            </>
          )}
        </InfoTooltip>
        {editable && !editing && optionsLoaded && (
          <button
            type="button"
            onClick={() => {
              setElementType(scan.elementType ?? "")
              setEnvironment(scan.environment ?? "")
              setError("")
              setEditing(true)
            }}
            className="ml-1 underline decoration-white/30 hover:text-white"
          >
            {recorded ? "Change" : "Set"}
          </button>
        )}
      </p>

      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`element-${scan.id}`}>
            Element type
          </label>
          <select
            id={`element-${scan.id}`}
            value={elementType}
            onChange={(event) => setElementType(event.target.value)}
            disabled={saving}
            className={selectClass}
            style={{ background: "var(--color-btn)" }}
          >
            <option value="" disabled>
              Element type
            </option>
            {scanOptions.elementTypes.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={`environment-${scan.id}`}>
            Exposure environment
          </label>
          <select
            id={`environment-${scan.id}`}
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            disabled={saving}
            className={selectClass}
            style={{ background: "var(--color-btn)" }}
          >
            <option value="" disabled>
              Exposure environment
            </option>
            {scanOptions.environments.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} · {option.name} ({option.ratePerDay}% per day)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !elementType || !environment || unchanged}
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
