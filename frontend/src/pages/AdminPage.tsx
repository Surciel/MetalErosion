import { useEffect, useMemo, useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import type {
  Account,
  AdminMetrics,
  MetricRange,
  RecoveryRequest,
  View,
} from "@/types"

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: Account["status"] }) {
  const active = status === "active"
  return (
    <span
      className="px-2 py-1 rounded-full text-[11px] font-medium"
      style={{
        color: active ? "#8bd49a" : "#e7b27f",
        background: active ? "rgba(39,174,96,0.14)" : "rgba(230,126,34,0.14)",
      }}
    >
      {active ? "Active" : "Deactivated"}
    </span>
  )
}

export default function AdminPage({
  username,
  accounts,
  metrics,
  recoveryRequests,
  loading,
  error,
  onNavigate,
  onLogout,
  onRangeChange,
  onUpdateAccount,
  onHandleRecovery,
}: {
  username: string
  accounts: Account[]
  metrics: AdminMetrics
  recoveryRequests: RecoveryRequest[]
  loading: boolean
  error: string
  onNavigate: (view: View) => void
  onLogout: () => void
  onRangeChange: (range: MetricRange) => void
  onUpdateAccount: (
    accountId: string,
    changes: Pick<Account, "username" | "email" | "role">,
  ) => void
  onHandleRecovery: (requestId: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [range, setRange] = useState<MetricRange>(metrics.selectedRange)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [draft, setDraft] = useState({ username: "", email: "", role: "user" as Account["role"] })
  const [accountQuery, setAccountQuery] = useState("")
  const [accountRole, setAccountRole] = useState<"all" | Account["role"]>("all")
  const [accountStatus, setAccountStatus] = useState<"all" | Account["status"]>("all")

  useEffect(() => {
    setRange(metrics.selectedRange)
  }, [metrics.selectedRange])

  const pendingRequests = useMemo(
    () => recoveryRequests.filter((request) => request.status === "pending"),
    [recoveryRequests],
  )

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = accountQuery.trim().toLowerCase()
    return accounts.filter((account) => {
      const matchesQuery =
        !normalizedQuery ||
        account.username.toLowerCase().includes(normalizedQuery) ||
        account.email.toLowerCase().includes(normalizedQuery)
      const matchesRole = accountRole === "all" || account.role === accountRole
      const matchesStatus = accountStatus === "all" || account.status === accountStatus
      return matchesQuery && matchesRole && matchesStatus
    })
  }, [accountQuery, accountRole, accountStatus, accounts])

  const beginEdit = (account: Account) => {
    setEditingAccount(account)
    setDraft({ username: account.username, email: account.email, role: account.role })
  }

  const saveEdit = () => {
    if (!editingAccount || !draft.username.trim() || !draft.email.trim()) return
    onUpdateAccount(editingAccount.id, {
      username: draft.username.trim(),
      email: draft.email.trim(),
      role: draft.role,
    })
    setEditingAccount(null)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      <Header
        username={username}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        menuOpen={menuOpen}
      />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={onNavigate}
        isAdmin
        adminOnly
        onLogout={onLogout}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8 md:px-8">
        <div className="flex flex-col gap-1 mb-7">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Administration</p>
          <h1 className="text-2xl font-bold text-white">Operations overview</h1>
          <p className="text-sm text-white/50">Manage accounts, monitor scan activity, and respond to recovery requests.</p>
          {loading && <p className="text-xs text-white/45">Refreshing administrative data...</p>}
          {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
          <MetricCard label="Total accounts" value={metrics.totalAccounts} detail={`${metrics.activeAccounts} active`} />
          <MetricCard label="Scans today" value={metrics.scansToday} detail="Since midnight" />
          <MetricCard label="Scans this week" value={metrics.scansThisWeek} detail="Last 7 days" />
          <MetricCard label="Scans this month" value={metrics.scansThisMonth} detail="Current month" />
        </section>

        <section className="grid lg:grid-cols-[1.35fr_0.85fr] gap-5 mb-5">
          <div className="rounded-2xl p-5" style={{ background: "var(--color-card)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-white">Scan activity</h2>
                <p className="text-xs text-white/40 mt-1">Choose a period to inspect the current workload.</p>
              </div>
              <div className="flex rounded-lg p-1 gap-1" style={{ background: "var(--color-btn)" }}>
                {(["day", "week", "month"] as MetricRange[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setRange(option)
                      onRangeChange(option)
                    }}
                    className="px-3 py-1.5 rounded-md text-xs capitalize transition-colors"
                    style={{
                      background: range === option ? "var(--color-accent)" : "transparent",
                      color: range === option ? "white" : "rgba(255,255,255,0.55)",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-5 h-36">
              {[{ label: "Today", value: metrics.scansToday, color: "#c0392b" }, { label: "Week", value: metrics.scansThisWeek, color: "#e67e22" }, { label: "Month", value: metrics.scansThisMonth, color: "#8fa87a" }].map((item) => (
                <div key={item.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="font-mono text-sm text-white">{item.value}</span>
                  <div className="w-full max-w-20 rounded-t-md transition-all" style={{ height: `${Math.max(item.value * 24, 8)}px`, background: item.color }} />
                  <span className="text-xs text-white/45">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-white/45">Selected period</span>
              <span className="text-sm font-semibold text-white capitalize">{range}: {range === metrics.selectedRange ? metrics.selectedRangeScans : "Update selection"} scans</span>
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "var(--color-card)" }}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-white">Recovery requests</h2>
                <p className="text-xs text-white/40 mt-1">Requests waiting for admin attention.</p>
              </div>
              <span className="min-w-7 h-7 px-2 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: pendingRequests.length ? "var(--color-accent)" : "var(--color-btn)" }}>{pendingRequests.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-white/40 py-5">No pending recovery requests.</p>
              ) : pendingRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/10 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{request.username}</p>
                    <p className="text-xs text-white/40 truncate">{request.email}</p>
                    <p className="text-[11px] text-white/30 mt-1">Requested {formatDate(request.requestedAt)}</p>
                  </div>
                  <button onClick={() => onHandleRecovery(request.id)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-colors" style={{ background: "var(--color-btn)" }}>Mark handled</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl overflow-hidden" style={{ background: "var(--color-card)" }}>
          <div className="px-5 py-4 border-b border-white/10">
            <div>
              <h2 className="text-base font-semibold text-white">Account management</h2>
              <p className="text-xs text-white/40 mt-1">Review access and maintain workspace account details.</p>
            </div>
            <div className="grid sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 mt-4">
              <label className="sr-only" htmlFor="account-search">Search accounts</label>
              <input
                id="account-search"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder="Search by name or email"
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-white/35 outline-none border border-white/10"
                style={{ background: "var(--color-btn)" }}
              />
              <label className="sr-only" htmlFor="account-role-filter">Filter by role</label>
              <select
                id="account-role-filter"
                value={accountRole}
                onChange={(event) => setAccountRole(event.target.value as "all" | Account["role"])}
                className="px-3 py-2 rounded-lg text-sm text-white outline-none border border-white/10"
                style={{ background: "var(--color-btn)" }}
              >
                <option value="all">All roles</option>
                <option value="admin">Admins</option>
                <option value="user">Users</option>
              </select>
              <label className="sr-only" htmlFor="account-status-filter">Filter by status</label>
              <select
                id="account-status-filter"
                value={accountStatus}
                onChange={(event) => setAccountStatus(event.target.value as "all" | Account["status"])}
                className="px-3 py-2 rounded-lg text-sm text-white outline-none border border-white/10"
                style={{ background: "var(--color-btn)" }}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </div>
            <p className="text-xs text-white/35 mt-3">
              Showing {filteredAccounts.length} of {accounts.length} accounts
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[680px]">
              <thead className="text-[11px] uppercase tracking-wider text-white/35">
                <tr>
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-white/40">
                      {accounts.length === 0 ? "No accounts found." : "No accounts match the selected filters."}
                    </td>
                  </tr>
                ) : filteredAccounts.map((account) => (
                  <tr key={account.id} className="border-t border-white/10 text-sm">
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{account.username}</p>
                      <p className="text-xs text-white/40 mt-1">{account.email}</p>
                    </td>
                    <td className="px-5 py-4 text-white/65 capitalize">{account.role}</td>
                    <td className="px-5 py-4"><StatusBadge status={account.status} /></td>
                    <td className="px-5 py-4 text-white/45 text-xs">{formatDate(account.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => beginEdit(account)}
                          disabled={account.username === username}
                          className="px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                          style={{ background: "var(--color-btn)" }}
                          title={account.username === username ? "Your own admin access cannot be edited here" : "Edit account"}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {editingAccount && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--color-header)" }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div><h2 className="text-lg font-semibold text-white">Edit account</h2><p className="text-xs text-white/40 mt-1">Update account details and permissions.</p></div>
              <button onClick={() => setEditingAccount(null)} className="text-white/40 hover:text-white text-xl" aria-label="Close edit dialog">&times;</button>
            </div>
            <div className="flex flex-col gap-4">
              <label className="text-xs text-white/55">Username<input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg text-sm text-white outline-none border border-white/10" style={{ background: "var(--color-btn)" }} /></label>
              <label className="text-xs text-white/55">Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg text-sm text-white outline-none border border-white/10" style={{ background: "var(--color-btn)" }} /></label>
              <label className="text-xs text-white/55">Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Account["role"] })} className="mt-1 w-full px-3 py-2 rounded-lg text-sm text-white outline-none border border-white/10" style={{ background: "var(--color-btn)" }}><option value="user">User</option><option value="admin">Admin</option></select></label>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setEditingAccount(null)} className="px-4 py-2 rounded-lg text-sm text-white/55 hover:text-white">Cancel</button><button onClick={saveEdit} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-accent)" }}>Save changes</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--color-card)" }}><p className="text-xs text-white/45">{label}</p><p className="text-2xl font-bold text-white mt-2">{value}</p><p className="text-[11px] text-white/35 mt-1">{detail}</p></div>
}
