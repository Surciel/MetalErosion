import { useEffect, useId, useRef, useState, type ReactNode } from "react"

type InfoTooltipProps = {
  /** Accessible name of the trigger, e.g. "About ASTM grade". */
  label: string
  children: ReactNode
  /** Which side of the trigger the panel aligns to. */
  align?: "left" | "right"
}

/**
 * Small ⓘ trigger that explains a value. Opens on hover and keyboard focus, and
 * toggles on tap/click so it also works on touch screens. Escape closes it.
 */
export default function InfoTooltip({ label, children, align = "left" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const panelId = useId()
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!pinned) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setPinned(false)
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [pinned])

  const visible = open || pinned

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex align-middle normal-case tracking-normal"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={visible ? panelId : undefined}
        aria-expanded={visible}
        onClick={(event) => {
          event.stopPropagation()
          setPinned((current) => !current)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinned(false)
            setOpen(false)
          }
        }}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/30 text-[10px] font-semibold leading-none text-white/60 transition-colors hover:border-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        i
      </button>
      {visible && (
        <span
          id={panelId}
          role="tooltip"
          className={`absolute top-6 z-40 w-64 max-w-[80vw] rounded-lg border border-white/15 bg-[#1b1714] p-3 text-left font-sans text-xs font-normal leading-5 text-white/85 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children}
        </span>
      )}
    </span>
  )
}
