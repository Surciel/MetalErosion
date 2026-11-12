"""Run locally or at Docker build time; does not import PyTorch or the API."""

from io import BytesIO
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image

from memory_limits import (
    ImagePixelLimitError,
    InvalidImageHeaderError,
    ScanBusyError,
    SingleScanGate,
    checked_image_dimensions,
    release_predictor_inputs,
)


class MemoryLimitTests(unittest.TestCase):
    @staticmethod
    def png(width: int, height: int) -> bytes:
        output = BytesIO()
        Image.new("RGB", (width, height), "gray").save(output, format="PNG")
        return output.getvalue()

    def test_rejects_large_compressed_image_without_decoding(self):
        contents = self.png(2049, 2048)
        self.assertLess(len(contents), 100000)
        with patch.object(Image.Image, "load", side_effect=AssertionError("Full decode must not run")):
            with self.assertRaises(ImagePixelLimitError):
                checked_image_dimensions(contents, 4194304)

    def test_accepts_exact_pixel_boundary_without_decoding(self):
        contents = self.png(2048, 2048)
        with patch.object(Image.Image, "load", side_effect=AssertionError("Full decode must not run")):
            self.assertEqual(checked_image_dimensions(contents, 4194304), (2048, 2048))

    def test_rejects_invalid_header(self):
        with self.assertRaises(InvalidImageHeaderError):
            checked_image_dimensions(b"not an image", 4194304)

    def test_busy_scan_does_not_steal_or_release_active_slot(self):
        gate = SingleScanGate()
        with gate.slot():
            for _ in range(2):
                with self.assertRaises(ScanBusyError):
                    with gate.slot():
                        self.fail("A second scan must not enter")
        with gate.slot():
            pass

    def test_failed_scan_releases_capacity(self):
        gate = SingleScanGate()
        with self.assertRaisesRegex(RuntimeError, "scan failed"):
            with gate.slot():
                raise RuntimeError("scan failed")
        with gate.slot():
            pass

    def test_cleanup_preserves_weights_and_warmup(self):
        weights = object()
        predictor = SimpleNamespace(
            results=[object()], batch=object(), dataset=object(),
            plotted_img=object(), model=weights, done_warmup=True,
        )
        model = SimpleNamespace(predictor=predictor)
        release_predictor_inputs(model, None)
        self.assertEqual(predictor.results, [])
        self.assertIsNone(predictor.batch)
        self.assertIsNone(predictor.dataset)
        self.assertIsNone(predictor.plotted_img)
        self.assertIs(predictor.model, weights)
        self.assertTrue(predictor.done_warmup)


if __name__ == "__main__":
    unittest.main()
