// 12-col grid: 60px columns, 16px gutters, centered — 896px total width
export default function PageGrid({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 60px)",
        gap: "16px",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {children}
    </div>
  )
}
