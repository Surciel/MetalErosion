"""Small memory guards shared by the API and build-time verification."""

import ctypes
import gc
from contextlib import contextmanager
from io import BytesIO
import os
from pathlib import Path
from threading import Lock
from typing import Iterator

from PIL import Image


class ImagePixelLimitError(ValueError):
    pass


class InvalidImageHeaderError(ValueError):
    pass


class ScanBusyError(RuntimeError):
    pass


def checked_image_dimensions(contents: bytes, max_pixels: int) -> tuple[int, int]:
    """Inspect metadata without decoding the full image into an RGB array."""
    try:
        with Image.open(BytesIO(contents)) as header:
            width, height = header.size
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise InvalidImageHeaderError("The uploaded file is not a valid image.") from exc
    if width * height > max_pixels:
        raise ImagePixelLimitError(
            f"This photo is too large for this server ({width} x {height} pixels). "
            f"Resize it to at most {max_pixels:,} pixels in total and try again."
        )
    return width, height


class SingleScanGate:
    """Fail fast instead of holding several decoded photos or model calls in RAM."""

    def __init__(self) -> None:
        self._lock = Lock()

    @contextmanager
    def slot(self) -> Iterator[None]:
        if not self._lock.acquire(blocking=False):
            raise ScanBusyError("Another image is being analyzed. Try again in a few seconds.")
        try:
            yield
        finally:
            self._lock.release()


_malloc_trim = None
if os.name == "posix":
    try:
        _malloc_trim = ctypes.CDLL(None).malloc_trim
        _malloc_trim.argtypes = [ctypes.c_size_t]
        _malloc_trim.restype = ctypes.c_int
    except (AttributeError, OSError):
        pass


def release_predictor_inputs(*models: object) -> None:
    """Release previous photos/results, keeping the loaded weights and warmup."""
    for model in models:
        predictor = getattr(model, "predictor", None)
        if predictor is None:
            continue
        for attribute, value in [("results", []), ("batch", None), ("dataset", None), ("plotted_img", None)]:
            if hasattr(predictor, attribute):
                setattr(predictor, attribute, value)
    gc.collect()
    if _malloc_trim is not None:
        _malloc_trim(0)


def current_rss_mib() -> float | None:
    """Linux resident memory for stage logs; no optional monitoring dependency."""
    try:
        resident_pages = int(Path("/proc/self/statm").read_text().split()[1])
        return round(resident_pages * os.sysconf("SC_PAGE_SIZE") / 1048576, 1)
    except (OSError, ValueError, IndexError, AttributeError):
        return None
