import { useMemo, useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import ChartCard from "@/components/charts/ChartCard"
import CountBarChart from "@/components/charts/CountBarChart"
import ScanDotsChart from "@/components/charts/ScanDotsChart"
import StatTile, { RangeFilter } from "@/components/charts/StatTile"
import { summarizeScans, toTable } from "@/utils/analytics"
import type { ScanResult, View } from "@/types"

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 0, label: "All time" },
] as const

type RangeDays = (typeof RANGES)[number]["value"]

const DAY_MS = 24 * 60 * 60 * 1000

/** Charts of the signed-in user's own scans. */
export default function AnalyticsPage({
  username,
  history,
  historyLoading,
  historyError,
  isAdmin = false,
  onNavigate,
}: {
  username: string
  history: ScanResult[]
  historyLoading: boolean
  historyError: string
  isAdmin?: boolean
  onNavigate: (view: View) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [rangeDays, setRangeDays] = useState<RangeDays>(0)

  const scans = useMemo(() => {
    if (rangeDays === 0) return history
    const since = Date.now() - rangeDays * DAY_MS
    return history.filter((scan) => scan.createdAt && Date.parse(scan.createdAt) >= since)
  }, [history, rangeDays])
  const summary = useMemo(() => summarizeScans(scans), [scans])
  const noScans = scans.length === 0
  const emptyText = noScans
    ? history.length === 0
      ? "No scans yet. Scan a metal surface to see it here."
      : "No scans in this period."
    : undefined

  const scanTable = {
    columns: ["Scan", "Date", "Rust", "Rating", "Priority"],
    rows: scans.map((scan) => [
      scan.title || scan.imageName,
      scan.date,
      `${scan.rustPercent}%`,
      scan.classification,
      scan.priorityLevel,
    ]),
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      <Header username={username} onMenuToggle={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} isAdmin={isAdmin} />

      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Analytics</p>
          <h1 className="text-2xl font-bold text-white">Your scan analytics</h1>
          <p className="text-sm text-white/50">
            Rust coverage, ASTM grades, rust distribution and maintenance priority across your scans.
          </p>
          {historyLoading && <p className="text-xs text-white/45">Loading your scans...</p>}
          {historyError && <p className="mt-2 text-sm text-red-300">{historyError}</p>}
        </div>

        <div className="mb-5">
          <RangeFilter label="Period" options={RANGES} value={rangeDays} onChange={setRangeDays} />
        </div>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Scans" value={String(summary.total)} detail="In the selected period" />
          <StatTile
            label="Average rust coverage"
            value={summary.averageRust === null ? "—" : `${summary.averageRust.toFixed(1)}%`}
            detail="Mean rust % of the metal surface"
          />
          <StatTile
            label="Critical scans"
            value={String(summary.critical)}
            detail="At or past 33% rust (ASTM grade 1 or 0)"
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Rust coverage per scan"
            subtitle="Each dot is one scan, placed by the date it was taken. Dots are not joined because the scans are of different objects."
            table={scanTable}
            empty={emptyText}
            className="lg:col-span-2"
          >
            <ScanDotsChart scans={scans} />
          </ChartCard>

          <ChartCard
            title="Scans by ASTM D610 grade"
            subtitle="Number of scans at each grade, from 10 (no rust) to 0 (over half rusted)."
            table={toTable("Grade", "Scans", summary.byGrade)}
            empty={emptyText}
          >
            <CountBarChart data={summary.byGrade} direction="columns" unit="scans" />
          </ChartCard>

          <ChartCard
            title="Scans by maintenance priority"
            subtitle="Priority from the predicted days until 33% rust."
            table={toTable("Priority", "Scans", summary.byPriority)}
            empty={emptyText}
          >
            <CountBarChart data={summary.byPriority} direction="bars" unit="scans" />
          </ChartCard>

          <ChartCard
            title="Scans by rust distribution"
            subtitle="How the rust was spread on each scanned surface."
            table={toTable("Distribution", "Scans", summary.byDistribution)}
            empty={emptyText}
            className="lg:col-span-2"
          >
            <CountBarChart data={summary.byDistribution} direction="bars" unit="scans" />
          </ChartCard>
        </div>
      </main>
    </div>
  )
}
