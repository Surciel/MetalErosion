import { useRef, useState } from "react"
import PageGrid from "@/components/PageGrid"
import type { View } from "@/types"

export default function LandingPage({
  onNavigate,
}: {
  onNavigate: (v: View) => void
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUploadClick = () => onNavigate("login")

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Title bar — full width */}
      <header
        className="px-8 py-4"
        style={{ background: "var(--color-header)" }}
      >
        <PageGrid>
          <div
            className="flex items-center gap-3"
            style={{ gridColumn: "1 / -1" }}
          >
            <svg
              viewBox="0 0 32 32"
              className="w-7 h-7 flex-shrink-0"
              fill="none"
            >
              <circle cx="16" cy="16" r="13" fill="#8fa87a" fillOpacity="0.3" />
              <path
                d="M9 20 C10.5 13, 14.5 10, 16 9 C17.5 10, 21.5 13, 23 20 C20 23, 12 23, 9 20Z"
                fill="#c0392b"
                fillOpacity="0.85"
              />
              <circle
                cx="16"
                cy="14.5"
                r="3.5"
                fill="#e8ddd0"
                fillOpacity="0.9"
              />
            </svg>
            <span className="text-white font-bold text-lg tracking-tight">
              RustScan
            </span>
          </div>
        </PageGrid>
      </header>

      {/* Hero — two-column grid layout */}
      <main className="flex-1 flex items-center py-16 px-4">
        <PageGrid>
          {/* Left: cols 1–5 */}
          <div className="flex flex-col gap-6" style={{ gridColumn: "1 / 6" }}>
            <div>
              <h1 className="text-4xl font-bold text-white leading-tight">
                Detect Rust.
                <br />
                <span style={{ color: "var(--color-muted)" }}>
                  Before It Spreads.
                </span>
              </h1>
              <p className="mt-4 text-white/60 text-sm leading-relaxed">
                Upload any image of a metal surface and get an instant rust
                percentage score, severity classification, and a repair
                recommendation — powered by machine learning.
              </p>
            </div>

            <div className="flex items-center gap-5 mt-2">
              <button
                onClick={() => onNavigate("login")}
                className="px-7 py-3 rounded-lg font-semibold text-white text-sm transition-all"
                style={{ background: "var(--color-btn)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--color-btn-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "var(--color-btn)")
                }
              >
                Login
              </button>
              <button
                onClick={() => onNavigate("signup")}
                className="text-sm text-white/50 hover:text-white underline underline-offset-4 transition-colors"
              >
                Create an account
              </button>
            </div>
          </div>

          {/* Right: cols 7–12 (upload zone) */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              onNavigate("login")
            }}
            onClick={handleUploadClick}
            className="flex flex-col items-center justify-center gap-4 rounded-2xl cursor-pointer transition-all duration-200 py-16 px-8 text-center border-2 border-dashed"
            style={{
              gridColumn: "7 / 13",
              background: dragging
                ? "var(--color-surface-2)"
                : "var(--color-card)",
              borderColor: dragging ? "#f0ede8" : "var(--color-border)",
            }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "var(--color-btn)" }}
            >
              <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
                <path
                  d="M20 10 L20 28 M12 18 L20 10 L28 18"
                  stroke="#e8ddd0"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="8"
                  y="30"
                  width="24"
                  height="2.5"
                  rx="1.25"
                  fill="#e8ddd0"
                  fillOpacity="0.5"
                />
              </svg>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleUploadClick()
              }}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm transition-all"
              style={{ background: "var(--color-btn)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--color-btn-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--color-btn)")
              }
            >
              Upload
            </button>
            <p className="text-white/40 text-xs">or drop an image</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadClick}
            />
          </div>
        </PageGrid>
      </main>
    </div>
  )
}
