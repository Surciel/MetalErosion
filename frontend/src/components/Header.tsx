export default function Header({
  username,
  onMenuToggle,
  menuOpen,
}: {
  username: string
  onMenuToggle: () => void
  menuOpen: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3"
      style={{ background: "var(--color-header)" }}
    >
      <span className="font-semibold tracking-wide text-sm text-white/90">
        Welcome, <span className="text-white font-bold">{username}</span>
      </span>
      <button
        onClick={onMenuToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm font-mono font-medium"
        title="Menu"
      >
        <span
          className={`transition-transform duration-300 ${
            menuOpen ? "rotate-90" : ""
          }`}
        >
          &#x276F;&#x276F;&#x276F;
        </span>
      </button>
    </div>
  )
}
