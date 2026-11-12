import { useEffect, useRef, useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import { AnalysisRequestError, ApiError, analyzeCorrosion } from "@/services/api"
import { supabase } from "@/services/supabase"
import type { AnalysisErrorInfo, AnalysisPhase, ScanResult } from "@/types"

export default function CalculatingPage({
  username,
  imageUrl,
  imageName,
  scanTitle,
  file,
  onDone,
  onNavigate,
  onSessionExpired,
}: {
  username: string
  imageUrl: string
  imageName: string
  scanTitle: string
  file: File | null
  onDone: (result: ScanResult) => void
  onNavigate: (view: "home" | "landing") => void
  onSessionExpired: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [phase, setPhase] = useState<AnalysisPhase>("checking-session")
  const [error, setError] = useState<AnalysisErrorInfo | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [retryToken, setRetryToken] = useState(0)
  const onDoneRef = useRef(onDone)
  const onSessionExpiredRef = useRef(onSessionExpired)
  onDoneRef.current = onDone
  onSessionExpiredRef.current = onSessionExpired

  useEffect(() => {
    return () => {
      if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  useEffect(() => {
    if (!file) {
      setError({
        kind: "invalid-image",
        message: "No image was selected for analysis.",
        retryable: false,
      })
      return
    }

    setError(null)
    setPhase("checking-session")
    setElapsedSeconds(0)

    let cancelled = false
    const controller = new AbortController()
    const startedAt = Date.now()
    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    const runAnalysis = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw new AnalysisRequestError(
          "session-expired",
          "Your session could not be verified. Please log in again.",
          false,
        )
      }
      if (!session?.access_token || !session.user) {
        throw new AnalysisRequestError(
          "session-expired",
          "Your session has expired. Please log in again.",
          false,
        )
      }

      setPhase("processing")
      return analyzeCorrosion(file, imageUrl, {
        accessToken: session.access_token,
        title: scanTitle,
        signal: controller.signal,
      })
    }

    runAnalysis()
      .then((result) => {
        if (cancelled) return
        setPhase("complete")
        onDoneRef.current(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPhase("failed")
          if (cause instanceof AnalysisRequestError) {
            if (cause.kind === "session-expired") onSessionExpiredRef.current()
            setError({
              kind: cause.kind,
              message: cause.message,
              retryable: cause.retryable,
            })
            return
          }
          if (cause instanceof ApiError && cause.status === 401) {
            onSessionExpiredRef.current()
            setError({
              kind: "session-expired",
              message: "Your session has expired. Please log in again.",
              retryable: false,
            })
            return
          }
          setError({
            kind: "unknown",
            message: cause instanceof Error ? cause.message : "Analysis failed.",
            retryable: true,
          })
        }
      })

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(elapsedTimer)
    }
  }, [file, imageUrl, retryToken])

  const isActive = phase === "checking-session" || phase === "processing"
  // Input rejected by validation (not metal / unusable lighting): retrying the same photo cannot help.
  const REJECTED_HEADINGS: Partial<Record<AnalysisErrorInfo["kind"], string>> = {
    "not-metal": "This doesn't look like metal.",
    "poor-lighting": "The lighting in this photo is unusable.",
    "too-blurry": "This photo is too blurry.",
    "too-small": "This photo is too small.",
  }
  const rejectedHeading = error ? REJECTED_HEADINGS[error.kind] : undefined
  const isRejectedInput = rejectedHeading !== undefined
  const phaseLabel =
    phase === "checking-session"
      ? "Checking your session..."
      : phase === "processing"
        ? "Analyzing corrosion and saving the result..."
        : phase === "complete"
          ? "Scan complete"
          : "Analysis failed"
  const phaseDetail =
    phase === "checking-session"
      ? "Preparing a secure request"
      : phase === "processing"
        ? elapsedSeconds > 15
          ? "The model is still working. This can take a little longer for large images."
          : "Running the corrosion model and storing your scan"
        : phase === "complete"
          ? "Opening your results"
          : "Review the error below and retry when ready"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      <Header
        username={username}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        menuOpen={menuOpen}
      />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(view) => {
          if (view === "home" || view === "landing") onNavigate(view)
        }}
      />

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl text-center">
          {isRejectedInput ? (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-300/70 bg-amber-300/10 text-4xl font-semibold text-amber-200" aria-label="Invalid input">
              !
            </div>
          ) : error ? (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-red-300/70 bg-red-300/10 text-4xl font-light text-red-200" aria-label="Analysis failed">
              ×
            </div>
          ) : (
            <div className="analysis-spinner mx-auto h-16 w-16 rounded-full border-4 border-white/15 border-t-red-300" aria-label="Analysis in progress" />
          )}
          <p className="mt-8 text-xs font-mono uppercase tracking-[0.2em] text-white/40">
            {isRejectedInput ? "Invalid input" : error ? "Analysis failed" : phase === "complete" ? "Scan complete" : "Please wait"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {isRejectedInput ? rejectedHeading : error ? "We couldn't finish this scan." : phase === "complete" ? "Opening your results..." : "Analyzing your image..."}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/55">
            {error?.message || phaseDetail}
          </p>
          <p className="mt-4 truncate text-xs text-white/35" title={imageName}>
            {imageName}
          </p>
          {isActive && (
            <p className="mt-2 text-xs text-white/30">Elapsed {elapsedSeconds}s</p>
          )}
          {error && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {isRejectedInput ? (
                <button type="button" onClick={() => onNavigate("home")} className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white">
                  Choose another image
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setRetryToken((token) => token + 1)} disabled={!error.retryable} className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                    Retry analysis
                  </button>
                  <button type="button" onClick={() => onNavigate("home")} className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/70 hover:text-white">
                    Scan another image
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
