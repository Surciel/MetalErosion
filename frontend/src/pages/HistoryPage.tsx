import { useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import PageGrid from "@/components/PageGrid"
import { severityColor } from "@/data/mockData"
import type { ScanResult, View } from "@/types"

export default function HistoryPage({
  username,
  history,
  onSelect,
  onNavigate,
}: {
  username: string
  history: ScanResult[]
  onSelect: (s: ScanResult) => void
  onNavigate: (v: View) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

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

      <main className="flex-1 flex items-start py-12 px-4">
        <PageGrid>
          {/* cols 3–10: 8-column centered list */}
          <div className="flex flex-col gap-4" style={{ gridColumn: "3 / 11" }}>
            <div>
              <h1 className="text-xl font-bold text-white">Scan History</h1>
              <p className="text-xs text-white/40 mt-0.5">
                {history.length} previous scans
              </p>
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-3 py-24">
                <p className="text-white/30 text-4xl">📋</p>
                <p className="text-white/50 text-sm">
                  No scans yet. Upload your first rust image.
                </p>
                <button
                  onClick={() => onNavigate("home")}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white border transition-all"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  Go to Home
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((scan) => {
                  const color = severityColor(scan.rustPercent)
                  return (
                    <button
                      key={scan.id}
                      onClick={() => onSelect(scan)}
                      className="w-full flex gap-4 rounded-2xl overflow-hidden text-left transition-all hover:brightness-110 active:scale-[0.99]"
                      style={{ background: "var(--color-card)" }}
                    >
                      <div
                        className="w-28 h-20 flex-shrink-0 overflow-hidden"
                        style={{ background: "var(--color-btn)" }}
                      >
                        <img
                          src={scan.imageUrl}
                          alt={scan.imageName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 py-3 pr-5 flex flex-col justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white truncate">
                            {scan.imageName}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">
                            {scan.date}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className="text-sm font-bold font-mono"
                            style={{ color }}
                          >
                            {scan.rustPercent}%
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: color + "22", color }}
                          >
                            {scan.classification} · {scan.classificationLabel}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </PageGrid>
      </main>
    </div>
  )
}
