import InfoTooltip from "@/components/InfoTooltip"
import type { LightingStatus } from "@/types"
import { LIGHTING_INFO, LIGHTING_STATUSES } from "@/utils/classificationInfo"

/** Warning banner for scans analysed under poor (but usable) lighting. */
export default function LightingNotice({
  status,
  className = "",
}: {
  status: LightingStatus | null
  className?: string
}) {
  if (!status || status === "ok") return null

  return (
    <div className={className}>
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
      >
        <span aria-hidden="true" className="mt-0.5 font-bold text-amber-300">
          {status === "low_light" ? "◐" : "☀"}
        </span>
        <p className="flex-1 leading-6">
          <span className="font-semibold">
            {status === "low_light" ? "Low light: " : "Overexposed: "}
          </span>
          {LIGHTING_STATUSES[status]}
        </p>
        <InfoTooltip label="About the lighting check" align="right">
          {LIGHTING_INFO}
        </InfoTooltip>
      </div>
    </div>
  )
}
