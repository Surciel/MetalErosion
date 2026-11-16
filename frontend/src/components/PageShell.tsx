import { useState, type ReactNode } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import { useNav } from "@/components/NavContext"

export type Crumb = { label: string; onClick?: () => void }

/**
 * Frame shared by the inventory pages: navigation, a breadcrumb trail, the page title
 * with its actions, then the content.
 */
export default function PageShell({
  title,
  subtitle,
  crumbs = [],
  actions,
  badge,
  children,
}: {
  title: string
  subtitle?: ReactNode
  crumbs?: Crumb[]
  actions?: ReactNode
  badge?: ReactNode
  children: ReactNode
}) {
  const nav = useNav()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      <Header username={nav.username} onMenuToggle={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={nav.navigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-white/50">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">/</span>}
                {crumb.onClick ? (
                  <button type="button" onClick={crumb.onClick} className="rounded underline decoration-white/25 underline-offset-2 hover:text-white">
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-white/75">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold text-white">{title}</h1>
              {badge}
            </div>
            {subtitle && <p className="mt-1 text-sm leading-relaxed text-white/60">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  )
}

/** The two button weights used across the inventory pages. */
export function ActionButton({
  children,
  onClick,
  primary = false,
  danger = false,
  disabled = false,
  type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-10 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "text-white hover:brightness-110"
          : danger
            ? "border border-red-300/30 text-red-200 hover:bg-red-900/20"
            : "border text-white/80 hover:text-white"
      }`}
      style={primary ? { background: "var(--color-accent)" } : danger ? undefined : { borderColor: "var(--color-border)" }}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--color-card)" }}>
      {children}
    </section>
  )
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
        tone === "error" ? "border-red-300/40 bg-red-500/10 text-red-100" : "border-white/15 bg-white/5 text-white/75"
      }`}
    >
      {children}
    </div>
  )
}

/** Shown where a list would be, when there is nothing in it yet: says what to do next. */
export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-12 text-center" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/60">{text}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
