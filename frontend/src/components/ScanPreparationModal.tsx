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

  const message =
    problem ||
    (categoriesUnavailable
      ? categoriesError ||
        "The asset categories could not be loaded, so the scan cannot start. Check that the backend is running, then choose the image again."
      : photoCheck.state === "rejected" || photoCheck.state === "failed"
        ? photoCheck.message
        : error)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-preparation-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "var(--color-header)", borderColor: "var(--color-border)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">Before analysis</p>
            <h2 id="scan-preparation-title" className="mt-1 text-xl font-semibold text-white">Prepare your scan</h2>
            <p className="mt-1 text-sm text-white/55">Name the scan and say what kind of object it is. The full image will be analyzed.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close scan preparation" className="text-2xl leading-none text-white/50 hover:text-white">×</button>
        </div>

        <form
          className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_340px]"
          onSubmit={(event) => {
            event.preventDefault()
            handleConfirm()
          }}
        >
          <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl bg-black/35 p-4">
            <img src={sourceUrl} alt="Scan preview" className="block max-h-[52vh] max-w-full object-contain" />
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50">Scan name</span>
              <input
                value={title}
                onChange={(event) => { setTitle(event.target.value); setError("") }}
                maxLength={MAX_TITLE_LENGTH}
                autoFocus
                className="rounded-lg border bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/60"
                style={{ borderColor: "var(--color-border)" }}
                placeholder="e.g. Workshop wrench"
              />
              <span className="text-right text-[10px] text-white/35">{titleLength}/{MAX_TITLE_LENGTH}</span>
            </label>

            <fieldset
              className="flex flex-col gap-2"
              disabled={pickerLocked}
              aria-describedby="photo-check-status"
            >
              <legend className="mb-2 text-xs font-mono uppercase tracking-wider text-white/50">
                What kind of object is this?
              </legend>
              <p className="text-xs leading-relaxed text-white/45">
                This sets how fast rust is expected to grow, so it changes the predicted days to critical. You can correct it later from the scan's history page.
              </p>
              {!problem && !categoriesUnavailable && !photoPassed && (
                <p
                  id="photo-check-status"
                  className="rounded-lg border px-3 py-2 text-xs leading-5 text-white/70"
                  style={{ borderColor: "var(--color-border)" }}
                  role="status"
                >
                  {photoCheck.state === "checking"
                    ? "Checking the photo for a metal surface… The categories unlock once it passes."
                    : photoCheck.state === "rejected"
                      ? "This photo can't be scanned, so no category can be chosen. Choose a different photo."
                      : "The photo could not be checked yet, so no category can be chosen."}
                </p>
              )}
              {categories.map((option) => {
                const active = photoPassed && option.name === category
                return (
                  <label
                    key={option.name}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      pickerLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                    }`}
                    style={{
                      borderColor: active ? "#f0ede8" : "var(--color-border)",
                      background: active ? "rgba(255,255,255,0.10)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="asset-category"
                      value={option.name}
                      checked={active}
                      onChange={() => { setCategory(option.name); setError("") }}
                      className="mt-1 accent-red-300"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{option.name}</span>
                      <span className="block text-xs leading-5 text-white/60">{option.description}</span>
                      <span className="block text-[11px] leading-5 text-white/40">e.g. {option.examples}</span>
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {selected && (
              <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-5 text-white/65">
                Scanning as <span className="font-semibold text-white">{selected.name}</span>: baseline rust growth of {selected.ratePerDay}% of the surface per day, about {selected.yearsNewToCritical} years from rust-free to critical.
              </p>
            )}

            <p className="text-xs leading-relaxed text-white/40">
              For best results, make sure the metal surface fills most of the photo and is evenly lit.
            </p>

            {message && <p className="text-sm text-red-200" role="alert">{message}</p>}

            {photoCheck.state === "failed" && !problem && (
              <button
                type="button"
                onClick={() => setCheckAttempt((attempt) => attempt + 1)}
                className="self-start text-sm font-medium text-white/80 underline underline-offset-2 hover:text-white"
              >
                Check the photo again
              </button>
            )}

            <div className="mt-auto flex flex-col gap-2 sm:flex-row md:flex-col">
              <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white" style={{ borderColor: "var(--color-border)" }}>Cancel</button>
              <button type="submit" disabled={blocked || !selected} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "var(--color-accent)" }}>
                {selected
                  ? `Start scan as ${selected.name}`
                  : photoCheck.state === "checking" && !problem
                    ? "Checking the photo…"
                    : photoPassed
                      ? "Choose a category to start"
                      : "Photo can't be scanned"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
