"""Environmental lighting assessment for uploaded scan images.

Brightness is measured on the L (lightness) channel of the LAB colour space, which
separates lightness from colour, so rust hues do not skew the measurement.

Statuses:
- "ok":           normal exposure.
- "low_light":    dim but usable; the scan is analysed and the UI shows a warning.
- "overexposed":  bright/glare but usable; analysed with a warning.
- "too_dark" / "too_bright": unusable; the scan is rejected before analysis.
"""

from dataclasses import dataclass

import cv2
import numpy as np

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
