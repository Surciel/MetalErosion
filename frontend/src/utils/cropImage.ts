export type PixelCrop = {
  x: number
  y: number
  width: number
  height: number
}

export async function createCroppedImageFile(
  sourceUrl: string,
  pixelCrop: PixelCrop,
  originalName: string,
): Promise<File> {
  const image = await loadImage(sourceUrl)
  const sourceCrop = clampCrop(pixelCrop, image.naturalWidth, image.naturalHeight)
  if (sourceCrop.width < 8 || sourceCrop.height < 8) {
    throw new Error("The selected crop is too small. Choose a larger area.")
  }
  const canvas = document.createElement("canvas")
  const maxDimension = 2400
  const scale = Math.min(
    1,
    maxDimension / Math.max(sourceCrop.width, sourceCrop.height),
  )
  const outputWidth = Math.max(1, Math.round(sourceCrop.width * scale))
  const outputHeight = Math.max(1, Math.round(sourceCrop.height * scale))

  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Your browser could not prepare the cropped image.")

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(
    image,
    sourceCrop.x,
    sourceCrop.y,
    sourceCrop.width,
    sourceCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  const blob = await canvasToBlob(canvas)
  const baseName = originalName.replace(/\.[^/.]+$/, "") || "scan"
  return new File([blob], `${baseName}-cropped.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })
}

function clampCrop(
  crop: PixelCrop,
  imageWidth: number,
  imageHeight: number,
): PixelCrop {
  const x = Math.max(0, Math.min(Math.round(crop.x), imageWidth - 1))
  const y = Math.max(0, Math.min(Math.round(crop.y), imageHeight - 1))
  const width = Math.max(1, Math.min(Math.round(crop.width), imageWidth - x))
  const height = Math.max(1, Math.min(Math.round(crop.height), imageHeight - y))
  return { x, y, width, height }
}

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("The selected image could not be loaded."))
    image.src = sourceUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("The cropped image could not be created."))
      },
      "image/jpeg",
      0.9,
    )
  })
}
