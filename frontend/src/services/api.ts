import type { ScanResult } from "@/types"

type AnalysisResponse = {
  filename: string
  rust_percentage: number
  astm_grade: number
  priority_level: string
  recommendation: string
  scan_id: string | number | null
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

export async function analyzeCorrosion(
  file: File,
  imageUrl: string,
  userId?: string,
): Promise<ScanResult> {
  const formData = new FormData()
  formData.append("file", file)
  if (userId) formData.append("user_id", userId)

  const response = await fetch(`${API_BASE_URL}/analyze-corrosion`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "The corrosion analysis request failed.")
  }

  const data = (await response.json()) as AnalysisResponse
  const createdAt = new Date().toISOString()

  return {
    id: String(data.scan_id ?? createdAt),
    imageUrl,
    imageName: data.filename,
    rustPercent: data.rust_percentage,
    astmGrade: data.astm_grade,
    priorityLevel: data.priority_level,
    classification: `ASTM Grade ${data.astm_grade}`,
    classificationLabel: data.priority_level,
    dss: data.recommendation,
    rustExplanation: "",
    classificationExplanation: "",
    date: new Date(createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    createdAt,
    accountId: userId,
  }
}
