"""Offline Docker preflight with actual weights and a maximum-size synthetic image.

No remote auth, database or storage operations run. Passing this fixture does not
validate accuracy or bound every real photo's number of detection masks.
"""

import os
import resource
import sys
from unittest.mock import patch

import cv2
import numpy as np

# Import the real API/ML stack, but never initialize a remote client or use a key.
os.environ["SUPABASE_URL"] = "https://offline.invalid"
os.environ["SUPABASE_KEY"] = "offline-build-only"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "offline-build-only"
# Match the deployment's lowest detection threshold and rust measurement mode.
os.environ["MODEL_CONFIDENCE"] = "0.15"
os.environ["RUST_MEASUREMENT"] = "hybrid"
with patch("supabase.create_client"):
    import main

from memory_limits import current_rss_mib, release_predictor_inputs
from onnx_inference import native_masks


def checkpoint(stage: str) -> None:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"Inference preflight stage={stage} rss_mib={current_rss_mib()} peak_mib={peak:.1f}", flush=True)


assert main.MODEL_IMAGE_SIZE == 512 and main.INFERENCE_MAX_SIDE == 512
assert main.INFERENCE_BACKEND == "onnx"
assert not any(name in sys.modules for name in ("torch", "torchvision", "ultralytics"))
assert main.metal_classifier is not None, "Both deployment models must be tested"
checkpoint("loaded")
side = int(main.MAX_IMAGE_PIXELS ** 0.5)
for attempt in range(2):
    # Retain encoded bytes during analysis, as an upload does. Test quality checks
    # even if the textured fixture is not recognized as metal.
    image = np.random.default_rng(attempt).integers(40, 200, (side, side, 3), dtype=np.uint8)
    success, encoded = cv2.imencode(".jpg", image)
    assert success
    del image
    contents = encoded.tobytes()
    del encoded
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    main.assess_lighting(image)
    main.assess_sharpness(image)
    main.metal_probability(image)
    checkpoint(f"classified_{attempt + 1}")
    # Run segmentation even if the classifier rejects this synthetic fixture.
    segmentation = main._segment_surface(image)
    assert segmentation.surface_mask.shape == (512, 512)
    checkpoint(f"segmented_{attempt + 1}")
    if attempt == 1:
        # Synthetic images may produce zero detections. Also exercise the
        # supported 300-mask worst case, including the nonempty-mask selection
        # copy, while the largest upload and both model sessions are still live.
        coefficients = np.ones((300, 32), dtype=np.float32)
        coefficients[-1] = 0  # Force one empty mask so partial filtering allocates.
        masks = native_masks(
            np.ones((32, 128, 128), dtype=np.float32),
            coefficients,
            np.tile(np.array([0, 0, 512, 512], dtype=np.float32), (300, 1)),
            (512, 512), main.model.mask_mode, main.model.crop_mode,
        )
        retained_masks = masks[masks.any(axis=(1, 2))]
        assert retained_masks.shape == (299, 512, 512)
        checkpoint("maximum_detection_masks")
        del masks, retained_masks, coefficients
    del segmentation, image, contents
    release_predictor_inputs(main.model, main.metal_classifier)
    checkpoint(f"cleanup_{attempt + 1}")

peak_mib = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
assert peak_mib < 480, f"Free deployment lacks memory headroom: synthetic peak {peak_mib:.1f} MiB (budget 480 MiB)"
print("Inference memory preflight passed; validate a real scan on Render next.", flush=True)
