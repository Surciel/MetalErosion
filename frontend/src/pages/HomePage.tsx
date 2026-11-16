import { useState, useRef, useCallback, useEffect } from "react"
import Header from "@/components/Header"
import SideMenu from "@/components/SideMenu"
import PageGrid from "@/components/PageGrid"
import ScanPreparationModal from "@/components/ScanPreparationModal"
import type { ScanDetails, ScanOptions, View } from "@/types"

export default function HomePage({
  username,
  isAdmin = false,
  onUpload,
  scanOptions,
  optionsError,
  onNavigate,
}: {
  username: string
  isAdmin?: boolean
  onUpload: (file: File, url: string, title: string, details: ScanDetails) => void
  scanOptions: ScanOptions
  optionsError?: string
  onNavigate: (v: View) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingUrl, setPendingUrl] = useState("")

  useEffect(() => {
    return () => {
      if (pendingUrl.startsWith("blob:")) URL.revokeObjectURL(pendingUrl)
    }
  }, [pendingUrl])

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return
      if (pendingUrl.startsWith("blob:")) URL.revokeObjectURL(pendingUrl)
      setPendingFile(file)
      setPendingUrl(URL.createObjectURL(file))
    },
    [onUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)" }}
    >
      <Header
        username={username}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        menuOpen={menuOpen}
      />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
      />

      <main className="flex-1 flex items-center py-16 px-4">
        <PageGrid>
          {/* cols 3–10: 8-column centered upload area */}
          <div style={{ gridColumn: "3 / 11" }}>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer transition-all duration-200 py-24 px-8 text-center border-2 border-dashed"
              style={{
                background: dragging
                  ? "var(--color-surface-2)"
                  : "var(--color-card)",
                borderColor: dragging ? "#f0ede8" : "var(--color-border)",
              }}
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "var(--color-btn)" }}
              >
                <svg viewBox="0 0 48 48" className="w-12 h-12" fill="none">
                  <path
                    d="M24 14 L24 34 M14 24 L24 14 L34 24"
                    stroke="#e8ddd0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect
                    x="10"
                    y="36"
                    width="28"
                    height="3"
                    rx="1.5"
                    fill="#e8ddd0"
                    fillOpacity="0.5"
                  />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white text-base leading-snug">
                  Drop a photo of the steel element here
                </p>
                <p className="text-white/50 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                  Even light, in focus, with the steel filling most of the
                  frame. You choose the asset it belongs to next.
                </p>
              </div>
              <span
                className="text-xs px-4 py-2 rounded-full font-medium"
                style={{ background: "var(--color-btn)", color: "#e8ddd0" }}
              >
                Browse files
              </span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) processFile(e.target.files[0])
              }}
            />
          </div>
        </PageGrid>
      </main>
      {pendingFile && pendingUrl && (
        <ScanPreparationModal
          file={pendingFile}
          sourceUrl={pendingUrl}
          scanOptions={scanOptions}
          optionsError={optionsError}
          onCancel={() => {
            URL.revokeObjectURL(pendingUrl)
            setPendingFile(null)
            setPendingUrl("")
          }}
          onConfirm={(scanFile, previewUrl, title, details) => {
            URL.revokeObjectURL(pendingUrl)
            setPendingFile(null)
            setPendingUrl("")
            onUpload(scanFile, previewUrl, title, details)
          }}
        />
      )}
    </div>
  )
}
