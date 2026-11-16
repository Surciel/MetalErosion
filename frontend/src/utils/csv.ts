type Cell = string | number | null | undefined

function escapeCell(cell: Cell): string {
  const text = cell === null || cell === undefined ? "" : String(cell)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Save rows as a CSV file. The first row is the header. */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")
  // The BOM makes spreadsheet programs read the file as UTF-8.
  const blob = new Blob(["﻿", body], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
