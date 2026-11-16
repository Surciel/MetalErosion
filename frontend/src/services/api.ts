import type {
  Account,
  AdminAnalytics,
  AdminMetrics,
  AnalyzeCorrosionOptions,
  AnalysisResponse,
  AnalysisErrorKind,
  DecisionSupport,
  DistributionType,
  LightingStatus,
  MetricRange,
  QualityWarning,
  RecoveryRequest,
  ScanOptions,
  ScanResult,
  Asset,
  AssetCondition,
  AssetDetail,
  AssetInput,
  AssetTrend,
  DashboardData,
  RegisterTotals,
  ReviewAgreement,
  ScanAssetRef,
  ScanReviewInfo,
  Site,
  SiteInput,
  SiteRegister,
} from "@/types"
import { classificationExplanation, rustExplanation } from "@/utils/classificationInfo"

const DISTRIBUTION_TYPES: ReadonlyArray<DistributionType> = ["S", "G", "P", "H"]
const LIGHTING_STATUSES: ReadonlyArray<LightingStatus> = ["ok", "low_light", "overexposed"]
const QUALITY_WARNINGS: ReadonlyArray<QualityWarning> = ["slightly_blurry", "small_surface"]

/** Backend rejection codes that have their own error kind (others show as invalid-image). */
const REJECTION_KINDS: Record<string, AnalysisErrorKind> = {
  not_metal: "not-metal",
  poor_lighting: "poor-lighting",
  too_blurry: "too-blurry",
  too_small: "too-small",
}

function toQualityWarnings(values: string[] | null | undefined): QualityWarning[] {
  return QUALITY_WARNINGS.filter((warning) => (values ?? []).includes(warning))
}

function toDistributionType(value: string | null | undefined): DistributionType | null {
  return DISTRIBUTION_TYPES.find((type) => type === value) ?? null
}

function toLightingStatus(value: string | null | undefined): LightingStatus | null {
  return LIGHTING_STATUSES.find((status) => status === value) ?? null
}

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

type ParsedError = {
  message: string
  code?: string
}

async function parseError(response: Response): Promise<ParsedError> {
  const body = await response.text()

  if (!body) return { message: `Request failed with status ${response.status}.` }

  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    try {
      const payload: unknown = JSON.parse(body)
      if (typeof payload === "object" && payload !== null) {
        const detail = "detail" in payload ? payload.detail : undefined
        const message = "message" in payload ? payload.message : undefined
        if (typeof detail === "string") return { message: detail }
        // Structured errors: { detail: { code, message } }
        if (typeof detail === "object" && detail !== null) {
          const detailMessage = "message" in detail ? detail.message : undefined
          const detailCode = "code" in detail ? detail.code : undefined
          if (typeof detailMessage === "string") {
            return {
              message: detailMessage,
              code: typeof detailCode === "string" ? detailCode : undefined,
            }
          }
        }
        if (typeof message === "string") return { message }
      }
    } catch {
      // Fall through to the raw response body when JSON is malformed.
    }
  }

  return { message: body }
}

async function parseErrorMessage(response: Response): Promise<string> {
  return (await parseError(response)).message
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

/** Reads the backend's decision support answer; null if it is missing or malformed. */
function toDecisionSupport(value: unknown): DecisionSupport | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const text = (entry: unknown): string => (typeof entry === "string" ? entry : "")
  const texts = (entry: unknown): string[] =>
    Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string") : []
  const days = (entry: unknown): number | null =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : null

  const headline = text(record.headline)
  if (!headline || typeof record.level !== "number") return null

  const sources = Array.isArray(record.sources)
    ? record.sources.flatMap((item) => {
        if (typeof item !== "object" || item === null) return []
        const source = item as Record<string, unknown>
        const label = text(source.label)
        const url = text(source.url)
        // Only plain web links are rendered as links.
        return label ? [{ label, url: /^https?:\/\//.test(url) ? url : "" }] : []
      })
    : []

  return {
    level: record.level,
    headline,
    strategy: text(record.strategy),
    surfacePreparation: text(record.surface_preparation),
    summary: text(record.summary),
    steps: texts(record.steps),
    actWithinDays: days(record.act_within_days),
    rescanInDays: days(record.rescan_in_days),
    reasons: texts(record.reasons),
    ifDelayed: text(record.if_delayed),
    limits: texts(record.limits),
    confidence: record.confidence === "reduced" ? "reduced" : "normal",
    sources,
  }
}

function mapAnalysisResponse(
  data: AnalysisResponse,
  previewImageUrl = "",
): ScanResult {
  const createdAt = data.created_at ?? new Date().toISOString()
  const distributionType = toDistributionType(data.distribution_type)
  const astmRating = data.astm_rating ?? String(data.astm_grade)
  const numberOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null
  const daysToCritical = numberOrNull(data.days_to_critical)
  const spreadCoverage = numberOrNull(data.spread_coverage)
  const spreadFactor = numberOrNull(data.spread_factor)

  return {
    id: String(data.scan_id ?? createdAt),
    imageUrl: data.image_url ?? previewImageUrl,
    imageName: data.filename,
    title: data.title ?? undefined,
    rustPercent: data.rust_percentage,
    astmGrade: data.astm_grade,
    astmRating,
    distributionType,
    daysToCritical,
    spreadCoverage,
    spreadFactor,
    regressionSlope: numberOrNull(data.regression_slope),
    elementType: typeof data.element_type === "string" ? data.element_type : null,
    environment: typeof data.environment === "string" ? data.environment : null,
    legacyCategory: typeof data.legacy_category === "string" ? data.legacy_category : null,
    baselineRate: numberOrNull(data.baseline_rate),
    lightingStatus: toLightingStatus(data.lighting_status),
    qualityWarnings: toQualityWarnings(data.quality_warnings),
    priorityLevel: data.priority_level,
    classification: `ASTM ${astmRating}`,
    classificationLabel: data.priority_level,
    dss: data.recommendation,
    decisionSupport: toDecisionSupport(data.decision_support),
    asset: toScanAssetRef(data.asset),
    review: toScanReview(data.review),
    inspectorName: typeof data.inspector_name === "string" ? data.inspector_name : null,
    rustExplanation: rustExplanation(data.rust_percentage, distributionType),
    classificationExplanation: classificationExplanation(
      data.astm_grade,
      astmRating,
      data.priority_level,
      daysToCritical,
      spreadCoverage,
      spreadFactor,
    ),
    boxCoordinates: data.box_coordinates ?? [],
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
  if (options.elementType) formData.append("element_type", options.elementType)
  if (options.environment) formData.append("environment", options.environment)
  if (options.assetId) formData.append("asset_id", options.assetId)

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
      if (response.status === 400 || response.status === 422) {
        const parsed = await parseError(response)
        throw new AnalysisRequestError(
          (parsed.code && REJECTION_KINDS[parsed.code]) || "invalid-image",
          parsed.message,
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

/**
 * Runs the backend's photo checks (format, lighting, sharpness, metal) without saving
 * anything. The scan pop-up calls it so a category can only be picked for a photo that
 * passes. Throws AnalysisRequestError: `retryable` is false when the photo was rejected
 * and true when the check itself could not run.
 */
export async function checkScanImage(
  file: File,
  accessToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const formData = new FormData()
  formData.append("file", file)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/check-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
      signal,
    })
  } catch (cause: unknown) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new AnalysisRequestError("cancelled", "Photo check cancelled.", true)
    }
    throw new AnalysisRequestError(
      "network-unavailable",
      "The photo could not be checked because the analysis service is unavailable. Check that the backend is running.",
      true,
    )
  }

  if (response.ok) return
  if (response.status === 401) {
    throw new AnalysisRequestError(
      "session-expired",
      "Your session has expired. Please log in again.",
      false,
    )
  }
  if (response.status === 400 || response.status === 422) {
    const parsed = await parseError(response)
    throw new AnalysisRequestError(
      (parsed.code && REJECTION_KINDS[parsed.code]) || "invalid-image",
      parsed.message,
      false,
    )
  }
  throw new AnalysisRequestError(
    "server-failure",
    "The photo could not be checked. Try again.",
    true,
  )
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
  changes: { title?: string; elementType?: string; environment?: string },
): Promise<ScanResult> {
  const response = await fetch(
    `${API_BASE_URL}/history/${encodeURIComponent(scanId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: changes.title,
        element_type: changes.elementType,
        environment: changes.environment,
      }),
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
  role: "user" | "engineer" | "admin"
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

type ScanOptionsResponse = {
  element_types: { name: string; examples: string; check: string }[]
  environments: {
    code: string
    name: string
    description: string
    rate_per_day: number
    years_new_to_critical: number
    basis: string
    evidence: string
    sources: string[]
  }[]
}

/** The element types and exposure environments, with their rates, from the backend. */
export async function getScanOptions(accessToken: string): Promise<ScanOptions> {
  const options = await requestJson<ScanOptionsResponse>("/scan-options", accessToken)
  return {
    elementTypes: (options.element_types ?? []).map((item) => ({
      name: item.name,
      examples: item.examples,
      check: item.check,
    })),
    environments: (options.environments ?? []).map((item) => ({
      code: item.code,
      name: item.name,
      description: item.description,
      ratePerDay: item.rate_per_day,
      yearsNewToCritical: item.years_new_to_critical,
      basis: item.basis,
      evidence: item.evidence,
      sources: item.sources ?? [],
    })),
  }
}

type AdminAnalyticsResponse = {
  days: number
  total_scans: number
  total_rejections: number
  scans_per_day: { date: string; count: number }[]
  by_grade: Record<string, number>
  by_priority: Record<string, number>
  by_distribution: Record<string, number>
  by_lighting: Record<string, number>
  by_environment: Record<string, number>
  by_element: Record<string, number>
  rejections: Record<string, number>
  rejections_available: boolean
}

export async function getAdminAnalytics(
  accessToken: string,
  days: number,
): Promise<AdminAnalytics> {
  // The browser's offset from UTC, so "per day" follows the admin's calendar days.
  const tzOffset = -new Date().getTimezoneOffset()
  const data = await requestJson<AdminAnalyticsResponse>(
    `/admin/analytics?days=${days}&tz_offset=${tzOffset}`,
    accessToken,
  )
  return {
    days: data.days,
    totalScans: data.total_scans,
    totalRejections: data.total_rejections,
    scansPerDay: data.scans_per_day ?? [],
    byGrade: data.by_grade ?? {},
    byPriority: data.by_priority ?? {},
    byDistribution: data.by_distribution ?? {},
    byLighting: data.by_lighting ?? {},
    byEnvironment: data.by_environment ?? {},
    byElement: data.by_element ?? {},
    rejections: data.rejections ?? {},
    rejectionsAvailable: data.rejections_available ?? false,
  }
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

// ---------------------------------------------------------------------------
// Inventory: sites, assets, conditions, review and the dashboard
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === "string" ? value : null)
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null
const counts = (value: unknown): Record<string, number> =>
  typeof value === "object" && value !== null ? (value as Record<string, number>) : {}

function mapSite(raw: Raw): Site {
  return {
    id: String(raw.id),
    name: str(raw.name) ?? "Unnamed site",
    location: str(raw.location),
    environment: str(raw.environment) ?? "",
    isDemo: raw.is_demo === true,
    createdBy: str(raw.created_by),
    assetCount: num(raw.asset_count) ?? 0,
  }
}

function mapTrend(raw: Raw): AssetTrend {
  const source = raw.source === "measured" || raw.source === "no_growth" ? raw.source : "assumed"
  return {
    source,
    inspections: num(raw.inspections) ?? 0,
    usableInspections: num(raw.usable_inspections) ?? 0,
    spanDays: num(raw.span_days) ?? 0,
    assumedRate: num(raw.assumed_rate) ?? 0,
    rateUsed: num(raw.rate_used) ?? 0,
    fittedRate: num(raw.fitted_rate),
    fittedRateLow: num(raw.fitted_rate_low),
    fittedRateHigh: num(raw.fitted_rate_high),
    rSquared: num(raw.r_squared),
    blendWeight: num(raw.blend_weight) ?? 0,
    intercept: num(raw.intercept),
    firstInspection: str(raw.first_inspection),
  }
}

function mapCondition(value: unknown): AssetCondition | null {
  if (typeof value !== "object" || value === null) return null
  const raw = value as Raw
  const trend = mapTrend((raw.trend as Raw) ?? {})
  return {
    scanId: str(raw.scan_id),
    date: str(raw.date),
    rustPercent: num(raw.rust_percentage) ?? 0,
    astmGrade: num(raw.astm_grade),
    astmRating: str(raw.astm_rating),
    priorityLevel: str(raw.priority_level),
    actionLevel: num(raw.action_level) ?? 1,
    strategy: str(raw.strategy) ?? "",
    surfacePreparation: str(raw.surface_preparation) ?? "",
    rateSource: trend.source,
    ratePerDay: num(raw.rate_per_day) ?? 0,
    trend,
    nextThreshold: num(raw.next_threshold),
    daysToNext: num(raw.days_to_next),
    actWithinDays: num(raw.act_within_days),
    dueDate: str(raw.due_date),
    daysToCritical: num(raw.days_to_critical),
    rustedAreaM2: num(raw.rusted_area_m2),
    workAreaM2: num(raw.work_area_m2),
    reviewStatus:
      raw.review_status === "confirmed" || raw.review_status === "corrected" ? raw.review_status : null,
    confidence: raw.confidence === "reduced" ? "reduced" : raw.confidence === "normal" ? "normal" : null,
  }
}

function mapAsset(raw: Raw): Asset {
  return {
    id: String(raw.id),
    siteId: String(raw.site_id),
    tag: str(raw.tag) ?? "",
    name: str(raw.name),
    elementType: str(raw.element_type) ?? "",
    surfaceAreaM2: num(raw.surface_area_m2),
    coatingSystem: str(raw.coating_system),
    lastCoatedOn: str(raw.last_coated_on),
    notes: str(raw.notes),
    createdBy: str(raw.created_by),
    scanCount: num(raw.scan_count) ?? 0,
    condition: mapCondition(raw.condition),
    siteName: str(raw.site_name),
  }
}

function mapTotals(raw: Raw): RegisterTotals {
  return {
    assets: num(raw.assets) ?? 0,
    inspected: num(raw.inspected) ?? 0,
    notInspected: num(raw.not_inspected) ?? 0,
    needingAction: num(raw.needing_action) ?? 0,
    critical: num(raw.critical) ?? 0,
    overdue: num(raw.overdue) ?? 0,
    byLevel: counts(raw.by_level),
    byGrade: counts(raw.by_grade),
    areaByStrategy: counts(raw.area_by_strategy),
    workAreaM2: num(raw.work_area_m2) ?? 0,
  }
}

function toScanAssetRef(value: unknown): ScanAssetRef | null {
  if (typeof value !== "object" || value === null) return null
  const raw = value as Raw
  if (typeof raw.id !== "string") return null
  return {
    id: raw.id,
    tag: str(raw.tag) ?? "",
    name: str(raw.name),
    siteId: str(raw.site_id) ?? "",
    siteName: str(raw.site_name),
  }
}

function toScanReview(value: unknown): ScanReviewInfo | null {
  if (typeof value !== "object" || value === null) return null
  const raw = value as Raw
  if (raw.status !== "confirmed" && raw.status !== "corrected") return null
  return {
    status: raw.status,
    byName: str(raw.by_name),
    at: str(raw.at),
    note: str(raw.note),
    aiRustPercent: num(raw.ai_rust_percentage) ?? 0,
    aiDistributionType: toDistributionType(str(raw.ai_distribution_type)),
    aiAstmGrade: num(raw.ai_astm_grade) ?? 0,
  }
}

function scanFromPayload(payload: unknown, what: string): ScanResult {
  if (!isAnalysisResponse(payload)) {
    throw new Error(`The ${what} response was not in the expected format.`)
  }
  return mapAnalysisResponse(payload)
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export async function getSites(accessToken: string): Promise<Site[]> {
  return (await requestJson<Raw[]>("/sites", accessToken)).map(mapSite)
}

export async function createSite(accessToken: string, site: SiteInput): Promise<Site> {
  return mapSite(await requestJson<Raw>("/sites", accessToken, jsonInit("POST", site)))
}

export async function updateSite(accessToken: string, siteId: string, changes: Partial<SiteInput>): Promise<Site> {
  return mapSite(
    await requestJson<Raw>(`/sites/${encodeURIComponent(siteId)}`, accessToken, jsonInit("PATCH", changes)),
  )
}

export async function deleteSite(accessToken: string, siteId: string): Promise<void> {
  await requestJson<Raw>(`/sites/${encodeURIComponent(siteId)}`, accessToken, { method: "DELETE" })
}

export async function getSiteRegister(accessToken: string, siteId: string): Promise<SiteRegister> {
  const data = await requestJson<Raw>(`/sites/${encodeURIComponent(siteId)}`, accessToken)
  return {
    site: mapSite(data.site as Raw),
    assets: ((data.assets as Raw[]) ?? []).map(mapAsset),
    totals: mapTotals((data.totals as Raw) ?? {}),
  }
}

const assetBody = (asset: Partial<AssetInput>) => ({
  tag: asset.tag,
  name: asset.name,
  element_type: asset.elementType,
  surface_area_m2: asset.surfaceAreaM2,
  coating_system: asset.coatingSystem,
  last_coated_on: asset.lastCoatedOn,
  notes: asset.notes,
})

export async function createAsset(accessToken: string, siteId: string, asset: AssetInput): Promise<Asset> {
  return mapAsset(
    await requestJson<Raw>(`/sites/${encodeURIComponent(siteId)}/assets`, accessToken, jsonInit("POST", assetBody(asset))),
  )
}

export async function updateAsset(accessToken: string, assetId: string, changes: Partial<AssetInput>): Promise<Asset> {
  return mapAsset(
    await requestJson<Raw>(`/assets/${encodeURIComponent(assetId)}`, accessToken, jsonInit("PATCH", assetBody(changes))),
  )
}

export async function deleteAsset(accessToken: string, assetId: string): Promise<void> {
  await requestJson<Raw>(`/assets/${encodeURIComponent(assetId)}`, accessToken, { method: "DELETE" })
}

export async function getAssetDetail(accessToken: string, assetId: string): Promise<AssetDetail> {
  const data = await requestJson<Raw>(`/assets/${encodeURIComponent(assetId)}`, accessToken)
  return {
    asset: mapAsset(data.asset as Raw),
    site: mapSite(data.site as Raw),
    scans: ((data.scans as unknown[]) ?? []).filter(isAnalysisResponse).map((scan) => mapAnalysisResponse(scan)),
  }
}

/** An engineer confirms a scan, or corrects its rust % and distribution with a note. */
export async function reviewScan(
  accessToken: string,
  scanId: string,
  review:
    | { action: "confirm"; note?: string }
    | { action: "correct"; rustPercent: number; distributionType?: DistributionType | null; note: string },
): Promise<ScanResult> {
  const body =
    review.action === "confirm"
      ? { action: "confirm", note: review.note }
      : {
          action: "correct",
          rust_percentage: review.rustPercent,
          distribution_type: review.distributionType ?? undefined,
          note: review.note,
        }
  return scanFromPayload(
    await requestJson<unknown>(`/history/${encodeURIComponent(scanId)}/review`, accessToken, jsonInit("POST", body)),
    "review",
  )
}

export async function clearScanReview(accessToken: string, scanId: string): Promise<ScanResult> {
  return scanFromPayload(
    await requestJson<unknown>(`/history/${encodeURIComponent(scanId)}/review`, accessToken, { method: "DELETE" }),
    "review",
  )
}

export async function getDashboard(accessToken: string): Promise<DashboardData> {
  const data = await requestJson<Raw>("/dashboard", accessToken)
  const totals = (data.totals as Raw) ?? {}
  const deadlines = (data.deadlines as Raw) ?? {}
  const reviews = (data.reviews as Raw) ?? {}
  const sources = (data.rate_sources as Raw) ?? {}
  return {
    totals: {
      ...mapTotals(totals),
      sites: num(totals.sites) ?? 0,
      inspections: num(totals.inspections) ?? 0,
      measuredRateAssets: num(totals.measured_rate_assets) ?? 0,
    },
    bySite: ((data.by_site as Raw[]) ?? []).map((row) => ({
      siteId: String(row.site_id),
      site: str(row.site) ?? "Unnamed site",
      environment: str(row.environment) ?? "",
      isDemo: row.is_demo === true,
      assets: num(row.assets) ?? 0,
      notInspected: num(row.not_inspected) ?? 0,
      byLevel: counts(row.by_level),
      workAreaM2: num(row.work_area_m2) ?? 0,
    })),
    byElement: ((data.by_element as Raw[]) ?? []).map((row) => ({
      elementType: str(row.element_type) ?? "Not recorded",
      byLevel: counts(row.by_level),
    })),
    deadlines: {
      overdue: num(deadlines.overdue) ?? 0,
      months: ((deadlines.months as Raw[]) ?? []).map((row) => ({
        month: str(row.month) ?? "",
        count: num(row.count) ?? 0,
      })),
      later: num(deadlines.later) ?? 0,
    },
    mostUrgent: ((data.most_urgent as Raw[]) ?? []).map(mapAsset),
    inspectionsByMonth: ((data.inspections_by_month as Raw[]) ?? []).map((row) => ({
      month: str(row.month) ?? "",
      count: num(row.count) ?? 0,
      averageRust: num(row.average_rust),
    })),
    reviews: {
      confirmed: num(reviews.confirmed) ?? 0,
      corrected: num(reviews.corrected) ?? 0,
      unreviewed: num(reviews.unreviewed) ?? 0,
    },
    rateSources: {
      assumed: num(sources.assumed) ?? 0,
      measured: num(sources.measured) ?? 0,
      no_growth: num(sources.no_growth) ?? 0,
    },
  }
}

export async function getReviewAgreement(accessToken: string): Promise<ReviewAgreement> {
  const data = await requestJson<Raw>("/review-agreement", accessToken)
  return {
    available: data.available === true,
    reviewed: num(data.reviewed) ?? 0,
    confirmed: num(data.confirmed) ?? 0,
    corrected: num(data.corrected) ?? 0,
    exact: num(data.exact) ?? 0,
    withinOne: num(data.within_one) ?? 0,
    pairs: ((data.pairs as Raw[]) ?? []).map((row) => ({
      aiGrade: num(row.ai_grade) ?? 0,
      engineerGrade: num(row.engineer_grade) ?? 0,
      count: num(row.count) ?? 0,
    })),
  }
}
