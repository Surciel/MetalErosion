import { useState } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import PageGrid from "@/components/PageGrid"
import {
  AstmGradeTooltip,
  DistributionTooltip,
  DssTooltip,
  PriorityTooltip,
  RustPercentTooltip,
} from "@/components/ClassificationTooltips"
import { severityColor } from "@/utils/severity"
import { distributionName } from "@/utils/classificationInfo"
import type { ScanResult, View } from "@/types"

export default function InfoPage({
  username,
  title,
  result,
  type,
  onBack,
  onNavigate,
}: {
  username: string
  title: string
  result: ScanResult
  type: "rust" | "classification"
  onBack: () => void
  onNavigate: (v: View) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const color = severityColor(result)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)" }}
    >
      <Header
        username={username}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        menuOpen={menuOpen}
      />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={onNavigate}
      />

      <main className="flex-1 flex items-start py-12 px-4">
        <PageGrid>
          {/* cols 4–9: 6-column centered */}
          <div className="flex flex-col gap-4" style={{ gridColumn: "4 / 10" }}>
            <h1 className="text-xl font-bold text-white">{title}</h1>

            {/* Key metric */}
            <div
              className="rounded-2xl p-6 flex items-center gap-5"
              style={{ background: "var(--color-card)" }}
            >
              {type === "rust" ? (
                <>
                  <div
                    className="text-5xl font-bold"
                    style={{ color, fontFamily: "JetBrains Mono" }}
                  >
                    {result.rustPercent}%
                  </div>
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider font-mono">
                      Surface Coverage
                      <RustPercentTooltip />
                    </p>
                    <p className="flex items-center text-sm text-white/80 mt-1">
                      {result.classificationLabel}
                      <PriorityTooltip priority={result.priorityLevel} />
                    </p>
                    <p className="flex items-center text-xs text-white/60 mt-1">
                      Distribution: {distributionName(result.distributionType)}
                      <DistributionTooltip type={result.distributionType} />
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-4xl font-bold text-white"
                    style={{ fontFamily: "JetBrains Mono" }}
                  >
                    {result.classification}
                  </div>
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider font-mono">
                      Classification
                      <AstmGradeTooltip grade={result.astmGrade} />
                    </p>
                    <p className="flex items-center text-sm mt-1" style={{ color }}>
                      {result.classificationLabel}
                      <PriorityTooltip priority={result.priorityLevel} />
                    </p>
                    <p className="flex items-center text-xs text-white/60 mt-1">
                      Distribution: {distributionName(result.distributionType)}
                      <DistributionTooltip type={result.distributionType} />
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Explanation */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--color-card)" }}
            >
              <p className="text-xs text-white/50 uppercase tracking-wider font-mono mb-3">
                Analysis
              </p>
              <p className="text-sm text-white/85 leading-relaxed">
                {type === "rust"
                  ? result.rustExplanation
                  : result.classificationExplanation}
              </p>
            </div>

            {/* DSS (classification only) */}
            {type === "classification" && (
              <div
                className="rounded-2xl p-5"
                style={{
                  background: "var(--color-card)",
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <p className="text-xs text-white/50 uppercase tracking-wider font-mono mb-3">
                  Decision Support System
                  <DssTooltip />
                </p>
                <p className="text-sm text-white/85 leading-relaxed">
                  {result.dss}
                </p>
              </div>
            )}

            <button
              onClick={onBack}
              className="w-full py-3 rounded-xl font-semibold text-white/70 hover:text-white transition-all text-sm border mt-2"
              style={{
                borderColor: "var(--color-border)",
                background: "transparent",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.07)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              ← Back to Results
            </button>
          </div>
        </PageGrid>
      </main>
    </div>
  )
}
