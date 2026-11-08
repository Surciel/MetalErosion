import InfoTooltip from "@/components/InfoTooltip"
import type { DistributionType } from "@/types"
import {
  ASTM_GRADES,
  ASTM_GRADE_INFO,
  DISTRIBUTION_INFO,
  DISTRIBUTION_TYPES,
  DSS_INFO,
  PRIORITY_INFO,
  PRIORITY_TIERS,
  RUST_PERCENT_INFO,
} from "@/utils/classificationInfo"

type Align = { align?: "left" | "right" }

export function RustPercentTooltip({ align }: Align) {
  return (
    <InfoTooltip label="About corrosion percentage" align={align}>
      {RUST_PERCENT_INFO}
    </InfoTooltip>
  )
}

export function AstmGradeTooltip({ grade, align }: Align & { grade?: number }) {
  return (
    <InfoTooltip label="About the ASTM D610 classification" align={align}>
      <span className="block">{ASTM_GRADE_INFO}</span>
      <span className="mt-2 grid grid-cols-[auto_1fr_auto] gap-x-2 font-mono text-[10px] leading-4">
        {ASTM_GRADES.map((band) => {
          const current = band.grade === grade
          return (
            <span key={band.grade} className="contents">
              <span className={current ? "font-bold text-white" : "text-white/60"}>{band.grade}</span>
              <span className={current ? "font-bold text-white" : "text-white/60"}>{band.label}</span>
              <span className={current ? "font-bold text-white" : "text-white/40"}>
                {band.maxPercent === null ? ">50%" : `≤${band.maxPercent}%`}
              </span>
            </span>
          )
        })}
      </span>
    </InfoTooltip>
  )
}

export function DistributionTooltip({
  type,
  align,
}: Align & { type?: DistributionType | null }) {
  return (
    <InfoTooltip label="About the rust distribution type" align={align}>
      <span className="block">{DISTRIBUTION_INFO}</span>
      <span className="mt-2 flex flex-col gap-1">
        {(Object.keys(DISTRIBUTION_TYPES) as DistributionType[]).map((key) => (
          <span key={key} className={key === type ? "text-white" : "text-white/60"}>
            <span className="font-semibold">
              {DISTRIBUTION_TYPES[key].name} ({key})
            </span>
            {": "}
            {DISTRIBUTION_TYPES[key].description}
          </span>
        ))}
      </span>
    </InfoTooltip>
  )
}

export function PriorityTooltip({ priority, align }: Align & { priority?: string }) {
  return (
    <InfoTooltip label="About the maintenance priority" align={align}>
      <span className="block">{PRIORITY_INFO}</span>
      <span className="mt-2 flex flex-col gap-1">
        {Object.entries(PRIORITY_TIERS).map(([tier, text]) => (
          <span key={tier} className={tier === priority ? "text-white" : "text-white/60"}>
            <span className="font-semibold">{tier}</span>: {text}
          </span>
        ))}
      </span>
    </InfoTooltip>
  )
}

export function DssTooltip({ align }: Align) {
  return (
    <InfoTooltip label="About the decision support recommendation" align={align}>
      {DSS_INFO}
    </InfoTooltip>
  )
}
