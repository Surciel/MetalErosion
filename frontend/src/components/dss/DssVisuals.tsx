import { useState } from "react"
import StepIcon from "@/components/dss/StepIcon"
import { STATUS } from "@/components/charts/chartTheme"
import { ACTION_LEVELS, formatRate, levelColor, levelInfo } from "@/utils/condition"
import { DISTRIBUTION_TYPES, describeDuration } from "@/utils/classificationInfo"
import type { DecisionSupport, ScanResult, StepCard } from "@/types"

/**
 * The decision support answer as pictures: a verdict, the action-level ladder, a timeline
 * and step cards. Every number shown here comes from the backend answer or the scan; these
 * components only lay it out. `tone` "light" is for the printed report.
 */
export type Tone = "dark" | "light"

const INK = {
  dark: {
    strong: "#ffffff",
    body: "rgba(255,255,255,0.85)",
    muted: "rgba(255,255,255,0.55)",
    faint: "rgba(255,255,255,0.10)",
    line: "rgba(255,255,255,0.25)",
    card: "rgba(255,255,255,0.06)",
    cardActive: "rgba(255,255,255,0.14)",
  },
  light: {
    strong: "#111111",
    body: "#333333",
    muted: "#666666",
    faint: "#e7e5e4",
    line: "#a8a29e",
    card: "#f5f5f4",
    cardActive: "#e7e5e4",
  },
} as const

/** Rust % at which the answer moves to the next level, and that level. */
function nextStep(level: number): { at: number; level: number } | null {
  if (level === 1) return { at: 0.03, level: 2 }
  if (level === 2) return { at: 1, level: 3 }
  if (level === 3 || level === 4) return { at: 10, level: 5 }
  if (level === 5) return { at: 33, level: 6 }
  return null
}

/** A time span for a timeline label: "12 days", "4 mo", "5 yr", "10+ yr". */
function shortSpan(days: number): string {
  if (days <= 0) return "Now"
  if (days > 3650) return "10+ yr"
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`
  if (days < 730) return `${Math.round(days / 30.4)} mo`
  return `${Math.round(days / 365)} yr`
}

function SectionLabel({ children, tone }: { children: string; tone: Tone }) {
  return (
    <p className="mb-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: INK[tone].muted }}>
      {children}
    </p>
  )
}

/** The timing tile beside the verdict: what to watch and how long there is. */
function timing(answer: DecisionSupport): { label: string; value: string; urgent: boolean } {
  if (answer.level === 6) return { label: "Act", value: "Now", urgent: true }
  if (answer.actWithinDays === 0) return { label: "Act", value: "Now", urgent: true }
  if (answer.level >= 2 && answer.actWithinDays !== null) {
    if (answer.actWithinDays > 3650) return { label: "Not urgent", value: "10+ years", urgent: false }
    return { label: "Act within", value: describeDuration(answer.actWithinDays, false), urgent: true }
  }
  if (answer.rescanInDays !== null) {
    return { label: "Inspect again in", value: describeDuration(answer.rescanInDays, false), urgent: false }
  }
  return { label: "Growth", value: "None measured", urgent: false }
}

/** The answer in one line, with its level badge and the time available. */
export function Verdict({ answer, tone = "dark" }: { answer: DecisionSupport; tone?: Tone }) {
  const ink = INK[tone]
  const color = levelColor(answer.level)
  const when = timing(answer)
  return (
    <div className="flex flex-wrap items-stretch justify-between gap-4">
      <div className="min-w-0 flex-1">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
          style={{ background: `${color}${tone === "light" ? "33" : "26"}`, color: tone === "light" ? ink.strong : color, border: `1px solid ${color}` }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
          Level {answer.level} · {answer.strategy}
        </span>
        <p className="mt-2 text-2xl font-semibold leading-tight" style={{ color: ink.strong }}>
          {answer.action}
        </p>
      </div>
      <div
        className="flex min-w-[132px] flex-col justify-center rounded-xl px-4 py-3 text-center"
        style={{ background: when.urgent ? `${color}${tone === "light" ? "26" : "1f"}` : ink.card, border: `1px solid ${when.urgent ? color : ink.faint}` }}
      >
        <p className="text-[11px] uppercase tracking-wider" style={{ color: ink.muted }}>{when.label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: ink.strong }}>{when.value}</p>
      </div>
    </div>
  )
}

/** The six action levels in a row, with this scan's level marked and the next threshold named. */
export function ActionLadder({ level, rustPercent, tone = "dark" }: { level: number; rustPercent: number; tone?: Tone }) {
  const ink = INK[tone]
  const next = nextStep(level)
  return (
    <div role="img" aria-label={`Action level ${level} of 6, at ${rustPercent}% rust`}>
      <div className="flex gap-1">
        {ACTION_LEVELS.map((item) => {
          const current = item.level === level
          const color = STATUS[item.band]
          return (
            <div key={item.level} className="min-w-0 flex-1 text-center">
              <p className="h-4 text-[11px] font-bold leading-4" style={{ color: ink.strong }}>
                {current ? `${rustPercent}%` : ""}
              </p>
              <div
                className="relative h-3 rounded-sm"
                style={{ background: color, opacity: current ? 1 : 0.28, outline: current ? `2px solid ${ink.strong}` : undefined, outlineOffset: 1 }}
              />
              <p className="mt-1.5 text-[11px] font-semibold" style={{ color: current ? ink.strong : ink.muted }}>L{item.level}</p>
              <p className="text-[10px] leading-tight" style={{ color: current ? ink.body : ink.muted }}>{item.short}</p>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs" style={{ color: ink.body }}>
        {next
          ? <>Next level at <span className="font-semibold" style={{ color: ink.strong }}>{next.at}%</span>: {levelInfo(next.level).strategy.toLowerCase()}.</>
          : "Highest level: the element needs a structural assessment."}
      </p>
    </div>
  )
}

type Stop = { days: number; label: string; color: string }

/** What happens when, from today: inspect again, act-by, critical. Evenly spaced, not to scale. */
export function ActionTimeline({ scan, answer, tone = "dark" }: { scan: ScanResult; answer: DecisionSupport; tone?: Tone }) {
  const ink = INK[tone]
  if (answer.level === 6) {
    return (
      <p className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: `${STATUS.critical}22`, color: ink.strong, border: `1px solid ${STATUS.critical}` }}>
        No timeline: restrict use and assess the element now.
      </p>
    )
  }
  const next = nextStep(answer.level)
  const stops: Stop[] = []
  if (answer.rescanInDays !== null) stops.push({ days: answer.rescanInDays, label: "Inspect again", color: ink.line })
  if (answer.level >= 2 && answer.actWithinDays !== null && answer.actWithinDays > 0 && next) {
    stops.push({
      days: answer.actWithinDays,
      label: next.level === 6 ? "Critical (33%)" : `Act by: reaches ${next.at}%`,
      color: next.level === 6 ? STATUS.critical : levelColor(next.level),
    })
  }
  if (answer.level < 5 && scan.daysToCritical !== null && scan.daysToCritical > 0) {
    stops.push({ days: scan.daysToCritical, label: "Critical (33%)", color: STATUS.critical })
  }
  stops.sort((left, right) => left.days - right.days)
  if (stops.length === 0) {
    return <p className="text-sm" style={{ color: ink.body }}>No growth measured, so there is no date to plan to. Inspect again as scheduled.</p>
  }
  const all: (Stop & { when: string })[] = [
    { days: 0, label: `Today: ${scan.rustPercent}%`, color: levelColor(answer.level), when: "Now" },
    ...stops.map((stop) => ({ ...stop, when: shortSpan(stop.days) })),
  ]
  const edge = 50 / all.length
  return (
    <div>
      <div className="relative">
        <div className="absolute top-[30px] h-0.5" style={{ left: `${edge}%`, right: `${edge}%`, background: ink.line }} aria-hidden="true" />
        <ol className="relative flex">
          {all.map((stop, index) => (
            <li key={`${stop.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <span className="h-5 text-sm font-bold leading-5" style={{ color: ink.strong }}>{stop.when}</span>
              <span className="mt-1 h-3.5 w-3.5 rounded-full" style={{ background: stop.color, boxShadow: `0 0 0 3px ${tone === "light" ? "#ffffff" : "#2b3622"}` }} />
              <span className="mt-1.5 px-1 text-[11px] leading-tight" style={{ color: ink.body }}>{stop.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-[11px]" style={{ color: ink.muted }}>
        Spacing is not to scale.{scan.regressionSlope !== null ? ` Rate ${formatRate(scan.regressionSlope)}, assumed for ${scan.environment ? `exposure ${scan.environment}` : "this scan"}.` : ""}
      </p>
    </div>
  )
}

/** The maintenance steps as numbered cards. On screen a card can be opened for its full sentence. */
export function StepCards({ cards, tone = "dark", interactive = true }: { cards: StepCard[]; tone?: Tone; interactive?: boolean }) {
  const ink = INK[tone]
  const [open, setOpen] = useState<number | null>(null)
  const selected = open !== null ? cards[open] : null
  return (
    <div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))" }}>
        {cards.map((card, index) => {
          const active = open === index
          const body = (
            <>
              <span className="flex items-center justify-between">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ background: tone === "light" ? "#ffffff" : "rgba(255,255,255,0.08)", color: ink.strong, border: `1px solid ${ink.faint}` }}
                >
                  <StepIcon name={card.icon} />
                </span>
                <span className="font-mono text-xs font-semibold" style={{ color: ink.muted }}>{index + 1}</span>
              </span>
              <span className="mt-2 block text-sm font-semibold leading-snug" style={{ color: ink.strong }}>{card.title}</span>
              {card.standard && (
                <span className="mt-1 inline-block rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: ink.faint, color: ink.body }}>
                  {card.standard}
                </span>
              )}
            </>
          )
          return (
            <li key={`${card.title}-${index}`} className="flex">
              {interactive ? (
                <button
                  type="button"
                  onClick={() => setOpen(active ? null : index)}
                  aria-expanded={active}
                  className="flex w-full flex-col items-stretch justify-start rounded-xl p-3 text-left transition-colors"
                  style={{ background: active ? ink.cardActive : ink.card, border: `1px solid ${active ? ink.line : "transparent"}` }}
                >
                  {body}
                </button>
              ) : (
                <div className="flex w-full flex-col rounded-xl p-3" style={{ background: ink.card, border: `1px solid ${ink.faint}` }}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
      {interactive && (
        <p className="mt-2 min-h-[1.25rem] text-xs leading-relaxed" style={{ color: selected ? ink.body : ink.muted }} aria-live="polite">
          {selected ? <><span className="font-semibold" style={{ color: ink.strong }}>Step {open! + 1}. </span>{selected.detail}</> : "Tap a step for the full instruction."}
        </p>
      )}
    </div>
  )
}

/** The facts the answer rests on, as short chips. */
export function FactChips({ scan, environmentName, tone = "dark" }: { scan: ScanResult; environmentName?: string; tone?: Tone }) {
  const ink = INK[tone]
  const facts: [string, string][] = [
    ["Rust", `${scan.rustPercent}% · ASTM ${scan.astmRating}`],
  ]
  if (scan.distributionType) facts.push(["Pattern", DISTRIBUTION_TYPES[scan.distributionType].name])
  if (scan.environment) facts.push(["Exposure", `${scan.environment}${environmentName ? ` · ${environmentName}` : ""}`])
  if (scan.elementType) facts.push(["Element", scan.elementType])
  return (
    <ul className="flex flex-wrap gap-2">
      {facts.map(([label, value]) => (
        <li key={label} className="rounded-full px-3 py-1 text-xs" style={{ background: ink.card, border: `1px solid ${ink.faint}` }}>
          <span style={{ color: ink.muted }}>{label} </span>
          <span className="font-semibold" style={{ color: ink.strong }}>{value}</span>
        </li>
      ))}
    </ul>
  )
}

export { SectionLabel }
