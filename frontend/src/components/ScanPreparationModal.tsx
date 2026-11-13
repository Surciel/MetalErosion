import { useEffect, useMemo, useState } from "react"
import { primeAlertAudio } from "@/utils/alertSound"
import { AnalysisRequestError, checkScanImage } from "@/services/api"
import { supabase } from "@/services/supabase"
import type { AssetCategory } from "@/types"

/** Result of the backend photo check that must pass before a category can be picked. */
type PhotoCheck =
  | { state: "checking" }
  | { state: "passed" }
  | { state: "rejected"; message: string }
  | { state: "failed"; message: string }

type ScanPreparationModalProps = {
  file: File
  sourceUrl: string
  /** Loaded from the backend, so the picker and the prediction use the same list. */
  categories: AssetCategory[]
  /** Why the categories could not be loaded, if they could not. */
  categoriesError?: string
  onCancel: () => void
  onConfirm: (file: File, previewUrl: string, title: string, assetCategory: string) => void
}

const MAX_TITLE_LENGTH = 120
// Mirrors the backend limits (backend/main.py MAX_IMAGE_BYTES, image_quality.py formats)
// so the user is told before the upload instead of after it.
const MAX_FILE_BYTES = 15 * 1024 * 1024
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]

function fileProblem(file: File): string {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "This file type is not supported. Use a JPEG, PNG or WebP image."
  }
  if (file.size > MAX_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return `This image is ${sizeMb} MB. The limit is 15 MB.`
  }
  return ""
}

export default function ScanPreparationModal({
  file,
  sourceUrl,
  categories,
  categoriesError = "",
  onCancel,
  onConfirm,
}: ScanPreparationModalProps) {
  const [title, setTitle] = useState(() => file.name.replace(/\.[^/.]+$/, ""))
  // No category is preselected: it sets the corrosion rate, so it must be a deliberate choice.
  const [category, setCategory] = useState("")
  const [error, setError] = useState("")

  const titleLength = useMemo(() => title.trim().length, [title])
  const problem = useMemo(() => fileProblem(file), [file])
  const categoriesUnavailable = categories.length === 0
  const [photoCheck, setPhotoCheck] = useState<PhotoCheck>({ state: "checking" })
  const [checkAttempt, setCheckAttempt] = useState(0)
  const photoPassed = photoCheck.state === "passed"
  // A category can only be chosen once the photo is confirmed to show metal.
  const pickerLocked = categoriesUnavailable || Boolean(problem) || !photoPassed
  const blocked = pickerLocked
  const selected = photoPassed
    ? categories.find((option) => option.name === category)
    : undefined

  // Run the backend's photo checks (lighting, sharpness, metal) as soon as the photo
  // is chosen, so a non-metal photo is stopped before a category is picked.
  useEffect(() => {
    if (problem) return
    const controller = new AbortController()
    setPhotoCheck({ state: "checking" })
    setCategory("")
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          setPhotoCheck({ state: "failed", message: "Your session has expired. Please log in again." })
          return
        }
        await checkScanImage(file, token, controller.signal)
        if (!controller.signal.aborted) setPhotoCheck({ state: "passed" })
      } catch (cause: unknown) {
        if (controller.signal.aborted) return
        if (cause instanceof AnalysisRequestError && !cause.retryable) {
          setPhotoCheck({ state: "rejected", message: cause.message })
        } else {
          setPhotoCheck({
            state: "failed",
            message:
              cause instanceof Error ? cause.message : "The photo could not be checked. Try again.",
          })
        }
      }
    })()
    return () => controller.abort()
  }, [file, problem, checkAttempt])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const handleConfirm = () => {
    if (blocked) return
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError("Enter a name for this scan.")
      return
    }
    if (normalizedTitle.length > MAX_TITLE_LENGTH) {
      setError(`Use ${MAX_TITLE_LENGTH} characters or fewer.`)
      return
    }
    if (!selected) {
      setError("Choose what kind of object this is before starting the scan.")
      return
    }

    // Unlock audio during this click so the severity alert can play when results arrive.
    primeAlertAudio()
    // Callers revoke `sourceUrl` after confirming, so hand over a fresh preview URL.
    onConfirm(file, URL.createObjectURL(file), normalizedTitle, selected.name)
  }

  // One message that stops the scan: shown on its own, with a single way forward.
  const blockingMessage =
    problem ||
    (categoriesUnavailable
      ? categoriesError ||
        "The asset categories could not be loaded, so the scan cannot start. Check that the backend is running, then choose the image again."
      : photoCheck.state === "rejected"
        ? photoCheck.message
        : "")
  const checking = !blockingMessage && photoCheck.state === "checking"
  const checkFailed = !blockingMessage && photoCheck.state === "failed"
  const ready = !blockingMessage && photoPassed
  const footerHint = error || (ready && !selected ? "Choose what kind of object this is." : "")

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-preparation-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "var(--color-header)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-3.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 id="scan-preparation-title" className="text-lg font-semibold text-white">New scan</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-2xl leading-none text-white/50 hover:text-white">×</button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            handleConfirm()
          }}
        >
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex items-center justify-center overflow-hidden rounded-xl bg-black/35 p-3 md:sticky md:top-0 md:self-start">
              <img src={sourceUrl} alt="Scan preview" className="block max-h-[56vh] max-w-full rounded-lg object-contain" />
            </div>

            <div className="flex flex-col gap-5">
              {blockingMessage && (
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3.5" role="alert">
                  <p className="text-sm font-semibold text-white">
                    {categoriesUnavailable && !problem ? "Scans can't start right now" : "This photo can't be scanned"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-red-100/90">{blockingMessage}</p>
                </div>
              )}

              {checking && (
                <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-white/75" style={{ borderColor: "var(--color-border)" }} role="status">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden="true" />
                  Checking the photo for metal…
                </div>
              )}

              {checkFailed && (
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3.5" role="alert">
                  <p className="text-sm font-semibold text-white">The photo couldn't be checked</p>
                  <p className="mt-1 text-sm leading-relaxed text-red-100/90">
                    {photoCheck.state === "failed" ? photoCheck.message : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCheckAttempt((attempt) => attempt + 1)}
                    className="mt-3 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
                  >
                    Try again
                  </button>
                </div>
              )}

              {ready && (
                <p className="flex items-center gap-2 text-sm text-emerald-300" role="status">
                  <span aria-hidden="true">✓</span> Metal detected. This photo can be scanned.
                </p>
              )}

              {!blockingMessage && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-white/80">Scan name</span>
                    <input
                      value={title}
                      onChange={(event) => { setTitle(event.target.value); setError("") }}
                      maxLength={MAX_TITLE_LENGTH}
                      autoFocus
                      className="rounded-lg border bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/60"
                      style={{ borderColor: "var(--color-border)" }}
                      placeholder="e.g. Workshop wrench"
                    />
                    {titleLength > MAX_TITLE_LENGTH - 20 && (
                      <span className="text-right text-[11px] text-white/40">{titleLength}/{MAX_TITLE_LENGTH}</span>
                    )}
                  </label>

                  <fieldset
                    className={`flex flex-col gap-1.5 transition-opacity ${ready ? "" : "opacity-40"}`}
                    disabled={!ready}
                  >
                    <legend className="mb-1.5 text-sm font-medium text-white/80">What kind of object is this?</legend>
                    {categories.map((option) => {
                      const active = ready && option.name === category
                      return (
                        <label
                          key={option.name}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                            ready ? "cursor-pointer hover:bg-white/5" : "cursor-not-allowed"
                          }`}
                          style={{
                            borderColor: active ? "#f0ede8" : "var(--color-border)",
                            background: active ? "rgba(255,255,255,0.10)" : undefined,
                          }}
                        >
                          <input
                            type="radio"
                            name="asset-category"
                            value={option.name}
                            checked={active}
                            onChange={() => { setCategory(option.name); setError("") }}
                            className="shrink-0 accent-red-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-white">{option.name}</span>
                            <span className="block truncate text-xs text-white/45" title={option.examples}>{option.examples}</span>
                          </span>
                        </label>
                      )
                    })}
                  </fieldset>

                  {selected && (
                    <p className="rounded-lg bg-white/5 px-3 py-2.5 text-xs leading-5 text-white/65">
                      {selected.description} Rust is assumed to grow {selected.ratePerDay}% of the surface per day, about {Math.round(selected.yearsNewToCritical)} {Math.round(selected.yearsNewToCritical) === 1 ? "year" : "years"} from rust-free to critical. You can change this later from the scan's history page.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t px-5 py-3.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {blockingMessage ? (
              <button type="button" onClick={onCancel} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110" style={{ background: "var(--color-accent)" }}>
                Choose a different photo
              </button>
            ) : (
              <>
                {footerHint && (
                  <p className={`mr-auto text-sm ${error ? "text-red-200" : "text-white/50"}`} role={error ? "alert" : undefined}>
                    {footerHint}
                  </p>
                )}
                <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white" style={{ borderColor: "var(--color-border)" }}>Cancel</button>
                <button type="submit" disabled={blocked || !selected} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "var(--color-accent)" }}>
                  {checking ? "Checking photo…" : "Start scan"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
