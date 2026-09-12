import type {
  AnalyzeCorrosionOptions,
  AnalysisResponse,
  ScanResult,
} from "@/types"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.text()

  if (!body) return `Request failed with status ${response.status}.`

  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    try {
      const payload: unknown = JSON.parse(body)
      if (typeof payload === "object" && payload !== null) {
        const detail = "detail" in payload ? payload.detail : undefined
        const message = "message" in payload ? payload.message : undefined
        if (typeof detail === "string") return detail
        if (typeof message === "string") return message
      }
    } catch {
      // Fall through to the raw response body when JSON is malformed.
    }
  }

  return body
}

function mapAnalysisResponse(
  data: AnalysisResponse,
  imageUrl = data.image_url ?? "",
  userId = data.user_id ?? undefined,
): ScanResult {
  const createdAt = data.created_at ?? new Date().toISOString()

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
    date: new Date(createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    createdAt,
    accountId: userId,
  }
}

function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (typeof value !== "object" || value === null) return false

  const record = value as Record<string, unknown>
  return (
    typeof record.filename === "string" &&
    typeof record.rust_percentage === "number" &&
    typeof record.astm_grade === "number" &&
    typeof record.priority_level === "string" &&
    typeof record.recommendation === "string" &&
    Array.isArray(record.box_coordinates)
  )
}

export async function analyzeCorrosion(
  file: File,
  imageUrl: string,
  options: AnalyzeCorrosionOptions = {},
): Promise<ScanResult> {
  const formData = new FormData()
  formData.append("file", file)
  if (options.userId) formData.append("user_id", options.userId)

  const headers: HeadersInit = {}
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  const response = await fetch(`${API_BASE_URL}/analyze-corrosion`, {
    method: "POST",
    headers,
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  const data = (await response.json()) as AnalysisResponse
  return mapAnalysisResponse(data, imageUrl, options.userId)
}

export async function getScanHistory(
  accessToken: string,
  userId?: string,
): Promise<ScanResult[]> {
  const response = await fetch(`${API_BASE_URL}/history`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  const payload: unknown = await response.json()
  const records =
    Array.isArray(payload)
      ? payload
      : typeof payload === "object" &&
          payload !== null &&
          "scans" in payload &&
          Array.isArray(payload.scans)
        ? payload.scans
        : null

  if (!records) {
    throw new Error("The history response was not in the expected format.")
  }

  return records
    .map((record) => {
      if (!isAnalysisResponse(record)) {
        throw new Error("The history response contained an invalid scan.")
      }
      return mapAnalysisResponse(record, undefined, userId)
    })
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0
      return rightTime - leftTime
    })
}
