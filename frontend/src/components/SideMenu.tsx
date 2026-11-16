import type { ReactNode } from "react"
import { useOptionalNav } from "@/components/NavContext"
import { ROLE_LABELS } from "@/utils/condition"
import type { View } from "@/types"

type Item = { label: string; view: View; icon: ReactNode; activeOn: View[] }

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

const ITEMS: Item[] = [
  {
    label: "Dashboard",
    view: "dashboard",
    activeOn: ["dashboard"],
    icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  },
  {
    label: "Sites and assets",
    view: "sites",
    activeOn: ["sites", "site", "asset", "report-site"],
    icon: icon(<><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>),
  },
  {
    label: "New scan",
    view: "home",
    activeOn: ["home", "calculating", "results", "rust-info", "classification-info"],
    icon: icon(<><path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M8 12h8" /></>),
  },
  {
    label: "My scans",
    view: "history",
    activeOn: ["history", "history-detail", "report-scan"],
    icon: icon(<><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></>),
  },
  {
    label: "Scan statistics",
    view: "analytics",
    activeOn: ["analytics"],
    icon: icon(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>),
  },
]

const ADMIN_ITEM: Item = {
  label: "Admin",
  view: "admin",
  activeOn: ["admin"],
  icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
}

/**
 * The app's navigation. On wide screens it is a sidebar that is always visible; on
 * narrow screens it slides in when `open` is set by the header's menu button.
 */
export default function SideMenu({
  open,
  onClose,
  onNavigate,
  isAdmin = false,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (v: View) => void
  isAdmin?: boolean
  /** Kept for older callers; admins now see every section. */
  adminOnly?: boolean
  onLogout?: () => void
}) {
  const nav = useOptionalNav()
  const currentView = nav?.view
  const admin = nav ? nav.role === "admin" : isAdmin
  const items = admin ? [...ITEMS, ADMIN_ITEM] : ITEMS
  const go = (view: View) => {
    if (nav) nav.navigate(view)
    else onNavigate(view)
    onClose()
  }
  const logout = () => {
    if (nav) nav.logout()
    else if (onLogout) onLogout()
    else onNavigate("landing")
    onClose()
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`app-sidebar fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r px-3 pb-4 pt-5 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--color-header)", borderColor: "rgba(255,255,255,0.08)" }}
        aria-label="Main navigation"
      >
        <div className="mb-6 flex items-center gap-2.5 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: "var(--color-accent)" }}>
            R
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">RustScan</p>
            <p className="text-[11px] leading-tight text-white/45">Steel inspection</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active = currentView ? item.activeOn.includes(currentView) : false
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => go(item.view)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6 hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {nav && (
            <div className="mb-2 px-3">
              <p className="truncate text-sm font-medium text-white">{nav.username}</p>
              <p className="text-[11px] text-white/45">{ROLE_LABELS[nav.role]}</p>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-300 transition-colors hover:bg-red-900/20 hover:text-red-200"
          >
            {icon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>)}
            Log out
          </button>
        </div>
      </aside>
    </>
  )
}
