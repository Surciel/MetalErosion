"""Image quality checks for uploaded scan images: file format, size, lighting, sharpness.

Lighting: brightness is measured on the L (lightness) channel of the LAB colour space, which
separates lightness from colour, so rust hues do not skew the measurement.

Statuses:
- "ok":           normal exposure.
- "low_light":    dim but usable; the scan is analysed and the UI shows a warning.
- "overexposed":  bright/glare but usable; analysed with a warning.
- "too_dark" / "too_bright": unusable; the scan is rejected before analysis.
"""

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

# Accepted upload formats, identified from the file's first bytes (the browser's
# content-type header can be wrong or forged): (extension, content type).
JPEG = (".jpg", "image/jpeg")
PNG = (".png", "image/png")
WEBP = (".webp", "image/webp")

# Photos smaller than this on their shortest side carry too little detail to analyse.
# Kept low on purpose: 7 of 96 real metal scan photos were 95 to 180 px on their shortest
# side (small web images), and a 200 px minimum rejected all of them.
MIN_IMAGE_SIDE = 64

# Sharpness = variance of the Laplacian (edge strength), measured per block on a 6x6
# grid of the photo scaled to 640 px; the 90th percentile block is used so a sharp
# subject in front of a blurred background still counts as sharp.
# Calibration on 117 real photos: the lowest score was 63; the same photos with a
# moderate blur scored under 15 (95% of them), and with a light blur around 27.
SHARPNESS_VIEW_SIDE = 640
SHARPNESS_GRID = 6
REJECT_SHARPNESS = 12.0  # Below this the photo is too blurry to analyse.
WARN_SHARPNESS = 40.0  # Below this the photo is analysed with a warning.


def detect_image_format(data: bytes) -> Optional[tuple[str, str]]:
    """Return (extension, content type) for JPEG, PNG or WebP data, else None."""
    if data[:3] == b"\xff\xd8\xff":
        return JPEG
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return PNG
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return WEBP
    return None


@dataclass(frozen=True)
class SharpnessAssessment:
    status: str  # "ok" | "slightly_blurry" | "too_blurry"
    sharpness: float

    @property
    def is_usable(self) -> bool:
        return self.status != "too_blurry"


def assess_sharpness(image_bgr: np.ndarray) -> SharpnessAssessment:
    height, width = image_bgr.shape[:2]
    scale = min(1.0, SHARPNESS_VIEW_SIDE / max(height, width))
    if scale < 1.0:
        image_bgr = cv2.resize(
            image_bgr,
            (max(1, round(width * scale)), max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    height, width = gray.shape
    block_scores = [
        laplacian[
            row * height // SHARPNESS_GRID : (row + 1) * height // SHARPNESS_GRID,
            col * width // SHARPNESS_GRID : (col + 1) * width // SHARPNESS_GRID,
        ].var()
        for row in range(SHARPNESS_GRID)
        for col in range(SHARPNESS_GRID)
    ]
    sharpness = float(np.percentile(block_scores, 90))
    if sharpness < REJECT_SHARPNESS:
        status = "too_blurry"
    elif sharpness < WARN_SHARPNESS:
        status = "slightly_blurry"
    else:
        status = "ok"
    return SharpnessAssessment(status=status, sharpness=round(sharpness, 1))

# Thresholds on the L channel (0 = black, 255 = white). Tune on real photos.
REJECT_MEAN_DARK = 35  # Average lightness below this: too dark to analyse.
WARN_MEAN_DARK = 70  # Average lightness below this: low light warning.
WARN_MEAN_BRIGHT = 200  # Average lightness above this: overexposure warning.
REJECT_MEAN_BRIGHT = 230  # Average lightness above this: too bright to analyse.
DARK_PIXEL_LEVEL = 25  # A pixel at or below this counts as crushed black.
CLIPPED_PIXEL_LEVEL = 250  # A pixel at or above this counts as blown-out white.
REJECT_DARK_SHARE = 0.85  # Share of crushed-black pixels that makes a photo unusable.
REJECT_CLIPPED_SHARE = 0.60  # Share of blown-out pixels that makes a photo unusable.
WARN_CLIPPED_SHARE = 0.25  # Share of blown-out pixels (glare) that triggers a warning.

USABLE_STATUSES = {"ok", "low_light", "overexposed"}


@dataclass(frozen=True)
class LightingAssessment:
    status: str
    mean_lightness: float
    dark_share: float
    clipped_share: float

    @property
    def is_usable(self) -> bool:
        return self.status in USABLE_STATUSES


def assess_lighting(image_bgr: np.ndarray) -> LightingAssessment:
    lightness = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)[:, :, 0]
    mean_lightness = float(lightness.mean())
    dark_share = float((lightness <= DARK_PIXEL_LEVEL).mean())
    clipped_share = float((lightness >= CLIPPED_PIXEL_LEVEL).mean())

    if mean_lightness < REJECT_MEAN_DARK or dark_share >= REJECT_DARK_SHARE:
        status = "too_dark"
    elif mean_lightness > REJECT_MEAN_BRIGHT or clipped_share >= REJECT_CLIPPED_SHARE:
        status = "too_bright"
    elif mean_lightness < WARN_MEAN_DARK:
        status = "low_light"
    elif mean_lightness > WARN_MEAN_BRIGHT or clipped_share >= WARN_CLIPPED_SHARE:
        status = "overexposed"
    else:
        status = "ok"

    return LightingAssessment(
        status=status,
        mean_lightness=round(mean_lightness, 1),
        dark_share=round(dark_share, 3),
        clipped_share=round(clipped_share, 3),
    )
