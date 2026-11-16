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
  | "analytics"
  | "history-detail"
  | "admin"
  | "dashboard"
  | "sites"
  | "site"
  | "asset"
  | "report-scan"
  | "report-site"

/** "user" is the stored name of the inspector role. */
export type AccountRole = "user" | "engineer" | "admin"
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
  | "too-blurry"
  | "too-small"
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

/** A type of steel element (backend/asset_profile.py). It sets the checks in the answer. */
export interface ElementTypeOption {
  name: string
  examples: string
  /** What to look at on this kind of element. */
  check: string
}

/** An exposure environment, ISO 12944-2 corrosivity category. It sets the baseline rate. */
export interface EnvironmentOption {
  /** "C2" to "C5". */
  code: string
  name: string
  description: string
  /** Baseline rust growth, % of the surface per day. */
  ratePerDay: number
  yearsNewToCritical: number
  /** Where the rate comes from. */
  basis: string
  /** Published facts behind the rate. */
  evidence: string
  sources: string[]
}

/** The two pickers shown when a scan is set up (GET /scan-options). */
export interface ScanOptions {
  elementTypes: ElementTypeOption[]
  environments: EnvironmentOption[]
}

/** What the inspector records about the scanned element. */
export interface ScanDetails {
  elementType: string
  environment: string
  /** Set when the scan is of an asset; the two fields above then come from it. */
  assetId?: string
}

/** System-wide aggregates for the admin charts (GET /admin/analytics). */
export interface AdminAnalytics {
  days: number
  totalScans: number
  totalRejections: number
  scansPerDay: { date: string; count: number }[]
  byGrade: Record<string, number>
  byPriority: Record<string, number>
  byDistribution: Record<string, number>
  byLighting: Record<string, number>
  byEnvironment: Record<string, number>
  byElement: Record<string, number>
  rejections: Record<string, number>
  /** False until migration 003 has created the rejection log. */
  rejectionsAvailable: boolean
}

/** Issues with a photo that was still analysed. */
export type QualityWarning = "slightly_blurry" | "small_surface"

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
  /** Share of the metal surface grid that contains rust (0 to 1); null for older scans. */
  spreadCoverage: number | null
  /** Multiplier applied to the category corrosion rate because of the spread. */
  spreadFactor: number | null
  /** Effective corrosion rate used for the prediction, in rust % per day. */
  regressionSlope: number | null
  /** Type of steel element; null for scans saved before it was recorded. */
  elementType: string | null
  /** Exposure environment code, "C2" to "C5"; null for scans saved before it was recorded. */
  environment: string | null
  /** Object category of a scan saved before environments existed; null otherwise. */
  legacyCategory: string | null
  /** Baseline corrosion rate used, in rust % per day. */
  baselineRate: number | null
  lightingStatus: LightingStatus | null
  qualityWarnings: QualityWarning[]
  priorityLevel: string
  classification: string
  classificationLabel: string
  dss: string
  /** The full maintenance answer; null when the backend did not send one. */
  decisionSupport?: DecisionSupport | null
  boxCoordinates: number[]
  /** The steel element this scan belongs to; null for a scan with no asset. */
  asset?: ScanAssetRef | null
  /** Null while no engineer has reviewed the scan. */
  review?: ScanReviewInfo | null
  inspectorName?: string | null
  rustExplanation?: string
  classificationExplanation?: string
  date: string
  createdAt?: string
  accountId?: string
}

/** The rule-based maintenance answer for a scan (backend/decision_support.py). */
export interface DecisionSupport {
  /** Action level, 1 (no repair) to 6 (assess for replacement). */
  level: number
  headline: string
  /** Maintenance painting strategy, e.g. "Spot repair". */
  strategy: string
  /** Surface preparation grade, e.g. "Power tool cleaning, SSPC-SP 3". */
  surfacePreparation: string
  summary: string
  steps: string[]
  /** Days until the projection crosses into the next level; null when not applicable. */
  actWithinDays: number | null
  rescanInDays: number | null
  reasons: string[]
  ifDelayed: string
  limits: string[]
  confidence: "normal" | "reduced"
  sources: { label: string; url: string }[]
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
  spread_coverage?: number | null
  spread_factor?: number | null
  regression_slope?: number | null
  element_type?: string | null
  environment?: string | null
  legacy_category?: string | null
  baseline_rate?: number | null
  lighting_status?: string | null
  quality_warnings?: string[] | null
  priority_level: string
  recommendation: string
  decision_support?: unknown
  asset?: unknown
  review?: unknown
  inspector_name?: string | null
  box_coordinates: number[]
  scan_id: string | number | null
  image_url?: string | null
  created_at?: string | null
  user_id?: string | null
}

export interface AnalyzeCorrosionOptions {
  accessToken?: string
  title?: string
  elementType?: string
  environment?: string
  assetId?: string
  signal?: AbortSignal
  timeoutMs?: number
}

export interface AnalysisErrorInfo {
  kind: AnalysisErrorKind
  message: string
  retryable: boolean
}

/** A place with one exposure environment (backend/inventory.py). */
export interface Site {
  id: string
  name: string
  location: string | null
  /** ISO 12944 corrosivity category, "C2" to "C5". */
  environment: string
  /** Filled by the demo seeding tool; shown as "Demo data". */
  isDemo: boolean
  createdBy: string | null
  assetCount: number
}

/** How an asset's deterioration rate was obtained (backend/asset_trend.py). */
export type RateSource = "assumed" | "measured" | "no_growth"

export interface AssetTrend {
  source: RateSource
  inspections: number
  usableInspections: number
  spanDays: number
  assumedRate: number
  rateUsed: number
  fittedRate: number | null
  fittedRateLow: number | null
  fittedRateHigh: number | null
  rSquared: number | null
  blendWeight: number
  intercept: number | null
  firstInspection: string | null
}

/** An asset's current condition: its latest inspection plus its trend. */
export interface AssetCondition {
  scanId: string | null
  date: string | null
  rustPercent: number
  astmGrade: number | null
  astmRating: string | null
  priorityLevel: string | null
  /** 1 (no work) to 6 (structural assessment). */
  actionLevel: number
  strategy: string
  surfacePreparation: string
  rateSource: RateSource
  /** Rust % per day used for the projection. */
  ratePerDay: number
  trend: AssetTrend
  nextThreshold: number | null
  daysToNext: number | null
  actWithinDays: number | null
  /** ISO date by which the current strategy should be carried out. */
  dueDate: string | null
  daysToCritical: number | null
  rustedAreaM2: number | null
  /** Area the strategy treats: the rusted areas for spot work, the whole surface otherwise. */
  workAreaM2: number | null
  reviewStatus: "confirmed" | "corrected" | null
  confidence: "normal" | "reduced" | null
}

/** One steel element on a site. */
export interface Asset {
  id: string
  siteId: string
  tag: string
  name: string | null
  elementType: string
  surfaceAreaM2: number | null
  coatingSystem: string | null
  lastCoatedOn: string | null
  notes: string | null
  createdBy: string | null
  scanCount: number
  /** Null until the asset has been inspected. */
  condition: AssetCondition | null
  /** Only on dashboard lists that mix sites. */
  siteName?: string | null
}

export interface RegisterTotals {
  assets: number
  inspected: number
  notInspected: number
  needingAction: number
  critical: number
  overdue: number
  byLevel: Record<string, number>
  byGrade: Record<string, number>
  areaByStrategy: Record<string, number>
  workAreaM2: number
}

/** A site with its priority register: every asset, most urgent first. */
export interface SiteRegister {
  site: Site
  assets: Asset[]
  totals: RegisterTotals
}

export interface AssetDetail {
  asset: Asset
  site: Site
  /** Newest first. */
  scans: ScanResult[]
}

export interface AssetInput {
  tag: string
  name?: string | null
  elementType: string
  surfaceAreaM2?: number | null
  coatingSystem?: string | null
  lastCoatedOn?: string | null
  notes?: string | null
}

export interface SiteInput {
  name: string
  location?: string | null
  environment: string
}

/** The asset a scan belongs to. */
export interface ScanAssetRef {
  id: string
  tag: string
  name: string | null
  siteId: string
  siteName: string | null
}

/** An engineer's confirmation or correction of a scan. */
export interface ScanReviewInfo {
  status: "confirmed" | "corrected"
  byName: string | null
  at: string | null
  note: string | null
  /** What the AI measured, kept when the engineer corrects it. */
  aiRustPercent: number
  aiDistributionType: DistributionType | null
  aiAstmGrade: number
}

export interface DashboardData {
  totals: RegisterTotals & { sites: number; inspections: number; measuredRateAssets: number }
  bySite: {
    siteId: string
    site: string
    environment: string
    isDemo: boolean
    assets: number
    notInspected: number
    byLevel: Record<string, number>
    workAreaM2: number
  }[]
  byElement: { elementType: string; byLevel: Record<string, number> }[]
  deadlines: { overdue: number; months: { month: string; count: number }[]; later: number }
  mostUrgent: Asset[]
  inspectionsByMonth: { month: string; count: number; averageRust: number | null }[]
  reviews: { confirmed: number; corrected: number; unreviewed: number }
  rateSources: Record<RateSource, number>
}

/** AI grade against engineer grade over every reviewed scan (GET /review-agreement). */
export interface ReviewAgreement {
  available: boolean
  reviewed: number
  confirmed: number
  corrected: number
  exact: number
  withinOne: number
  pairs: { aiGrade: number; engineerGrade: number; count: number }[]
}
