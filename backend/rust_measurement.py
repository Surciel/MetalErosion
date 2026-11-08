"""Pixel-level rust measurement inside the AI-detected metal surface.

Why this exists: the current segmentation model outlines a rusty object as a whole
("rust" covers the entire blade), so its rust masks cannot measure *how much* of the
surface is rusted (scans come out near 0% or near 100%). Until the model is retrained
with tight rust-patch labels, rust % is measured in two stages:

1. The AI model finds the metal surface (metal + rust masks), so background, skin,
   handles and other objects are excluded.
2. Inside that surface only, rust-coloured pixels are counted using HSV colour ranges
   (reddish-orange to brown hues with enough saturation; very dark or very bright
   pixels are excluded).

rust % = rust-coloured pixels inside the surface / surface pixels.
"""

import cv2
import numpy as np

# HSV ranges for rust (OpenCV hue is 0-179). These are the thresholds the original
# pipeline used, now applied only inside the AI-detected metal surface.
RUST_HUE_RANGES = ((0, 25), (170, 179))
RUST_MIN_SATURATION = 40
RUST_MIN_VALUE = 30
RUST_MAX_VALUE = 200
NOISE_KERNEL = np.ones((3, 3), np.uint8)  # Removes isolated single-pixel noise.

# Bounding boxes drawn on the result image: the largest rust patches only.
BOX_MIN_SURFACE_SHARE = 0.002  # A patch must cover >= 0.2% of the surface.
MAX_BOXES = 20


def colour_rust_mask(image_bgr: np.ndarray, surface_mask: np.ndarray) -> np.ndarray:
    """Boolean mask of rust-coloured pixels inside the surface (same size as image_bgr)."""
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    mask = np.zeros(surface_mask.shape, dtype=np.uint8)
    for hue_low, hue_high in RUST_HUE_RANGES:
        mask |= cv2.inRange(
            hsv,
            (hue_low, RUST_MIN_SATURATION, RUST_MIN_VALUE),
            (hue_high, 255, RUST_MAX_VALUE),
        )
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, NOISE_KERNEL)
    return (mask > 0) & surface_mask


def rust_patch_boxes(
    rust_mask: np.ndarray,
    surface_pixels: int,
    scale: float,
    width: int,
    height: int,
) -> list[int]:
    """Flattened x1,y1,x2,y2 boxes (original image pixels) around the largest rust patches."""
    if surface_pixels == 0 or not rust_mask.any():
        return []
    _, _, stats, _ = cv2.connectedComponentsWithStats(rust_mask.astype(np.uint8), connectivity=8)
    patches = [
        row
        for row in stats[1:]  # Row 0 is the background.
        if row[cv2.CC_STAT_AREA] >= BOX_MIN_SURFACE_SHARE * surface_pixels
    ]
    patches.sort(key=lambda row: row[cv2.CC_STAT_AREA], reverse=True)

    boxes: list[int] = []
    for row in patches[:MAX_BOXES]:
        x, y = row[cv2.CC_STAT_LEFT], row[cv2.CC_STAT_TOP]
        w, h = row[cv2.CC_STAT_WIDTH], row[cv2.CC_STAT_HEIGHT]
        boxes.extend(
            [
                int(np.clip(round(x / scale), 0, width)),
                int(np.clip(round(y / scale), 0, height)),
                int(np.clip(round((x + w) / scale), 0, width)),
                int(np.clip(round((y + h) / scale), 0, height)),
            ]
        )
    return boxes
