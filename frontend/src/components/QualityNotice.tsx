import InfoTooltip from "@/components/InfoTooltip"
import type { LightingStatus, QualityWarning } from "@/types"
import {
  LIGHTING_STATUSES,
  QUALITY_INFO,
  QUALITY_WARNINGS,
} from "@/utils/classificationInfo"

const LIGHTING_TITLES: Record<Exclude<LightingStatus, "ok">, string> = {
  low_light: "Low light",
  overexposed: "Overexposed",
}

/** Warning banner for scans analysed from a usable but imperfect photo. */
export default function QualityNotice({
  lightingStatus,
  warnings,
  className = "",
}: {
  lightingStatus: LightingStatus | null
  warnings: QualityWarning[]
  className?: string
}) {
  const items: { key: string; title: string; text: string }[] = []
  if (lightingStatus && lightingStatus !== "ok") {
    items.push({
      key: lightingStatus,
      title: LIGHTING_TITLES[lightingStatus],
      text: LIGHTING_STATUSES[lightingStatus],
    })
  }
  for (const warning of warnings) {
    items.push({ key: warning, ...QUALITY_WARNINGS[warning] })
  }
  if (items.length === 0) return null

  return (
    <div className={className}>
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
      >
        <span aria-hidden="true" className="mt-0.5 font-bold text-amber-300">
          !
        </span>
        <div className="flex flex-1 flex-col gap-1.5 leading-6">
          <p className="text-xs font-mono uppercase tracking-wider text-amber-200/80">
            Photo quality: results may be less accurate
          </p>
          {items.map((item) => (
            <p key={item.key}>
              <span className="font-semibold">{item.title}: </span>
              {item.text}
            </p>
          ))}
        </div>
        <InfoTooltip label="About the photo quality checks" align="right">
          {QUALITY_INFO}
        </InfoTooltip>
      </div>
    </div>
  )
}
