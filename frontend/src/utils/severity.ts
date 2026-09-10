export function severityColor(rustPercent: number): string {
  if (rustPercent >= 60) return "#c0392b"
  if (rustPercent >= 30) return "#e67e22"
  return "#27ae60"
}
