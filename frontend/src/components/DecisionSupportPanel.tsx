import { DssTooltip } from "@/components/ClassificationTooltips"
import type { ScanResult } from "@/types"

/** A day count in the words people plan with (mirrors backend/decision_support.py). */
function describeDays(days: number): string {
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`
  if (days < 730) return `${Math.round(days / 30.4)} months`
  return `${(days / 365).toFixed(1)} years`
}

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 text-xs"
      style={{ borderColor: color ?? "rgba(255,255,255,0.2)" }}
    >
      <span className="text-white/50">{label}</span>
      <span className="font-semibold text-white" style={color ? { color } : undefined}>
        {value}
      </span>
    </span>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-white/40">{children}</p>
  )
}

/**
 * The Decision Support System answer for a scan: what to do, how, by when, why, what
 * happens if it is left, how far the result can be trusted, and the sources of the rules.
 * Falls back to the one-line recommendation when the backend sent no structured answer.
 */
export default function DecisionSupportPanel({
  scan,
  color,
}: {
  scan: ScanResult
  /** Severity colour of the scan, used for the headline accent. */
  color: string
}) {
  const answer = scan.decisionSupport

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl p-6"
      style={{ background: "rgba(255,255,255,0.05)", borderLeft: `3px solid ${color}` }}
    >
      <p className="text-xs font-mono uppercase tracking-wider text-white/40">
        DECISION SUPPORT SYSTEM
        <DssTooltip />
      </p>

      {!answer ? (
        <p className="text-sm leading-relaxed text-white/80">{scan.dss}</p>
      ) : (
        <>
          {/* What to do, and by when */}
          <div className="flex flex-col gap-3">
            <p className="text-xl font-semibold leading-snug text-white">{answer.headline}</p>
            <div className="flex flex-wrap gap-2">
              {answer.level === 6 && <Chip label="Act" value="now" color={color} />}
              {answer.actWithinDays !== null && (
                <Chip
                  label="Act within"
                  value={answer.actWithinDays === 0 ? "now" : describeDays(answer.actWithinDays)}
                  color={color}
                />
              )}
              {answer.rescanInDays !== null && (
                <Chip label="Scan again in" value={describeDays(answer.rescanInDays)} />
              )}
              {answer.confidence === "reduced" && (
                <Chip label="Confidence" value="reduced by photo quality" color="#fbbf24" />
              )}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* How */}
            <div>
              <Heading>What to do</Heading>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-white/85">
                {answer.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            {/* Why */}
            <div>
              <Heading>Why this recommendation</Heading>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-white/75">
                {answer.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* What if I wait */}
          {answer.ifDelayed && (
            <div className="rounded-xl border border-white/10 p-4">
              <Heading>If this is left</Heading>
              <p className="text-sm leading-relaxed text-white/80">{answer.ifDelayed}</p>
            </div>
          )}

          {/* How sure */}
          {answer.limits.length > 0 && (
            <div>
              <Heading>Limits of this result</Heading>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed text-white/60">
                {answer.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Based on what */}
          {answer.sources.length > 0 && (
            <details className="text-xs text-white/60">
              <summary className="cursor-pointer select-none text-white/70 hover:text-white">
                Sources for these rules ({answer.sources.length})
              </summary>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
                {answer.sources.map((source) => (
                  <li key={source.label}>
                    {source.label}
                    {source.url && (
                      <>
                        {" "}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-white/30 hover:text-white"
                        >
                          Open
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
