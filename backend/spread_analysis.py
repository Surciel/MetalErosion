"""Geometric spread analysis: ASTM D610 rust distribution type.

ASTM D610 pairs every rust grade with a distribution letter, e.g. "5-S":
- S (Spot):     rust concentrated in a few larger, localized areas.
- G (General):  rust spread across most of the surface.
- P (Pinpoint): rust as many very small, scattered points.
- H (Hybrid):   a mix of spot rust and pinpoint rust on the same surface.

The type is derived from the geometry of the segmented rust mask, measured relative to
the detected metal surface:
1. Connected components of the rust mask give the number and size of rust blobs.
2. Blobs smaller than PINPOINT_MAX_BLOB_SHARE of the surface count as pinpoints;
   blobs at least SPOT_MIN_BLOB_SHARE of the surface count as spots.
3. The surface's bounding box is split into a GRID_SIZE x GRID_SIZE grid; the share of
   surface cells that contain rust measures how widely the rust is spread.
"""

from typing import Any, Optional

import cv2
import numpy as np

GRID_SIZE = 8
MIN_CELL_SURFACE_SHARE = 0.05  # A grid cell counts as surface if >= 5% of it is metal.
MIN_CELL_RUST_SHARE = 0.01  # A surface cell counts as rusted if >= 1% of its surface is rust.
MIN_BLOB_PIXELS = 4  # Ignore single-pixel mask noise.
PINPOINT_MAX_BLOB_SHARE = 0.0005  # Blob < 0.05% of the surface: pinpoint.
SPOT_MIN_BLOB_SHARE = 0.002  # Blob >= 0.2% of the surface: spot.
GENERAL_MIN_COVERAGE = 0.60  # Rust in >= 60% of surface cells: general.
PINPOINT_MIN_AREA_SHARE = 0.50  # Pinpoints are >= 50% of rust area: pinpoint.
HYBRID_MIN_PINPOINT_COUNT = 10  # Hybrid needs at least this many pinpoints...
HYBRID_MIN_PINPOINT_AREA_SHARE = 0.05  # ...making up at least 5% of rust area.

DISTRIBUTION_NAMES = {
    "S": "Spot",
    "G": "General",
    "P": "Pinpoint",
    "H": "Hybrid",
}


def _grid_coverage(rust_mask: np.ndarray, surface_mask: np.ndarray) -> float:
    ys, xs = np.nonzero(surface_mask)
    if ys.size == 0:
        return 0.0
    top, bottom = ys.min(), ys.max() + 1
    left, right = xs.min(), xs.max() + 1
    row_edges = np.linspace(top, bottom, GRID_SIZE + 1).astype(int)
    col_edges = np.linspace(left, right, GRID_SIZE + 1).astype(int)

    surface_cells = 0
    rusted_cells = 0
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            y0, y1 = row_edges[row], row_edges[row + 1]
            x0, x1 = col_edges[col], col_edges[col + 1]
            if y1 <= y0 or x1 <= x0:
                continue
            cell_surface = surface_mask[y0:y1, x0:x1]
            cell_surface_pixels = int(cell_surface.sum())
            if cell_surface_pixels < MIN_CELL_SURFACE_SHARE * cell_surface.size:
                continue
            surface_cells += 1
            cell_rust_pixels = int((rust_mask[y0:y1, x0:x1] & cell_surface).sum())
            if cell_rust_pixels >= MIN_CELL_RUST_SHARE * cell_surface_pixels:
                rusted_cells += 1
    return rusted_cells / surface_cells if surface_cells else 0.0


def classify_distribution(
    rust_mask: np.ndarray, surface_mask: np.ndarray
) -> dict[str, Any]:
    """Return the ASTM D610 distribution type and the geometry behind it."""
    rust_mask = rust_mask & surface_mask
    surface_pixels = int(surface_mask.sum())
    rust_pixels = int(rust_mask.sum())
    empty: dict[str, Any] = {
        "type": None,
        "blob_count": 0,
        "pinpoint_count": 0,
        "spot_count": 0,
        "coverage_ratio": 0.0,
        "largest_blob_share": 0.0,
        "pinpoint_area_share": 0.0,
    }
    if surface_pixels == 0 or rust_pixels == 0:
        return empty

    _, _, stats, _ = cv2.connectedComponentsWithStats(
        rust_mask.astype(np.uint8), connectivity=8
    )
    areas = stats[1:, cv2.CC_STAT_AREA]  # Row 0 is the background.
    areas = areas[areas >= MIN_BLOB_PIXELS]
    if areas.size == 0:
        return empty

    blob_shares = areas / surface_pixels
    pinpoints = areas[blob_shares < PINPOINT_MAX_BLOB_SHARE]
    spot_count = int((blob_shares >= SPOT_MIN_BLOB_SHARE).sum())
    total_blob_area = int(areas.sum())
    pinpoint_area_share = float(pinpoints.sum() / total_blob_area)
    largest_blob_share = float(areas.max() / total_blob_area)
    coverage_ratio = _grid_coverage(rust_mask, surface_mask)

    distribution_type: Optional[str]
    if coverage_ratio >= GENERAL_MIN_COVERAGE:
        distribution_type = "G"
    elif (
        spot_count > 0
        and pinpoints.size >= HYBRID_MIN_PINPOINT_COUNT
        and pinpoint_area_share >= HYBRID_MIN_PINPOINT_AREA_SHARE
    ):
        distribution_type = "H"
    elif pinpoint_area_share >= PINPOINT_MIN_AREA_SHARE:
        distribution_type = "P"
    else:
        distribution_type = "S"

    return {
        "type": distribution_type,
        "blob_count": int(areas.size),
        "pinpoint_count": int(pinpoints.size),
        "spot_count": spot_count,
        "coverage_ratio": round(coverage_ratio, 3),
        "largest_blob_share": round(largest_blob_share, 3),
        "pinpoint_area_share": round(pinpoint_area_share, 3),
    }
