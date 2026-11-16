import { useState, type ReactNode } from "react"
import { ActionButton } from "@/components/PageShell"
import { errorMessage } from "@/services/session"
import type { Asset, AssetInput, ScanOptions, Site, SiteInput } from "@/types"

const inputClass =
  "w-full rounded-lg border bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/60"
const inputStyle = { borderColor: "var(--color-border)" }
const selectStyle = { borderColor: "var(--color-border)", background: "var(--color-btn)" }

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-white/80">{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-white/45">{hint}</span>}
    </label>
  )
}

/** A centred dialog for one form. */
export function FormDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "var(--color-header)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-3.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-white/50 hover:text-white">×</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function SiteForm({
  site,
  scanOptions,
  onSave,
  onCancel,
}: {
  /** Given when editing. */
  site?: Site
  scanOptions: ScanOptions
  onSave: (input: SiteInput) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(site?.name ?? "")
  const [location, setLocation] = useState(site?.location ?? "")
  const [environment, setEnvironment] = useState(site?.environment ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const selected = scanOptions.environments.find((option) => option.code === environment)

  const submit = async () => {
    if (!name.trim()) return setError("Enter a name for the site.")
    if (!environment) return setError("Choose the exposure environment.")
    setSaving(true)
    setError("")
    try {
      await onSave({ name: name.trim(), location: location.trim() || null, environment })
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The site could not be saved."))
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <Field label="Site name">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus className={inputClass} style={inputStyle} placeholder="e.g. Gusaling Villegas, PLM" />
      </Field>
      <Field label="Location (optional)">
        <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={200} className={inputClass} style={inputStyle} placeholder="e.g. Intramuros, Manila" />
      </Field>
      <Field
        label="Exposure environment"
        hint={selected ? `${selected.description} Assumed rate: ${selected.ratePerDay}% of the surface per day.` : "ISO 12944 corrosivity category. Every asset on the site uses it as its starting corrosion rate."}
      >
        <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className={inputClass} style={selectStyle}>
          <option value="" disabled>Choose where the site is exposed</option>
          {scanOptions.environments.map((option) => (
            <option key={option.code} value={option.code}>{option.code} · {option.name}</option>
          ))}
        </select>
      </Field>
      {error && <p className="text-sm text-red-200" role="alert">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <ActionButton onClick={onCancel} disabled={saving}>Cancel</ActionButton>
        <ActionButton type="submit" primary disabled={saving}>{saving ? "Saving..." : site ? "Save changes" : "Add site"}</ActionButton>
      </div>
    </form>
  )
}

export function AssetForm({
  asset,
  scanOptions,
  onSave,
  onCancel,
}: {
  /** Given when editing. */
  asset?: Asset
  scanOptions: ScanOptions
  onSave: (input: AssetInput) => Promise<void>
  onCancel: () => void
}) {
  const [tag, setTag] = useState(asset?.tag ?? "")
  const [name, setName] = useState(asset?.name ?? "")
  const [elementType, setElementType] = useState(asset?.elementType ?? "")
  const [area, setArea] = useState(asset?.surfaceAreaM2 != null ? String(asset.surfaceAreaM2) : "")
  const [coating, setCoating] = useState(asset?.coatingSystem ?? "")
  const [coatedOn, setCoatedOn] = useState(asset?.lastCoatedOn ?? "")
  const [notes, setNotes] = useState(asset?.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const selected = scanOptions.elementTypes.find((option) => option.name === elementType)

  const submit = async () => {
    if (!tag.trim()) return setError("Enter the asset's tag or mark.")
    if (!elementType) return setError("Choose the element type.")
    const areaValue = area.trim() === "" ? null : Number(area)
    if (areaValue !== null && (!Number.isFinite(areaValue) || areaValue <= 0)) {
      return setError("The coated area must be a number above zero, or left empty.")
    }
    setSaving(true)
    setError("")
    try {
      await onSave({
        tag: tag.trim(),
        name: name.trim() || null,
        elementType,
        surfaceAreaM2: areaValue,
        coatingSystem: coating.trim() || null,
        lastCoatedOn: coatedOn || null,
        notes: notes.trim() || null,
      })
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The asset could not be saved."))
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label="Tag">
          <input value={tag} onChange={(event) => setTag(event.target.value)} maxLength={40} autoFocus className={inputClass} style={inputStyle} placeholder="e.g. T-3" />
        </Field>
        <Field label="Description (optional)">
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={inputClass} style={inputStyle} placeholder="e.g. Roof truss, north bay" />
        </Field>
      </div>
      <Field label="Element type" hint={selected ? selected.examples : "It sets what each result tells the inspector to check."}>
        <select value={elementType} onChange={(event) => setElementType(event.target.value)} className={inputClass} style={selectStyle}>
          <option value="" disabled>Choose the type of steel element</option>
          {scanOptions.elementTypes.map((option) => (
            <option key={option.name} value={option.name}>{option.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Coated area in m² (optional)" hint="Used to turn rust % into square metres of work.">
          <input value={area} onChange={(event) => setArea(event.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} placeholder="e.g. 12.5" />
        </Field>
        <Field label="Last coated on (optional)" hint="The trend restarts from this date.">
          <input type="date" value={coatedOn} onChange={(event) => setCoatedOn(event.target.value)} className={inputClass} style={selectStyle} />
        </Field>
      </div>
      <Field label="Coating system (optional)">
        <input value={coating} onChange={(event) => setCoating(event.target.value)} maxLength={200} className={inputClass} style={inputStyle} placeholder="e.g. Zinc-rich primer, epoxy, polyurethane topcoat" />
      </Field>
      <Field label="Notes (optional)">
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={2} className={inputClass} style={inputStyle} />
      </Field>
      {error && <p className="text-sm text-red-200" role="alert">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <ActionButton onClick={onCancel} disabled={saving}>Cancel</ActionButton>
        <ActionButton type="submit" primary disabled={saving}>{saving ? "Saving..." : asset ? "Save changes" : "Add asset"}</ActionButton>
      </div>
    </form>
  )
}
