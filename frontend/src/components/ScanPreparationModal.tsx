import { useEffect, useMemo, useRef, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import ReactCrop, { type Crop, type PixelCrop as ReactPixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { createCroppedImageFile, type PixelCrop } from "@/utils/cropImage"

type ScanPreparationModalProps = {
  file: File
  sourceUrl: string
  onCancel: () => void
  onConfirm: (file: File, previewUrl: string, title: string) => void
}

const MAX_TITLE_LENGTH = 120
const CROP_MODES = [
  { label: "4:3", value: "4:3", aspect: 4 / 3 },
  { label: "1:1", value: "1:1", aspect: 1 },
  { label: "16:9", value: "16:9", aspect: 16 / 9 },
  { label: "4:5", value: "4:5", aspect: 4 / 5 },
  { label: "Freeform", value: "freeform", aspect: null },
] as const

export default function ScanPreparationModal({
  file,
  sourceUrl,
  onCancel,
  onConfirm,
}: ScanPreparationModalProps) {
  const [title, setTitle] = useState(() => file.name.replace(/\.[^/.]+$/, ""))
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropMode, setCropMode] = useState("4:3")
  const [freeformCrop, setFreeformCrop] = useState<Crop>({
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  })
  const [freeformPixelCrop, setFreeformPixelCrop] = useState<ReactPixelCrop | null>(null)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [error, setError] = useState("")
  const freeformImageRef = useRef<HTMLImageElement | null>(null)

  const titleLength = useMemo(() => title.trim().length, [title])
  const selectedCropMode = CROP_MODES.find((mode) => mode.value === cropMode)
  const activeAspect = selectedCropMode?.aspect ?? 4 / 3

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPreparing) onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isPreparing, onCancel])

  const handleCropComplete = (_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }

  const handleCropModeChange = (value: string) => {
    setCropMode(value)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setFreeformCrop({ unit: "%", x: 10, y: 10, width: 80, height: 80 })
    setFreeformPixelCrop(null)
  }

  const handleConfirm = async () => {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError("Enter a name for this scan.")
      return
    }
    if (normalizedTitle.length > MAX_TITLE_LENGTH) {
      setError(`Use ${MAX_TITLE_LENGTH} characters or fewer.`)
      return
    }
    const selectedCrop = cropMode === "freeform" ? freeformPixelCrop : croppedAreaPixels
    if (!selectedCrop || selectedCrop.width < 8 || selectedCrop.height < 8) {
      setError("Choose a larger crop area before continuing.")
      return
    }

    setIsPreparing(true)
    setError("")
    try {
      let pixelCrop: PixelCrop = selectedCrop
      if (cropMode === "freeform") {
        const image = freeformImageRef.current
        if (!image || !image.complete || !image.naturalWidth || !image.width) {
          throw new Error("The crop preview is still loading. Try again in a moment.")
        }
        const scaleX = image.naturalWidth / image.width
        const scaleY = image.naturalHeight / image.height
        pixelCrop = {
          x: Math.round(selectedCrop.x * scaleX),
          y: Math.round(selectedCrop.y * scaleY),
          width: Math.round(selectedCrop.width * scaleX),
          height: Math.round(selectedCrop.height * scaleY),
        }
      }
      const croppedFile = await createCroppedImageFile(
        sourceUrl,
        pixelCrop,
        file.name,
      )
      onConfirm(croppedFile, URL.createObjectURL(croppedFile), normalizedTitle)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare the image.")
      setIsPreparing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-preparation-title"
    >
      <div className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "var(--color-header)", borderColor: "var(--color-border)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">Before analysis</p>
            <h2 id="scan-preparation-title" className="mt-1 text-xl font-semibold text-white">Prepare your scan</h2>
            <p className="mt-1 text-sm text-white/55">Name the scan and frame the metal surface you want analyzed.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={isPreparing} aria-label="Close scan preparation" className="text-2xl leading-none text-white/50 hover:text-white disabled:opacity-40">×</button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="relative min-h-[300px] overflow-hidden rounded-xl bg-black/35" style={{ minHeight: "min(52vh, 480px)" }}>
            {cropMode === "freeform" ? (
              <div className="flex h-full min-h-[300px] items-center justify-center overflow-auto p-4">
                <ReactCrop
                  crop={freeformCrop}
                  onChange={(_, percentCrop) => setFreeformCrop(percentCrop)}
                  onComplete={(pixels) => setFreeformPixelCrop(pixels)}
                  minWidth={16}
                  minHeight={16}
                  keepSelection
                  ruleOfThirds
                >
                  <img ref={freeformImageRef} src={sourceUrl} alt="Crop preview" className="block max-h-[48vh] max-w-full object-contain" />
                </ReactCrop>
              </div>
            ) : (
              <Cropper
                image={sourceUrl}
                crop={crop}
                zoom={zoom}
                aspect={activeAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                objectFit="contain"
                restrictPosition
              />
            )}
          </div>

          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50">Crop shape</span>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Crop shape">
                {CROP_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    role="radio"
                    aria-checked={cropMode === mode.value}
                    onClick={() => handleCropModeChange(mode.value)}
                    disabled={isPreparing}
                    className="rounded-md border px-2 py-2 text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{
                      borderColor: cropMode === mode.value ? "#f0ede8" : "var(--color-border)",
                      background: cropMode === mode.value ? "rgba(255,255,255,0.1)" : "transparent",
                      color: cropMode === mode.value ? "#f0ede8" : "rgba(240,237,232,0.6)",
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-white/40">{cropMode === "freeform" ? "Drag the edges or corners to resize the crop freely." : "Choose a standard shape for the crop frame."}</span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50">Scan name</span>
              <input
                value={title}
                onChange={(event) => { setTitle(event.target.value); setError("") }}
                maxLength={MAX_TITLE_LENGTH}
                autoFocus
                className="rounded-lg border bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/60"
                style={{ borderColor: "var(--color-border)" }}
                placeholder="e.g. Workshop wrench"
              />
              <span className="text-right text-[10px] text-white/35">{titleLength}/{MAX_TITLE_LENGTH}</span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50">Zoom</span>
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="accent-red-300" />
              <span className="text-xs text-white/40">Drag the image to position the crop.</span>
            </label>

            {error && <p className="text-sm text-red-200" role="alert">{error}</p>}

            <div className="mt-auto flex flex-col gap-2 sm:flex-row md:flex-col">
              <button type="button" onClick={onCancel} disabled={isPreparing} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white disabled:opacity-40" style={{ borderColor: "var(--color-border)" }}>Cancel</button>
              <button type="button" onClick={() => void handleConfirm()} disabled={isPreparing} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-50" style={{ background: "var(--color-accent)" }}>{isPreparing ? "Preparing..." : "Start scan"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
