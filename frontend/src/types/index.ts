export type View = "landing" | "login" | "signup" | "home" | "calculating" | "results" | "rust-info" | "classification-info" | "history" | "history-detail"

export interface ScanResult {
  id: string
  imageUrl: string
  imageName: string
  rustPercent: number
  classification: string
  classificationLabel: string
  dss: string
  rustExplanation: string
  classificationExplanation: string
  date: string
}
