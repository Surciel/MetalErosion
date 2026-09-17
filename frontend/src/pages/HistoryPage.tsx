import { useMemo, useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import PageGrid from "@/components/PageGrid"
import { severityColor } from "@/utils/severity"
import type { ScanResult, View } from "@/types"

export default function HistoryPage({
  username,
  history,
  historyError,
  historyLoading,
  onSelect,
  onNavigate,
}: {
  username: string
  history: ScanResult[]
  historyError: string
  historyLoading: boolean
  onSelect: (s: ScanResult) => void
  onNavigate: (v: View) => void
  onDelete: (scanId: string) => Promise<void>
  onEdit: (scanId: string, title: string) => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"date" | "rust" | "grade">("date")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  const priorities = useMemo(
    () => Array.from(new Set(history.map((scan) => scan.classificationLabel))).sort(),
    [history],
  )

  const visibleHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return history
      .filter((scan) => {
        const searchable = [
          scan.title,
          scan.imageName,
          scan.date,
          scan.classification,
          scan.classificationLabel,
          scan.dss,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (priorityFilter === "all" || scan.classificationLabel === priorityFilter)
        )
      })
      .sort((left, right) => {
        const leftValue =
          sortBy === "date"
            ? Date.parse(left.createdAt ?? "") || 0
            : sortBy === "rust"
              ? left.rustPercent
              : left.astmGrade
        const rightValue =
          sortBy === "date"
            ? Date.parse(right.createdAt ?? "") || 0
            : sortBy === "rust"
              ? right.rustPercent
              : right.astmGrade
        return (leftValue - rightValue) * (sortDirection === "asc" ? 1 : -1)
      })
  }, [history, priorityFilter, query, sortBy, sortDirection])

  const displayTitle = (scan: ScanResult) => scan.title || scan.imageName

  const beginEdit = (scan: ScanResult) => {
    setActionError("")
    setEditingId(scan.id)
    setEditingTitle(displayTitle(scan))
  }

  const saveEdit = async (scan: ScanResult) => {
    const title = editingTitle.trim()
    if (!title) {
      setActionError("A scan title is required.")
      return
    }
    setPendingAction(scan.id)
    setActionError("")
    try {
      await onEdit(scan.id, title)
      setEditingId(null)
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update the scan title.")
    } finally {
      setPendingAction(null)
    }
  }

  const removeScan = async (scan: ScanResult) => {
    if (!window.confirm(`Delete the scan history for ${displayTitle(scan)}?`)) return
    setPendingAction(scan.id)
    setActionError("")
    try {
      await onDelete(scan.id)
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete this scan.")
    } finally {
      setPendingAction(null)
    }
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

      <main className="flex-1 flex items-start py-12 px-4">
        <PageGrid>
          {/* cols 3–10: 8-column centered list */}
          <div className="flex flex-col gap-4" style={{ gridColumn: "3 / 11" }}>
            <div>
              <h1 className="text-xl font-bold text-white">Scan History</h1>
              <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                <p className="text-xs text-white/40">
                  {visibleHistory.length} of {history.length} scans
                </p>
                <button
                  onClick={() => onNavigate("home")}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: "var(--color-btn)" }}
                >
                  + New scan
                </button>
              </div>
            </div>

            {!historyLoading && !historyError && history.length > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: "var(--color-card)" }}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search scans..."
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                  style={{ borderColor: "var(--color-border)" }}
                />
                <div className="flex flex-wrap gap-2">
                  <label className="history-select-wrap">
                    <span className="sr-only">Filter by severity</span>
                    <select
                      value={priorityFilter}
                      onChange={(event) => setPriorityFilter(event.target.value)}
                      className="history-select"
                    >
                      <option value="all">All severity levels</option>
                      {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                    <span className="history-select-chevron" aria-hidden="true" />
                  </label>
                  <label className="history-select-wrap">
                    <span className="sr-only">Sort scans by</span>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                      className="history-select"
                    >
                      <option value="date">Sort by date</option>
                      <option value="rust">Sort by corrosion %</option>
                      <option value="grade">Sort by ASTM grade</option>
                    </select>
                    <span className="history-select-chevron" aria-hidden="true" />
                  </label>
                  <button
                    onClick={() => setSortDirection((direction) => direction === "desc" ? "asc" : "desc")}
                    className="rounded-lg border px-3 py-2 text-xs text-white/70 hover:text-white"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {sortDirection === "desc" ? "Descending" : "Ascending"}
                  </button>
                  {(query || priorityFilter !== "all") && (
                    <button
                      onClick={() => { setQuery(""); setPriorityFilter("all") }}
                      className="px-3 py-2 text-xs text-white/50 hover:text-white"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            )}

            {actionError && <p className="text-sm text-red-300">{actionError}</p>}

            {historyLoading ? (
              <div className="py-24 text-center text-sm text-white/50">
                Loading scan history...
              </div>
            ) : historyError ? (
              <div className="py-24 text-center text-sm text-red-300">
                {historyError}
              </div>
            ) : history.length === 0 ? (
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
            ) : visibleHistory.length === 0 ? (
              <div className="py-24 text-center text-sm text-white/50">
                No scans match the current filters.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleHistory.map((scan) => {
                  const color = severityColor(scan.rustPercent)
                  return (
                    <div
                      key={scan.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(scan)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          onSelect(scan)
                        }
                      }}
                      className="w-full flex gap-4 rounded-2xl overflow-hidden text-left transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/40"
                      style={{ background: "var(--color-card)" }}
                    >
                      <div
                        className="w-28 min-h-20 self-stretch flex-shrink-0 overflow-hidden"
                        style={{ background: "var(--color-btn)" }}
                      >
                        <img
                          src={scan.imageUrl}
                          alt={scan.imageName}
                          className="w-full h-full min-h-20 object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 py-3 pr-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {editingId === scan.id ? (
                              <input
                                value={editingTitle}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => { if (event.key === "Enter") void saveEdit(scan) }}
                                maxLength={120}
                                autoFocus
                                className="w-full rounded border bg-transparent px-2 py-1 text-sm text-white outline-none"
                                style={{ borderColor: "var(--color-border)" }}
                              />
                            ) : displayTitle(scan)}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">
                            {scan.date}
                          </p>
                          <div className="mt-2 flex gap-2">
                            {editingId === scan.id ? (
                              <>
                                <button onClick={(event) => { event.stopPropagation(); void saveEdit(scan) }} disabled={pendingAction === scan.id} className="text-xs text-green-300 hover:text-green-200">Save</button>
                                <button onClick={(event) => { event.stopPropagation(); setEditingId(null) }} className="text-xs text-white/50 hover:text-white">Cancel</button>
                              </>
                            ) : (
                              <button onClick={(event) => { event.stopPropagation(); beginEdit(scan) }} className="text-xs text-white/50 hover:text-white">Edit title</button>
                            )}
                            <button onClick={(event) => { event.stopPropagation(); void removeScan(scan) }} disabled={pendingAction === scan.id} className="text-xs text-red-300 hover:text-red-200">Delete</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-3 sm:w-[230px] sm:flex-shrink-0 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                          <div className="min-w-[62px]">
                            <p className="h-4 text-[10px] leading-4 uppercase tracking-wider text-white/35">Corrosion</p>
                            <p className="h-5 text-base leading-5 font-bold font-mono" style={{ color }}>
                              {scan.rustPercent}%
                            </p>
                          </div>
                          <div className="min-w-[62px]">
                            <p className="h-4 text-[10px] leading-4 uppercase tracking-wider text-white/35">ASTM grade</p>
                            <p className="h-5 text-base leading-5 font-semibold text-white">
                              {scan.astmGrade}
                            </p>
                          </div>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: color + "22", color }}
                          >
                            {scan.classificationLabel}
                          </span>
                        </div>
                      </div>
                    </div>
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
