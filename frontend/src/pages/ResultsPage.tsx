import { useState, useRef } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import PageGrid from "@/components/PageGrid"
import { severityColor } from "@/data/mockData"
import type { ScanResult, View } from "@/types"

type SeverityBadgeProps = {
  label: string
  color: string
}

function SeverityBadge({ label, color }: SeverityBadgeProps) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: color + "22", color }}
    >
      {label}
    </span>
  )
}

export default function ResultsPage({
  username,
  result,
  sessionScans,
  onNavigate,
  onClose,
}: {
  username: string
  result: ScanResult
  sessionScans: ScanResult[]
  onNavigate: (v: View) => void
  onClose: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [displayed, setDisplayed] = useState<ScanResult>(result)
  const carouselRef = useRef<HTMLDivElement>(null)

  const color = severityColor(displayed.rustPercent)

  const scroll = (dir: "left" | "right") => {
    if (!carouselRef.current) return
    carouselRef.current.scrollBy({
      left: dir === "left" ? -200 : 200,
      behavior: "smooth",
    })
  }

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
        onNavigate={onNavigate}
      />

      <div className="flex-1 overflow-y-auto">
        {/* ── Section 1: Overview ───────────────────────────────────── */}
        <section className="py-10" style={{ background: "var(--color-bg)" }}>
          <PageGrid className="px-4">
            {/* Left: image — cols 1–6 */}
            <div style={{ gridColumn: "1 / 7" }}>
              <div
                className="relative w-full rounded-2xl overflow-hidden"
                style={{ background: "var(--color-card)" }}
              >
                <img
                  src={displayed.imageUrl}
                  alt={displayed.imageName}
                  className="w-full object-cover"
                  style={{ height: "300px" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <p className="text-white font-semibold text-sm">
                    {displayed.imageName}
                  </p>
                  <p className="text-white/50 text-xs">{displayed.date}</p>
                </div>
                {/* Rust ring overlay */}
                <div className="absolute bottom-4 right-4">
                  <svg width="68" height="68" viewBox="0 0 68 68">
                    <circle
                      cx="34"
                      cy="34"
                      r="26"
                      fill="rgba(0,0,0,0.6)"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="2"
                    />
                    <circle
                      cx="34"
                      cy="34"
                      r="26"
                      fill="none"
                      stroke={color}
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 26}
                      strokeDashoffset={
                        2 * Math.PI * 26 * (1 - displayed.rustPercent / 100)
                      }
                      transform="rotate(-90 34 34)"
                    />
                    <text
                      x="34"
                      y="30"
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill="#f0ede8"
                      fontFamily="Outfit"
                    >
                      {displayed.rustPercent}%
                    </text>
                    <text
                      x="34"
                      y="42"
                      textAnchor="middle"
                      fontSize="7"
                      fill="rgba(240,237,232,0.55)"
                      fontFamily="Outfit"
                    >
                      RUST
                    </text>
                  </svg>
                </div>
              </div>
            </div>

            {/* Right: quick stats — cols 7–12 */}
            <div
              className="flex flex-col gap-4"
              style={{ gridColumn: "7 / 13" }}
            >
              {/* Corrosion % overview */}
              <div
                className="flex-1 rounded-2xl p-5 flex flex-col gap-2"
                style={{ background: "var(--color-card)" }}
              >
                <p className="text-xs text-white/50 font-mono uppercase tracking-wider">
                  Corrosion %
                </p>
                <p
                  className="text-5xl font-bold leading-none"
                  style={{ color, fontFamily: "JetBrains Mono" }}
                >
                  {displayed.rustPercent}
                  <span className="text-2xl">%</span>
                </p>
                <SeverityBadge
                  label={displayed.classificationLabel}
                  color={color}
                />
              </div>

              {/* Classification overview */}
              <div
                className="flex-1 rounded-2xl p-5 flex flex-col gap-2"
                style={{ background: "var(--color-card)" }}
              >
                <p className="text-xs text-white/50 font-mono uppercase tracking-wider">
                  Classification
                </p>
                <p
                  className="text-4xl font-bold text-white leading-none"
                  style={{ fontFamily: "JetBrains Mono" }}
                >
                  {displayed.classification}
                </p>
                <SeverityBadge
                  label={displayed.classificationLabel}
                  color={color}
                />
              </div>
            </div>
          </PageGrid>

          {/* Session history carousel */}
          {sessionScans.length > 0 && (
            <div className="mt-8 px-4">
              <p className="text-xs text-white/40 font-mono uppercase tracking-wider mb-3 text-center">
                Session scans — {sessionScans.length}{" "}
                {sessionScans.length === 1 ? "scan" : "scans"}
              </p>
              <div className="flex items-center gap-3 max-w-3xl mx-auto">
                <button
                  onClick={() => scroll("left")}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
                  style={{ background: "var(--color-card)" }}
                >
                  <span className="text-white/70 text-sm">‹</span>
                </button>

                <div
                  ref={carouselRef}
                  className="flex gap-3 overflow-x-auto flex-1"
                  style={{ scrollbarWidth: "none" }}
                >
                  {sessionScans.map((scan) => {
                    const sc = severityColor(scan.rustPercent)
                    const isActive = scan.id === displayed.id
                    return (
                      <button
                        key={scan.id}
                        onClick={() => setDisplayed(scan)}
                        className="flex-shrink-0 rounded-xl overflow-hidden transition-all"
                        style={{
                          width: "100px",
                          outline: isActive
                            ? `2px solid ${sc}`
                            : "2px solid transparent",
                          outlineOffset: "2px",
                        }}
                      >
                        <div className="relative">
                          <img
                            src={scan.imageUrl}
                            alt={scan.imageName}
                            className="w-full object-cover"
                            style={{ height: "70px" }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                          <p
                            className="absolute bottom-1.5 left-0 right-0 text-center text-xs font-bold font-mono"
                            style={{ color: sc }}
                          >
                            {scan.rustPercent}%
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => scroll("right")}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
                  style={{ background: "var(--color-card)" }}
                >
                  <span className="text-white/70 text-sm">›</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 2: Deep Analysis ──────────────────────────────── */}
        <section
          className="py-10"
          style={{ background: "var(--color-header)" }}
        >
          <PageGrid className="px-4">
            {/* Corrosion detail — cols 1–6 */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-3"
              style={{
                gridColumn: "1 / 7",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <div>
                <p className="text-xs text-white/40 font-mono uppercase tracking-wider mb-1">
                  Corrosion %
                </p>
                <p className="text-3xl font-bold font-mono" style={{ color }}>
                  {displayed.rustPercent}%
                </p>
              </div>
              <p className="text-sm text-white/75 leading-relaxed">
                {displayed.rustExplanation}
              </p>
            </div>

            {/* Classification detail — cols 7–12 */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-3"
              style={{
                gridColumn: "7 / 13",
                background: "rgba(255,255,255,0.05)",
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div>
                <p className="text-xs text-white/40 font-mono uppercase tracking-wider mb-1">
                  Classification
                </p>
                <p className="text-3xl font-bold text-white font-mono">
                  {displayed.classification}
                </p>
                <p className="text-xs mt-1" style={{ color }}>
                  {displayed.classificationLabel}
                </p>
              </div>
              <p className="text-sm text-white/75 leading-relaxed">
                {displayed.classificationExplanation}
              </p>
            </div>

            {/* DSS — full width */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-3"
              style={{
                gridColumn: "1 / -1",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <p className="text-xs text-white/40 font-mono uppercase tracking-wider">
                DECISION SUPPORT SYSTEM
              </p>
              <p className="text-sm text-white/80 leading-relaxed">
                {displayed.dss}
              </p>
            </div>

            {/* Return button */}
            <div
              style={{ gridColumn: "1 / -1" }}
              className="flex justify-center pt-2"
            >
              <button
                onClick={onClose}
                className="px-8 py-3 rounded-xl font-semibold text-white/60 hover:text-white transition-all text-sm border"
                style={{
                  borderColor: "rgba(255,255,255,0.15)",
                  background: "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.07)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                ← Return to Home
              </button>
            </div>
          </PageGrid>
        </section>
      </div>
    </div>
  )
}
