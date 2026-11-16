import { useOptionalNav } from "@/components/NavContext"
import { ROLE_LABELS } from "@/utils/condition"

/**
 * The top bar. On narrow screens it carries the button that opens the navigation; on
 * wide screens the sidebar is always visible and the bar only shows who is signed in.
 */
export default function Header({
  username,
  onMenuToggle,
  menuOpen,
}: {
  username: string
  onMenuToggle: () => void
  menuOpen: boolean
}) {
  const nav = useOptionalNav()

  return (
    <header
      className="app-header sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-2.5"
      style={{ background: "var(--color-header)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white lg:hidden">RustScan</span>
      </div>
      <p className="text-sm text-white/60">
        <span className="font-medium text-white/90">{username}</span>
        {nav && <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">{ROLE_LABELS[nav.role]}</span>}
      </p>
    </header>
  )
}
