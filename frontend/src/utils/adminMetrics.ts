import type { Account, AdminMetrics, MetricRange, ScanResult } from "@/types"

function startOfDay(date: Date): number {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result.getTime()
}

function countSince(scans: ScanResult[], timestamp: number): number {
  return scans.filter((scan) => {
    const createdAt = scan.createdAt ? Date.parse(scan.createdAt) : 0
    return createdAt >= timestamp
  }).length
}

export function getAdminMetrics(
  accounts: Account[],
  scans: ScanResult[],
  selectedRange: MetricRange,
  now = new Date(),
): AdminMetrics {
  const dayStart = startOfDay(now)
  const weekStart = dayStart - 6 * 24 * 60 * 60 * 1000
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const selectedStart =
    selectedRange === "day"
      ? dayStart
      : selectedRange === "week"
        ? weekStart
        : monthStart

  return {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter((account) => account.status === "active")
      .length,
    scansToday: countSince(scans, dayStart),
    scansThisWeek: countSince(scans, weekStart),
    scansThisMonth: countSince(scans, monthStart),
    selectedRange,
    selectedRangeScans: countSince(scans, selectedStart),
  }
}
