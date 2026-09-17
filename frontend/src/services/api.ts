import type {
  Account,
  AdminMetrics,
  AnalyzeCorrosionOptions,
  AnalysisResponse,
  AnalysisErrorKind,
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

export class AnalysisRequestError extends Error {
  constructor(
    readonly kind: AnalysisErrorKind,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "AnalysisRequestError"
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
    title: data.title ?? undefined,
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
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 120_000,
  )
  const signal = options.signal
  const abortRequest = () => controller.abort()

  signal?.addEventListener("abort", abortRequest, { once: true })

  const formData = new FormData()
  formData.append("file", file)
  if (options.title) formData.append("title", options.title)

  const headers: HeadersInit = {}
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  try {
    const response = await fetch(`${API_BASE_URL}/analyze-corrosion`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new AnalysisRequestError(
          "session-expired",
          "Your session has expired. Please log in again.",
          false,
        )
      }
      if (response.status === 400) {
        throw new AnalysisRequestError(
          "invalid-image",
          await parseErrorMessage(response),
          false,
        )
      }
      if (response.status >= 500) {
        throw new AnalysisRequestError(
          "server-failure",
          "The analysis service could not finish this scan.",
          true,
        )
      }
      await throwApiError(response)
    }

    const payload: unknown = await response.json()
    if (!isAnalysisResponse(payload)) {
      throw new AnalysisRequestError(
        "server-failure",
        "The analysis service returned an invalid result. Please retry the scan.",
        true,
      )
    }
    const data = payload
    return mapAnalysisResponse(data, imageUrl)
  } catch (cause: unknown) {
    if (cause instanceof AnalysisRequestError || cause instanceof ApiError) {
      throw cause
    }
    if (cause instanceof DOMException && cause.name === "AbortError") {
      if (signal?.aborted) {
        throw new AnalysisRequestError("cancelled", "Analysis cancelled.", true)
      }
      throw new AnalysisRequestError(
        "request-timeout",
        "The analysis is taking too long. You can retry the scan.",
        true,
      )
    }
    throw new AnalysisRequestError(
      "network-unavailable",
      "The analysis service is unavailable. Check that the backend is running and retry.",
      true,
    )
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abortRequest)
  }
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

export async function getCurrentAccount(accessToken: string): Promise<Account> {
  const account = await requestJson<AdminAccountResponse>("/me", accessToken)
  return mapAdminAccount(account)
}

export async function deleteScanHistory(
  accessToken: string,
  scanId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/history/${encodeURIComponent(scanId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!response.ok) {
    await throwApiError(response)
  }
}

export async function updateScanHistory(
  accessToken: string,
  scanId: string,
  title: string,
): Promise<ScanResult> {
  const response = await fetch(
    `${API_BASE_URL}/history/${encodeURIComponent(scanId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    },
  )

  if (!response.ok) {
    await throwApiError(response)
  }

  const payload: unknown = await response.json()
  if (!isAnalysisResponse(payload)) {
    throw new Error("The history update response was not in the expected format.")
  }
  return mapAnalysisResponse(payload)
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
  username: string | null
  email: string | null
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
    username: request.username ?? "Unknown",
    email: request.email ?? "Unknown",
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
    `/admin/metrics?range=${selectedRange}`,
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
