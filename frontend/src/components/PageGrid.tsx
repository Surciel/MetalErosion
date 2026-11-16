// 12-col grid: columns up to 60px with 16px gutters, centered (896px at most).
// Columns shrink on narrower screens; below 768px every block spans the full width (index.css).
export default function PageGrid({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`page-grid ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, minmax(0, 60px))",
        gap: "16px",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {children}
    </div>
  )
}
