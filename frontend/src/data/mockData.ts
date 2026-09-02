import type { ScanResult } from "@/types"

export const MOCK_HISTORY: ScanResult[] = [
  {
    id: "1",
    imageUrl:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&auto=format",
    imageName: "bridge_railing.jpg",
    rustPercent: 73,
    classification: "Class C",
    classificationLabel: "Severe",
    dss: "Immediate intervention required. Surface preparation to SSPC-SP6 minimum, apply rust inhibitor primer, and recoat with industrial-grade epoxy paint within 14 days.",
    rustExplanation:
      "73% of the surface area exhibits ferric oxide corrosion. Deep pitting visible in 40% of affected zones, with active rust flaking indicating ongoing electrochemical degradation.",
    classificationExplanation:
      "Class C corresponds to severe rust where the base metal surface is heavily oxidized, with significant loss of section. Structural integrity may be compromised.",
    date: "Aug 20, 2026",
  },
  {
    id: "2",
    imageUrl:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=300&fit=crop&auto=format",
    imageName: "pipe_section.jpg",
    rustPercent: 34,
    classification: "Class B",
    classificationLabel: "Moderate",
    dss: "Schedule maintenance within 30 days. Wire-brush affected areas, apply rust converter, and apply protective coating. Monitor monthly.",
    rustExplanation:
      "34% surface coverage with moderate rust scaling. Early-stage pitting detected in localized areas. No structural compromise evident at this stage.",
    classificationExplanation:
      "Class B indicates moderate corrosion with rust scaling covering a significant portion. Protective coating has partially failed and requires restoration.",
    date: "Aug 14, 2026",
  },
  {
    id: "3",
    imageUrl:
      "https://images.unsplash.com/photo-1581094651181-35942459ef62?w=400&h=300&fit=crop&auto=format",
    imageName: "steel_beam.jpg",
    rustPercent: 12,
    classification: "Class A",
    classificationLabel: "Minor",
    dss: "Routine maintenance. Clean surface, apply spot treatment to affected areas, and inspect again in 6 months.",
    rustExplanation:
      "12% surface coverage with light surface rust. Superficial oxidation with no penetration into base metal. Protective coating mostly intact.",
    classificationExplanation:
      "Class A is the lightest rust classification, indicating early-stage surface oxidation. The structural integrity is fully intact and no urgent action is needed.",
    date: "Jul 28, 2026",
  },
]

export function generateMockResult(
  imageName: string,
  imageUrl: string,
): ScanResult {
  const rustPercent = Math.floor(Math.random() * 80) + 5
  let classification: string,
    classificationLabel: string,
    dss: string,
    classificationExplanation: string

  if (rustPercent >= 60) {
    classification = "Class C"
    classificationLabel = "Severe"
    dss =
      "Immediate intervention required. Surface preparation to SSPC-SP6 minimum, apply rust inhibitor primer, and recoat with industrial-grade epoxy paint within 14 days."
    classificationExplanation =
      "Class C corresponds to severe rust where the base metal surface is heavily oxidized, with significant loss of section. Structural integrity may be compromised."
  } else if (rustPercent >= 30) {
    classification = "Class B"
    classificationLabel = "Moderate"
    dss =
      "Schedule maintenance within 30 days. Wire-brush affected areas, apply rust converter, and apply protective coating. Monitor monthly."
    classificationExplanation =
      "Class B indicates moderate corrosion with rust scaling covering a significant portion. Protective coating has partially failed and requires restoration."
  } else {
    classification = "Class A"
    classificationLabel = "Minor"
    dss =
      "Routine maintenance. Clean surface, apply spot treatment to affected areas, and inspect again in 6 months."
    classificationExplanation =
      "Class A is the lightest rust classification, indicating early-stage surface oxidation. The structural integrity is fully intact and no urgent action is needed."
  }

  const rustExplanation = `${rustPercent}% of the analyzed surface area exhibits ferric oxide corrosion. The image analysis identified ${
    rustPercent > 50
      ? "deep pitting and active flaking"
      : "surface-level oxidation"
  } across the scanned material. The degradation pattern suggests ${
    rustPercent > 60
      ? "prolonged exposure to moisture without protective coating"
      : "moderate environmental exposure with partial coating failure"
  }.`

  return {
    id: Date.now().toString(),
    imageUrl,
    imageName,
    rustPercent,
    classification,
    classificationLabel,
    dss,
    rustExplanation,
    classificationExplanation,
    date: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  }
}

export function severityColor(rustPercent: number): string {
  if (rustPercent >= 60) return "#c0392b"
  if (rustPercent >= 30) return "#e67e22"
  return "#27ae60"
}
