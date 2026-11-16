import { DssTooltip } from "@/components/ClassificationTooltips"
import { useOptionalNav } from "@/components/NavContext"
import { ActionLadder, ActionTimeline, FactChips, SectionLabel, StepCards, Verdict } from "@/components/dss/DssVisuals"
import type { DecisionSupport, ScanResult } from "@/types"

/** The full wording of the answer: steps, reasons, the cost of waiting, limits and sources. */
export function FullExplanation({ answer }: { answer: DecisionSupport }) {
  return (
    <div className="mt-4 grid gap-5 text-sm leading-relaxed">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <SectionLabel tone="dark">What to do</SectionLabel>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-white/85">
            {answer.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
        <div>
          <SectionLabel tone="dark">Why this recommendation</SectionLabel>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-white/75">
            {answer.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      </div>
      {answer.ifDelayed && (
        <div>
          <SectionLabel tone="dark">If this is left</SectionLabel>
          <p className="text-white/80">{answer.ifDelayed}</p>
        </div>
      )}
      {answer.limits.length > 0 && (
        <div>
          <SectionLabel tone="dark">Limits of this result</SectionLabel>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs text-white/60">
            {answer.limits.map((limit) => <li key={limit}>{limit}</li>)}
          </ul>
        </div>
      )}
      {answer.sources.length > 0 && (
        <div>
          <SectionLabel tone="dark">Sources for these rules</SectionLabel>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs text-white/60">
            {answer.sources.map((source) => (
              <li key={source.label}>
                {source.label}
                {source.url && (
                  <>
                    {" "}
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 hover:text-white">
                      Open
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * The Decision Support System answer for a scan, at a glance: the verdict and the time
 * available, where the scan sits among the six action levels, what happens when, and the
 * steps as cards. The full wording is one click away. Falls back to the one-line
 * recommendation when the backend sent no structured answer.
 */
export default function DecisionSupportPanel({
  scan,
  color,
}: {
  scan: ScanResult
  /** Severity colour of the scan, used for the panel's accent. */
  color: string
}) {
  const answer = scan.decisionSupport
  const nav = useOptionalNav()
  const environmentName = nav?.scanOptions.environments.find((option) => option.code === scan.environment)?.name

  return (
    <div
      className="flex flex-col gap-6 rounded-2xl p-5 sm:p-6"
      style={{ background: "rgba(255,255,255,0.05)", borderLeft: `3px solid ${color}` }}
    >
      <p className="text-xs font-mono uppercase tracking-wider text-white/40">
        DECISION SUPPORT
        <DssTooltip />
      </p>

      {!answer ? (
        <p className="text-sm leading-relaxed text-white/80">{scan.dss}</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <Verdict answer={answer} />
            {answer.confidence === "reduced" && (
              <p className="self-start rounded-full border border-amber-300/60 px-3 py-1 text-xs text-amber-200">
                Photo quality lowers confidence. Retake the photo before acting.
              </p>
            )}
            <div>
              <SectionLabel tone="dark">Based on</SectionLabel>
              <FactChips scan={scan} environmentName={environmentName} />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <SectionLabel tone="dark">Where this scan sits</SectionLabel>
              <ActionLadder level={answer.level} rustPercent={scan.rustPercent} />
            </div>
            <div>
              <SectionLabel tone="dark">What happens when</SectionLabel>
              <ActionTimeline scan={scan} answer={answer} />
            </div>
          </div>

          <div>
            <SectionLabel tone="dark">What to do</SectionLabel>
            {answer.stepCards.length > 0 ? (
              <StepCards cards={answer.stepCards} />
            ) : (
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-white/85">
                {answer.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            )}
          </div>

          <details className="group border-t border-white/10 pt-4">
            <summary className="cursor-pointer select-none text-sm text-white/70 hover:text-white">
              Show the full explanation
              <span className="ml-2 text-xs text-white/40">
                steps in full, reasons, if this is left, {answer.limits.length} limit{answer.limits.length === 1 ? "" : "s"}, {answer.sources.length} source{answer.sources.length === 1 ? "" : "s"}
              </span>
            </summary>
            <FullExplanation answer={answer} />
          </details>
        </>
      )}
    </div>
  )
}
