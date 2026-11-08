export type View =
  | "landing"
  | "login"
  | "signup"
  | "reset-password"
  | "home"
  | "calculating"
  | "results"
  | "rust-info"
  | "classification-info"
  | "history"
  | "history-detail"
  | "admin"

export type AccountRole = "user" | "admin"
export type AccountStatus = "active" | "deactivated"
export type MetricRange = "day" | "week" | "month"
export type AnalysisPhase =
  | "checking-session"
  | "processing"
  | "complete"
  | "failed"

export type AnalysisErrorKind =
  | "session-expired"
  | "invalid-image"
  | "not-metal"
  | "poor-lighting"
  | "request-timeout"
  | "network-unavailable"
  | "server-failure"
  | "cancelled"
  | "unknown"

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignupCredentials extends LoginCredentials {
  username: string
}

export interface Account {
  id: string
  username: string
  email: string
  role: AccountRole
  status: AccountStatus
  createdAt: string
  lastActiveAt: string
}

export interface RecoveryRequest {
  id: string
  accountId: string
  username: string
  email: string
  requestedAt: string
  status: "pending" | "handled"
}

export interface AdminMetrics {
  totalAccounts: number
  activeAccounts: number
  scansToday: number
  scansThisWeek: number
  scansThisMonth: number
  selectedRange: MetricRange
  selectedRangeScans: number
}

/** ASTM D610 rust distribution: Spot, General, Pinpoint, Hybrid. */
export type DistributionType = "S" | "G" | "P" | "H"

/** Environmental lighting of the analysed photo (rejected exposures never produce a result). */
export type LightingStatus = "ok" | "low_light" | "overexposed"

export type SeverityLevel = "none" | "low" | "moderate" | "high" | "critical"

export interface ScanResult {
  id: string
  imageUrl: string
  imageName: string
  title?: string
  rustPercent: number
  astmGrade: number
  /** ASTM D610 notation combining grade and distribution, e.g. "5-S". */
  astmRating: string
  distributionType: DistributionType | null
  daysToCritical: number | null
  lightingStatus: LightingStatus | null
  priorityLevel: string
  classification: string
  classificationLabel: string
  dss: string
  boxCoordinates: number[]
  rustExplanation?: string
  classificationExplanation?: string
  date: string
  createdAt?: string
  accountId?: string
}

export interface AnalysisResponse {
  status: string
  filename: string
  title?: string | null
  rust_percentage: number
  astm_grade: number
  astm_rating?: string | null
  distribution_type?: string | null
  days_to_critical?: number | null
  lighting_status?: string | null
  priority_level: string
  recommendation: string
  box_coordinates: number[]
  scan_id: string | number | null
  image_url?: string | null
  created_at?: string | null
  user_id?: string | null
}

export interface AnalyzeCorrosionOptions {
  accessToken?: string
  title?: string
  signal?: AbortSignal
  timeoutMs?: number
}

export interface AnalysisErrorInfo {
  kind: AnalysisErrorKind
  message: string
  retryable: boolean
}
