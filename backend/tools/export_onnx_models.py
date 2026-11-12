"""Build-only conversion and compatibility checks; never included in the server."""

import gc
from pathlib import Path

import cv2
import numpy as np
import onnx
import torch
from PIL import Image
from ultralytics import YOLO
from ultralytics.data.augment import classify_transforms
from ultralytics.utils import ops

from onnx_inference import OnnxModel, classification_input, native_masks, segmentation_input


def mask_contract():
    """Detect and verify installed Ultralytics pixel-rounding rules, including
    non-square padding. Fail the build if none of the supported rules matches.
    """
    rng = np.random.default_rng(98)
    prototype = rng.normal(size=(4, 16, 16)).astype(np.float32)
    weights = rng.normal(size=(3, 4)).astype(np.float32)
    fixtures = []
    for height, width in [(64, 64), (37, 64), (64, 37), (33, 64)]:
        boxes = np.array([[1.2, 2.2, width - 3.2, height - 2.2], [0, 0, width, height],
                          [width / 3, height / 3, width * .8, height * .8]], dtype=np.float32)
        expected = ops.process_mask_native(torch.from_numpy(prototype), torch.from_numpy(weights),
                                           torch.from_numpy(boxes), (height, width)).numpy()
        fixtures.append(((height, width), boxes, expected))
    candidates = []
    for scaling in ["aligned", "rounded", "legacy"]:
        for cropping in ["ceil", "round"]:
            mismatches = total = 0
            for shape, boxes, expected in fixtures:
                actual = native_masks(prototype, weights, boxes, shape, scaling, cropping)
                mismatches += np.count_nonzero(actual != expected)
                total += actual.size
            candidates.append((mismatches / total, scaling, cropping))
    error, scaling, cropping = min(candidates)
    assert error < .0005, f"Unsupported Ultralytics mask reconstruction rules: best pixel mismatch {error:.4%}"
    print(f"Mask compatibility passed: scaling={scaling} cropping={cropping} mismatch={error:.6%}", flush=True)
    return scaling, cropping


def verify_export(reference, deployed, size):
    rng = np.random.default_rng(42)
    for shape in [(size, size), (311, 512), (512, 319), (257, 384)]:
        image = rng.integers(20, 230, (*shape, 3), dtype=np.uint8)
        expected = reference.predict(source=image, imgsz=size, rect=False, conf=.15,
                                     iou=.45, retina_masks=True, verbose=False)[0]
        actual = deployed.predict(source=image, imgsz=size, conf=.15, iou=.45)[0]
        if reference.task == "classify":
            expected_input = classify_transforms(size)(Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))).numpy()[None]
            prepared = classification_input(image, size)
            np.testing.assert_allclose(prepared, expected_input, atol=1e-7, rtol=0)
            np.testing.assert_allclose(actual.probs.data, expected.probs.data.cpu().numpy(), atol=2e-4, rtol=1e-3)
        else:
            prepared, _, _ = segmentation_input(image, size)
            expected_input = reference.predictor.preprocess([image]).cpu().numpy()
            np.testing.assert_array_equal(prepared, expected_input)
            # Check every raw anchor/prototype, even if synthetic input produces
            # no detections. An empty result must not make export validation vacuous.
            with torch.inference_mode():
                raw = reference.model(torch.from_numpy(prepared))
            if isinstance(raw[0], (tuple, list)):
                # Current Ultralytics: ((predictions, prototypes), raw_dict).
                expected_predictions, expected_prototypes = raw[0]
            else:
                # Older YOLOv8: (predictions, (features, coefficients, prototypes)).
                expected_predictions = raw[0]
                expected_prototypes = raw[1]["proto"] if isinstance(raw[1], dict) else raw[1][-1]
            expected_predictions = expected_predictions.cpu().numpy()
            expected_prototypes = expected_prototypes.cpu().numpy()
            predictions, prototypes = deployed.session.run(None, {deployed.input_name: prepared})
            np.testing.assert_allclose(predictions[:, :4], expected_predictions[:, :4], atol=.02, rtol=1e-4)
            np.testing.assert_allclose(predictions[:, 4:], expected_predictions[:, 4:], atol=.002, rtol=1e-3)
            np.testing.assert_allclose(prototypes, expected_prototypes, atol=.002, rtol=1e-3)
            np.testing.assert_array_equal(actual.boxes.cls.numpy(), expected.boxes.cls.cpu().numpy())
            np.testing.assert_allclose(actual.boxes.xyxy.numpy(), expected.boxes.xyxy.cpu().numpy(), atol=.05, rtol=1e-3)
            np.testing.assert_allclose(actual.boxes.conf.numpy(), expected.boxes.conf.cpu().numpy(), atol=2e-4, rtol=1e-3)
            if expected.masks is not None:
                expected_masks = expected.masks.data.cpu().numpy().astype(bool)
                actual_masks = actual.masks.data.numpy().astype(bool)
                union = np.logical_or(expected_masks, actual_masks).sum(axis=(1, 2))
                intersection = np.logical_and(expected_masks, actual_masks).sum(axis=(1, 2))
                assert np.all(intersection / np.maximum(union, 1) >= .99), "Export mask IoU below 99%"
        print(f"ONNX compatibility passed: {reference.task} input={shape}", flush=True)


torch.set_num_threads(1)
cv2.setNumThreads(1)
scaling, cropping = mask_contract()
for filename, size, task in [("best.pt", 512, "segment"), ("metal_cls.pt", 224, "classify")]:
    checkpoint = Path("models") / filename
    reference = YOLO(str(checkpoint))
    assert reference.task == task
    exported = Path(reference.export(format="onnx", imgsz=size, opset=17, simplify=False,
                                     dynamic=False, nms=False, batch=1, device="cpu"))
    graph = onnx.load(str(exported))
    for key, value in [("metal_mask_scaling", scaling), ("metal_mask_crop", cropping)]:
        entry = graph.metadata_props.add()
        entry.key, entry.value = key, value
    onnx.checker.check_model(graph)
    onnx.save(graph, str(exported))
    del graph
    deployed = OnnxModel(exported)
    verify_export(reference, deployed, size)
    del reference, deployed
    gc.collect()
print("Both original checkpoints exported to float32 ONNX and compatibility checks passed.", flush=True)
