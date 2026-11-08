import { useEffect, useRef, useState } from "react"
import type { ScanResult, SeverityLevel } from "@/types"
import { SEVERITY_COLORS, severityLevel } from "@/utils/severity"
import { isAlertMuted, playSeverityTone, setAlertMuted } from "@/utils/alertSound"
import { distributionName } from "@/utils/classificationInfo"

const AUTO_DISMISS_MS = 8000

const HEADLINES: Record<SeverityLevel, string> = {
  critical: "Critical corrosion: immediate action required",
  high: "Elevated priority: plan maintenance soon",
  moderate: "Moderate corrosion detected",
  low: "Light corrosion detected",
  none: "No corrosion detected",
}

type SeverityAlertProps = {
  result: ScanResult
  onClose: () => void
}

/**
 * Pop-up shown once when a new scan result arrives. Plays a tone matched to the
 * severity. Critical alerts stay until dismissed; others close after 8 seconds.
 */
export default function SeverityAlert({ result, onClose }: SeverityAlertProps) {
  const level = severityLevel(result)
  const color = SEVERITY_COLORS[level]
  const isCritical = level === "critical"
  const [muted, setMuted] = useState(isAlertMuted)
  // Keep the latest onClose without restarting the timer when the parent re-renders.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Play the tone once per result.
  useEffect(() => {
    playSeverityTone(level)
  }, [result.id, level])

  useEffect(() => {
    if (isCritical) return
    const timer = window.setTimeout(() => onCloseRef.current(), AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [isCritical, result.id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setAlertMuted(next)
  }

  return (
    <div
      role={isCritical ? "alert" : "status"}
      aria-live={isCritical ? "assertive" : "polite"}
      className={`severity-alert fixed left-1/2 top-20 z-[80] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border p-5 shadow-2xl backdrop-blur${isCritical ? " severity-alert-critical" : ""}`}
      style={{
        background: "rgba(20,17,15,0.96)",
        borderColor: color,
        boxShadow: `0 0 0 1px ${color}55, 0 20px 50px rgba(0,0,0,0.5)`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold"
          style={{ background: `${color}22`, color }}
          aria-hidden="true"
        >
          {level === "none" ? "✓" : "!"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color }}>
            {HEADLINES[level]}
          </p>
          <p className="mt-1 truncate text-xs text-white/50">{result.title || result.imageName}</p>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/5 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-white/40">Rust</dt>
              <dd className="font-mono text-sm font-bold text-white">{result.rustPercent}%</dd>
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-white/40">ASTM</dt>
              <dd className="font-mono text-sm font-bold text-white">{result.astmRating}</dd>
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-white/40">Spread</dt>
              <dd className="truncate text-sm font-bold text-white">
                {result.distributionType ? distributionName(result.distributionType) : "—"}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-5 text-white/75">{result.dss}</p>
          {result.daysToCritical !== null && level !== "critical" && level !== "none" && (
            <p className="mt-1 text-xs text-white/45">
              About {result.daysToCritical} days until critical at the current rate.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="text-xs text-white/50 hover:text-white"
        >
          {muted ? "🔇 Alert sounds off" : "🔊 Alert sounds on"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-white"
          style={{ background: isCritical ? color : "rgba(255,255,255,0.1)" }}
        >
          {isCritical ? "Acknowledge" : "Dismiss"}
        </button>
      </div>
    </div>
  )
}
