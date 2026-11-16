import type { ReactNode } from "react"

/**
 * Line icons for the maintenance steps (the `icon` of each step card from
 * backend/decision_support.py). Drawn on a 24 x 24 grid with the current text colour.
 */
const PATHS: Record<string, ReactNode> = {
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  drop: <path d="M12 2.7s6 6.4 6 11.3a6 6 0 0 1-12 0c0-4.9 6-11.3 6-11.3z" />,
  spray: (
    <>
      <path d="M9 8h5v3l3 3v7a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-7l2-3z" />
      <path d="M10 8V5h4l2 1.5" />
      <path d="M19 4h.01M21 6.5h.01M21 2h.01" />
    </>
  ),
  brush: (
    <>
      <rect x="3" y="9" width="13" height="5" rx="1" />
      <path d="M5 14v5M8 14v5M11 14v5M14 14v5" />
      <path d="M16 11.5h5" />
    </>
  ),
  grinder: (
    <>
      <circle cx="8" cy="15" r="5" />
      <circle cx="8" cy="15" r="1" />
      <path d="M11.5 11.5 18 5l2.5 2.5L14 14" />
    </>
  ),
  paint: (
    <>
      <rect x="3" y="3" width="14" height="6" rx="1.5" />
      <path d="M17 6h3v5h-8v3" />
      <rect x="10.5" y="14" width="3" height="7" rx="1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
      <path d="M7 15h10" />
    </>
  ),
  blast: (
    <>
      <path d="M2 9h8l3 2v2l-3 2H2z" />
      <path d="M16 9.5 19.5 7M16 12h5M16 14.5l3.5 2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  stop: (
    <>
      <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" />
      <path d="M8 12h8" />
    </>
  ),
  ruler: (
    <>
      <rect x="2" y="8" width="20" height="8" rx="1" />
      <path d="M6 8v3M10 8v4M14 8v3M18 8v4" />
    </>
  ),
  wrench: <path d="M15 3a5 5 0 0 0-4.7 6.7L3 17l3 3 7.3-7.3A5 5 0 0 0 20 8l-3 3-3-3 3-3a5 5 0 0 0-2-2z" />,
  shield: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
}

export default function StepIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  )
}
