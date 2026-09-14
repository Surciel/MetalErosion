import { useEffect, useRef, useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import PageGrid from "@/components/PageGrid"
import { analyzeCorrosion } from "@/services/api"
import { supabase } from "@/services/supabase"
import type { ScanResult } from "@/types"

export default function CalculatingPage({
  username,
  imageUrl,
  imageName,
  file,
  onDone,
  onNavigate,
}: {
  username: string
  imageUrl: string
  imageName: string
  file: File | null
  onDone: (result: ScanResult) => void
  onNavigate: (view: "home" | "landing") => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [progress, setProgress] = useState(10)
  const [error, setError] = useState("")
  const [retryToken, setRetryToken] = useState(0)
  const lastRequestKey = useRef("")
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    return () => {
      if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  useEffect(() => {
    if (!file) {
      setError("No image was selected for analysis.")
      return
    }

    const requestKey = `${file.name}:${file.size}:${file.lastModified}:${imageUrl}:${retryToken}`
    if (lastRequestKey.current === requestKey) return
    lastRequestKey.current = requestKey
    setError("")
    setProgress(10)

    let cancelled = false
    const runAnalysis = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) throw sessionError
      if (!session?.access_token || !session.user) {
        throw new Error("Your session has expired. Please log in again.")
      }

      setProgress(50)
      return analyzeCorrosion(file, imageUrl, {
        accessToken: session.access_token,
      })
    }

    runAnalysis()
      .then((result) => {
        if (cancelled) return
        setProgress(100)
        onDoneRef.current(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Analysis failed.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [file, imageUrl, retryToken])

  const circumference = 2 * Math.PI * 54

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)" }}
    >
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

      <main className="flex-1 flex items-center py-16 px-4">
        <PageGrid>
          {/* cols 4–9: 6-column centered content */}
          <div
            className="flex flex-col items-center gap-8"
            style={{ gridColumn: "4 / 10" }}
          >
            {/* Circular progress */}
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle
                cx="70"
                cy="70"
                r="54"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              <circle
                cx="70"
                cy="70"
                r="54"
                fill="none"
                stroke="#c0392b"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress / 100)}
                transform="rotate(-90 70 70)"
                style={{ transition: "stroke-dashoffset 0.3s ease" }}
              />
              <text
                x="70"
                y="66"
                textAnchor="middle"
                fontSize="22"
                fontWeight="700"
                fill="#f0ede8"
                fontFamily="Outfit"
              >
                {Math.round(progress)}%
              </text>
              <text
                x="70"
                y="82"
                textAnchor="middle"
                fontSize="10"
                fill="rgba(240,237,232,0.5)"
                fontFamily="Outfit"
              >
                analyzed
              </text>
            </svg>

            {/* Image preview */}
            <div
              className="w-40 h-28 rounded-xl overflow-hidden"
              style={{ background: "var(--color-card)" }}
            >
              <img
                src={imageUrl}
                alt={imageName}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Status */}
            <div className="text-center">
              <p className="font-semibold text-white text-base">
                {error || "Analyzing image..."}
              </p>
              <p className="text-white/40 text-xs mt-1 font-mono">
                {imageName}
              </p>
            </div>

            {error && (
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRetryToken((token) => token + 1)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: "var(--color-accent)" }}
                >
                  Retry analysis
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("home")}
                  className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white"
                  style={{ background: "var(--color-btn)" }}
                >
                  Choose another image
                </button>
              </div>
            )}

            {/* Progress bar */}
            <div
              className="w-full rounded-full overflow-hidden h-1.5"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: "#c0392b" }}
              />
            </div>

            {/* Skeleton cards */}
            <div className="w-full grid grid-cols-2 gap-5 opacity-40">
              {["Rust Percentage", "Classification"].map((label) => (
                <div
                  key={label}
                  className="rounded-xl p-4 text-center"
                  style={{ background: "var(--color-card)" }}
                >
                  <p className="text-xs text-white/50 mb-2">{label}</p>
                  <div
                    className="h-6 rounded-md animate-pulse"
                    style={{ background: "var(--color-btn)" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </PageGrid>
      </main>
    </div>
  )
}
