import { useEffect, useMemo, useState } from "react"
import { primeAlertAudio } from "@/utils/alertSound"

type ScanPreparationModalProps = {
  file: File
  sourceUrl: string
  onCancel: () => void
  onConfirm: (file: File, previewUrl: string, title: string) => void
}

const MAX_TITLE_LENGTH = 120

export default function ScanPreparationModal({
  file,
  sourceUrl,
  onCancel,
  onConfirm,
}: ScanPreparationModalProps) {
  const [title, setTitle] = useState(() => file.name.replace(/\.[^/.]+$/, ""))
  const [error, setError] = useState("")

  const titleLength = useMemo(() => title.trim().length, [title])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const handleConfirm = () => {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError("Enter a name for this scan.")
      return
    }
    if (normalizedTitle.length > MAX_TITLE_LENGTH) {
      setError(`Use ${MAX_TITLE_LENGTH} characters or fewer.`)
      return
    }

    // Unlock audio during this click so the severity alert can play when results arrive.
    primeAlertAudio()
    // Callers revoke `sourceUrl` after confirming, so hand over a fresh preview URL.
    onConfirm(file, URL.createObjectURL(file), normalizedTitle)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-preparation-title"
    >
      <div className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "var(--color-header)", borderColor: "var(--color-border)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">Before analysis</p>
            <h2 id="scan-preparation-title" className="mt-1 text-xl font-semibold text-white">Prepare your scan</h2>
            <p className="mt-1 text-sm text-white/55">Name your scan. The full image will be analyzed.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close scan preparation" className="text-2xl leading-none text-white/50 hover:text-white">×</button>
        </div>

        <form
          className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_240px]"
          onSubmit={(event) => {
            event.preventDefault()
            handleConfirm()
          }}
        >
          <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-xl bg-black/35 p-4" style={{ minHeight: "min(52vh, 480px)" }}>
            <img src={sourceUrl} alt="Scan preview" className="block max-h-[48vh] max-w-full object-contain" />
          </div>

          <div className="flex flex-col gap-5">
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

            <p className="text-xs leading-relaxed text-white/40">
              For best results, make sure the metal surface fills most of the photo and is evenly lit.
            </p>

            {error && <p className="text-sm text-red-200" role="alert">{error}</p>}

            <div className="mt-auto flex flex-col gap-2 sm:flex-row md:flex-col">
              <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white" style={{ borderColor: "var(--color-border)" }}>Cancel</button>
              <button type="submit" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110" style={{ background: "var(--color-accent)" }}>Start scan</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
