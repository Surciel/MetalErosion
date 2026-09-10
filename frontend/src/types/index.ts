export type View =
  | "landing"
  | "login"
  | "signup"
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
export type MetricRange = "day" | "week" | "month" | "custom"

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

export interface ScanResult {
  id: string
  imageUrl: string
  imageName: string
  rustPercent: number
  astmGrade: number
  priorityLevel: string
  classification: string
  classificationLabel: string
  dss: string
  rustExplanation?: string
  classificationExplanation?: string
  date: string
  createdAt?: string
  accountId?: string
}
