import type {
  Account,
  AdminMetrics,
  AnalyzeCorrosionOptions,
  AnalysisResponse,
  MetricRange,
  RecoveryRequest,
  ScanResult,
} from "@/types"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

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

async function throwApiError(response: Response): Promise<never> {
  throw new ApiError(await parseErrorMessage(response), response.status)
}

async function requestJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    await throwApiError(response)
  }

  return (await response.json()) as T
}

function mapAnalysisResponse(
  data: AnalysisResponse,
  previewImageUrl = "",
): ScanResult {
  const createdAt = data.created_at ?? new Date().toISOString()

  return {
    id: String(data.scan_id ?? createdAt),
    imageUrl: data.image_url ?? previewImageUrl,
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
    accountId: data.user_id ?? undefined,
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
    await throwApiError(response)
  }

  const data = (await response.json()) as AnalysisResponse
  return mapAnalysisResponse(data, imageUrl)
}

export async function getScanHistory(accessToken: string): Promise<ScanResult[]> {
  const response = await fetch(`${API_BASE_URL}/history`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    await throwApiError(response)
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
      return mapAnalysisResponse(record)
    })
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0
      return rightTime - leftTime
    })
}

type AdminAccountResponse = {
  id: string
  username: string
  email: string
  role: "user" | "admin"
  status?: "active" | "deactivated"
  created_at: string
  last_active_at?: string | null
}

type AdminMetricsResponse = {
  total_accounts: number
  active_accounts: number
  scans_today: number
  scans_this_week: number
  scans_this_month: number
}

type RecoveryResponse = {
  id: string
  user_id: string
  status: "verified" | "completed" | "failed"
  requested_at: string
}

function mapAdminAccount(account: AdminAccountResponse): Account {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
    status: account.status ?? "active",
    createdAt: account.created_at,
    lastActiveAt: account.last_active_at ?? account.created_at,
  }
}

function mapRecoveryRequest(request: RecoveryResponse): RecoveryRequest {
  return {
    id: request.id,
    accountId: request.user_id,
    username: request.user_id,
    email: "",
    requestedAt: request.requested_at,
    status: request.status === "verified" ? "pending" : "handled",
  }
}

export async function getAdminAccounts(accessToken: string): Promise<Account[]> {
  const accounts = await requestJson<AdminAccountResponse[]>(
    "/admin/accounts",
    accessToken,
  )
  return accounts.map(mapAdminAccount)
}

export async function updateAdminAccount(
  accessToken: string,
  accountId: string,
  changes: Pick<Account, "username" | "email" | "role">,
): Promise<Account> {
  const account = await requestJson<AdminAccountResponse>(
    `/admin/accounts/${encodeURIComponent(accountId)}`,
    accessToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    },
  )
  return mapAdminAccount(account)
}

export async function getAdminMetrics(
  accessToken: string,
  selectedRange: MetricRange,
): Promise<AdminMetrics> {
  const metrics = await requestJson<AdminMetricsResponse>(
    "/admin/metrics",
    accessToken,
  )
  const selectedRangeScans =
    selectedRange === "day"
      ? metrics.scans_today
      : selectedRange === "week"
        ? metrics.scans_this_week
        : metrics.scans_this_month

  return {
    totalAccounts: metrics.total_accounts,
    activeAccounts: metrics.active_accounts,
    scansToday: metrics.scans_today,
    scansThisWeek: metrics.scans_this_week,
    scansThisMonth: metrics.scans_this_month,
    selectedRange,
    selectedRangeScans,
  }
}

export async function getAdminRecoveryRequests(
  accessToken: string,
): Promise<RecoveryRequest[]> {
  const requests = await requestJson<RecoveryResponse[]>(
    "/admin/recovery-requests",
    accessToken,
  )
  return requests.map(mapRecoveryRequest)
}

export async function updateAdminRecoveryRequest(
  accessToken: string,
  requestId: string,
): Promise<RecoveryRequest> {
  const request = await requestJson<RecoveryResponse>(
    `/admin/recovery-requests/${encodeURIComponent(requestId)}`,
    accessToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    },
  )
  return mapRecoveryRequest(request)
}
