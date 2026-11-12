import type { View } from "@/types"

export default function SideMenu({
  open,
  onClose,
  onNavigate,
  isAdmin = false,
  adminOnly = false,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (v: View) => void
  isAdmin?: boolean
  adminOnly?: boolean
  onLogout?: () => void
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-10" onClick={onClose} />}
      <div
        className="fixed right-0 top-0 h-full w-56 z-20 flex flex-col pt-16 pb-8 px-6 transition-transform duration-300"
        style={{
          background: "var(--color-header)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          boxShadow: open ? "-4px 0 24px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <nav className="flex flex-col gap-2 mt-4">
          {(adminOnly
            ? [{ label: "Admin", view: "admin" as View }]
            : [
                { label: "Home", view: "home" as View },
                { label: "History", view: "history" as View },
                { label: "Analytics", view: "analytics" as View },
                ...(isAdmin ? [{ label: "Admin", view: "admin" as View }] : []),
              ]
          ).map((item) => (
            <button
              key={item.view}
              onClick={() => {
                onNavigate(item.view)
                onClose()
              }}
              className="text-left px-4 py-3 rounded text-white/80 hover:text-white hover:bg-white/10 transition-all font-medium text-sm"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <button
            onClick={() => {
              if (onLogout) onLogout()
              else onNavigate("landing")
              onClose()
            }}
            className="w-full text-left px-4 py-3 rounded text-red-300 hover:text-red-200 hover:bg-red-900/20 transition-all font-medium text-sm"
          >
            Logout
          </button>
        </div>
      </div>
    </>
  )
}
