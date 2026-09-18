import { useEffect, useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import BoundingBoxImage from "@/components/BoundingBoxImage"
import { severityColor } from "@/utils/severity"
import type { ScanResult, View } from "@/types"

export default function HistoryDetailPage({
  username,
  scan,
  history,
  onBack,
  onNavigate,
  onDelete,
}: {
  username: string
  scan: ScanResult
  history: ScanResult[]
  onBack: () => void
  onNavigate: (v: View) => void
  onDelete: (scanId: string) => Promise<void>
  onEdit: (scanId: string, title: string) => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [displayed, setDisplayed] = useState<ScanResult>(scan)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(scan.title || scan.imageName)
  const [editPending, setEditPending] = useState(false)
  const safeHistory = history ?? []
  const color = severityColor(displayed.rustPercent)

  useEffect(() => {
    setDisplayed(scan)
    setDeleteError("")
    setTitleValue(scan.title || scan.imageName)
    setEditingTitle(false)
  }, [scan])

  const handleDelete = async () => {
    if (!window.confirm(`Delete the scan history for ${displayed.imageName}?`)) {
      return
    }

    setDeletePending(true)
    setDeleteError("")
    try {
      await onDelete(displayed.id)
    } catch (cause: unknown) {
      setDeleteError(
        cause instanceof Error ? cause.message : "Unable to delete this scan.",
      )
    } finally {
      setDeletePending(false)
    }
  }

  const handleEdit = async () => {
    const title = titleValue.trim()
    if (!title) {
      setDeleteError("A scan title is required.")
      return
    }
    setEditPending(true)
    setDeleteError("")
    try {
      await onEdit(displayed.id, title)
      setDisplayed((current) => ({ ...current, title }))
      setEditingTitle(false)
    } catch (cause: unknown) {
      setDeleteError(cause instanceof Error ? cause.message : "Unable to update the scan title.")
    } finally {
      setEditPending(false)
    }
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: "100vh", background: "var(--color-bg)" }}
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

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left filmstrip panel ──────────────────────────────────── */}
        <div
          className="flex flex-col flex-shrink-0 overflow-y-auto"
          style={{
            width: "150px",
            background: "var(--color-header)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="px-3 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <p className="text-xs text-white/40 font-mono uppercase tracking-wider">
              History
            </p>
            <p className="text-xs text-white/25 mt-0.5">
              {safeHistory.length} scans
            </p>
          </div>

          <div className="flex flex-col gap-1 p-1.5">
            {safeHistory.map((s, i) => {
              const sc = severityColor(s.rustPercent)
              const isActive = s.id === displayed.id
              return (
                <button
                  key={s.id}
                  onClick={() => setDisplayed(s)}
                  className="flex flex-col rounded-lg text-left transition-all flex-shrink-0 p-1.5"
                  style={{
                    outline: isActive
                      ? `2px solid ${sc}`
                      : "2px solid transparent",
                    outlineOffset: "1px",
                    background: isActive
                      ? "rgba(255,255,255,0.07)"
                      : "transparent",
                  }}
                >
                  {/* Landscape thumbnail */}
                  <div
                    className="relative w-full rounded-md overflow-hidden"
                    style={{ aspectRatio: "16/9" }}
                  >
                    <BoundingBoxImage
                      src={s.imageUrl}
                      alt={s.imageName}
                      coordinates={s.boxCoordinates}
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    {/* Slide number */}
                    <span className="absolute top-1.5 left-2 text-white/50 text-xs font-mono">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="absolute bottom-1.5 right-2 text-xs font-bold font-mono"
                      style={{ color: sc }}
                    >
                      {s.rustPercent}%
                    </span>
                  </div>
                  {/* Label */}
                  <div className="px-1.5 py-1">
                    <p
                      className="text-white/70 truncate leading-tight"
                      style={{ fontSize: "10px" }}
                    >
                      {s.imageName}
                    </p>
                    <p className="text-white/30" style={{ fontSize: "9px" }}>
                      {s.date}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right scrollable content ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Section 1: Overview */}
          <section
            className="py-10 px-8"
            style={{ background: "var(--color-bg)" }}
          >
            <div className="max-w-4xl mx-auto flex gap-6">
              {/* Image */}
              <div className="flex-1 min-w-0">
                <div
                  className="relative w-full rounded-2xl overflow-hidden"
                  style={{ background: "var(--color-card)" }}
                >
                  <BoundingBoxImage
                    src={displayed.imageUrl}
                    alt={displayed.imageName}
                    coordinates={displayed.boxCoordinates}
                    expandable
                    className="w-full"
                    imageClassName="aspect-[16/9] w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    {editingTitle ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={titleValue}
                          onChange={(event) => setTitleValue(event.target.value)}
                          maxLength={120}
                          autoFocus
                          className="rounded border bg-black/50 px-2 py-1 text-sm text-white outline-none"
                          style={{ borderColor: "rgba(255,255,255,0.3)" }}
                        />
                        <button onClick={() => void handleEdit()} disabled={editPending} className="text-xs text-green-200">Save</button>
                        <button onClick={() => setEditingTitle(false)} className="text-xs text-white/70">Cancel</button>
                      </div>
                    ) : (
                      <p className="text-white font-semibold text-sm">
                        {displayed.title || displayed.imageName}
                      </p>
                    )}
                    <p className="text-white/50 text-xs">{displayed.date}</p>
                    {!editingTitle && (
                      <button onClick={() => setEditingTitle(true)} className="mt-1 text-xs text-white/60 hover:text-white">
                        Edit title
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div
                className="flex flex-col gap-4"
                style={{ width: "200px", flexShrink: 0 }}
              >
                <div
                  className="flex-1 rounded-2xl p-5 flex flex-col gap-2"
                  style={{ background: "var(--color-card)" }}
                >
                  <p className="text-xs text-white/50 font-mono uppercase tracking-wider">
                    Corrosion %
                  </p>
                  <p
                    className="text-4xl font-bold leading-none"
                    style={{ color, fontFamily: "JetBrains Mono" }}
                  >
                    {displayed.rustPercent}
                    <span className="text-xl">%</span>
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium self-start"
                    style={{ background: color + "22", color }}
                  >
                    {displayed.classificationLabel}
                  </span>
                </div>

                <div
                  className="flex-1 rounded-2xl p-5 flex flex-col gap-2"
                  style={{ background: "var(--color-card)" }}
                >
                  <p className="text-xs text-white/50 font-mono uppercase tracking-wider">
                    Classification
                  </p>
                  <p
                    className="text-3xl font-bold text-white leading-none"
                    style={{ fontFamily: "JetBrains Mono" }}
                  >
                    {displayed.classification}
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium self-start"
                    style={{ background: color + "22", color }}
                  >
                    {displayed.classificationLabel}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Deep analysis */}
          <section
            className="py-10 px-8"
            style={{ background: "var(--color-header)" }}
          >
            <div className="max-w-4xl mx-auto flex flex-col gap-4">
              <div className="flex gap-4">
                {/* Corrosion detail */}
                <div
                  className="flex-1 rounded-2xl p-6 flex flex-col gap-3"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div>
                    <p className="text-xs text-white/40 font-mono uppercase tracking-wider mb-1">
                      Corrosion %
                    </p>
                    <p
                      className="text-3xl font-bold font-mono"
                      style={{ color }}
                    >
                      {displayed.rustPercent}%
                    </p>
                  </div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    {displayed.rustExplanation}
                  </p>
                </div>

                {/* Classification detail */}
                <div
                  className="flex-1 rounded-2xl p-6 flex flex-col gap-3"
                  style={{
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
              </div>

              {/* DSS */}
              <div
                className="rounded-2xl p-6 flex flex-col gap-3"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <p className="text-xs text-white/40 font-mono uppercase tracking-wider">
                  DECISION SUPPORT SYSTEM
                </p>
                <p className="text-sm text-white/80 leading-relaxed">
                  {displayed.dss}
                </p>
              </div>

              {/* Back button */}
              <div className="flex flex-col items-center gap-3 pt-2">
                {deleteError && (
                  <p className="text-sm text-red-300">{deleteError}</p>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deletePending}
                  className="px-8 py-3 rounded-xl font-semibold text-red-200 hover:text-white transition-all text-sm border disabled:opacity-50"
                  style={{
                    borderColor: "rgba(192,57,43,0.55)",
                    background: "rgba(192,57,43,0.12)",
                  }}
                >
                  {deletePending ? "Deleting..." : "Delete this history"}
                </button>
                <button
                  onClick={onBack}
                  className="px-8 py-3 rounded-xl font-semibold text-white/60 hover:text-white transition-all text-sm border"
                  style={{
                    borderColor: "rgba(255,255,255,0.15)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.07)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  ← Back to History
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
