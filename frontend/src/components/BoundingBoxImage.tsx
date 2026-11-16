import { useEffect, useState, type KeyboardEvent } from "react"

type BoundingBoxImageProps = {
  src: string
  alt: string
  coordinates: number[]
  className?: string
  imageClassName?: string
  expandable?: boolean
  /** Show "No corrosion regions detected" when there are no boxes (off for small thumbnails). */
  emptyLabel?: boolean
}

export default function BoundingBoxImage({
  src,
  alt,
  coordinates,
  className = "",
  imageClassName = "",
  expandable = false,
  emptyLabel = true,
}: BoundingBoxImageProps) {
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [expanded, setExpanded] = useState(false)
  const [hoveredBox, setHoveredBox] = useState<number | null>(null)
  const [selectedBox, setSelectedBox] = useState<number | null>(null)
  const boxes = Array.from({ length: Math.floor(coordinates.length / 4) }, (_, index) => {
    const offset = index * 4
    const [x1, y1, x2, y2] = coordinates.slice(offset, offset + 4)
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }).filter((box) => box.width > 0 && box.height > 0)

  useEffect(() => {
    if (!expanded) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [expanded])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!expandable || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    setExpanded(true)
  }

  const activeBox = hoveredBox ?? selectedBox

  const renderTooltip = () =>
    activeBox !== null && boxes[activeBox] ? (
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-red-200/40 bg-black/85 px-3 py-2 text-xs leading-5 text-white shadow-lg">
        <p className="font-semibold text-red-200">
          Corrosion region {activeBox + 1}
        </p>
        <p>
          Coordinates: ({boxes[activeBox].x}, {boxes[activeBox].y}) to (
          {boxes[activeBox].x + boxes[activeBox].width},{" "}
          {boxes[activeBox].y + boxes[activeBox].height})
        </p>
        <p>
          Size: {boxes[activeBox].width} × {boxes[activeBox].height}px
        </p>
      </div>
    ) : null

  const renderBoxes = (interactive: boolean) =>
    naturalSize.width > 0 && boxes.length > 0 ? (
      <svg
        aria-label={`${boxes.length} detected corrosion region${boxes.length === 1 ? "" : "s"}`}
        className={`pointer-events-none absolute inset-0 h-full w-full${interactive ? " pointer-events-auto" : ""}`}
        viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
        preserveAspectRatio={interactive ? "xMidYMid meet" : "xMidYMid slice"}
      >
        {boxes.map((box, index) => (
          <rect
            key={`${box.x}-${box.y}-${box.width}-${box.height}-${index}`}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill={
              activeBox === index
                ? "rgba(96, 165, 250, 0.18)"
                : "rgba(37, 99, 235, 0.1)"
            }
            stroke={activeBox === index ? "#bfdbfe" : "#3b82f6"}
            strokeWidth={
              (activeBox === index ? 1.4 : 0.9) *
              (Math.max(naturalSize.width, naturalSize.height) / 180)
            }
            vectorEffect="non-scaling-stroke"
            tabIndex={interactive ? 0 : -1}
            aria-label={`Corrosion region ${index + 1}`}
            pointerEvents={interactive ? "all" : "none"}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedBox(index)
            }}
            onMouseEnter={() => setHoveredBox(index)}
            onMouseLeave={() => {
              setHoveredBox(null)
              setSelectedBox(null)
            }}
            onFocus={() => setHoveredBox(index)}
            onBlur={() => setHoveredBox(null)}
          />
        ))}
      </svg>
    ) : null

  return (
    <>
      <div
        className={`relative ${className}${expandable ? " cursor-zoom-in" : ""}`}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-label={expandable ? `Expand ${alt}` : undefined}
        onClick={() => expandable && setExpanded(true)}
        onKeyDown={handleKeyDown}
      >
      <img
        src={src}
        alt={alt}
        className={imageClassName}
        loading="lazy"
        decoding="async"
        onLoad={(event) =>
          setNaturalSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
      {renderBoxes(false)}
      {renderTooltip()}
      {emptyLabel && boxes.length === 0 && (
        <p className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white/75">
          No corrosion regions detected for this scan
        </p>
      )}
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Expanded image: ${alt}`}
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={src}
              alt={alt}
              className="block max-h-[90vh] max-w-[95vw] object-contain"
              style={{
                width: naturalSize.width || undefined,
                height: naturalSize.height || undefined,
              }}
              />
              {renderBoxes(true)}
              {renderTooltip()}
              {boxes.length > 0 && (
                <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 text-xs text-white/80">
                  Hover over or click a highlighted region for details
                </p>
              )}
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-lg text-white hover:bg-black"
              aria-label="Close expanded image"
              onClick={() => setExpanded(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}
