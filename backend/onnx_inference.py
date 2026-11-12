"""CPU inference for the bundled YOLO exports without importing PyTorch.

The small result adapter implements only the fields used by main.py. Export-time
checks compare preprocessing, scores, boxes and mask reconstruction to Ultralytics.
"""

import ast
import math
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image


class ArrayResult:
    def __init__(self, array):
        self.array = array

    def cpu(self):
        return self

    def numpy(self):
        return self.array


class Boxes:
    def __init__(self, coordinates, scores, classes):
        self.xyxy = ArrayResult(coordinates)
        self.conf = ArrayResult(scores)
        self.cls = ArrayResult(classes)

    def __len__(self):
        return len(self.conf.array)


def classification_input(image, size):
    """PIL bilinear shortest-edge resize, center crop, BGR-to-RGB and [0,1]."""
    height, width = image.shape[:2]
    if width <= height:
        dimensions = (size, int(size * height / width))
    else:
        dimensions = (int(size * width / height), size)
    # Resize BGR bytes first to avoid a full-resolution RGB copy of the upload.
    resized = Image.fromarray(image).resize(dimensions, Image.Resampling.BILINEAR)
    left = round((dimensions[0] - size) / 2)
    top = round((dimensions[1] - size) / 2)
    crop = np.asarray(resized.crop((left, top, left + size, top + size)))
    return np.ascontiguousarray(crop[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255


def segmentation_input(image, size):
    import cv2

    height, width = image.shape[:2]
    ratio = min(size / height, size / width)
    resized_width, resized_height = round(width * ratio), round(height * ratio)
    pad_x = round((size - resized_width) / 2 - 0.1)
    pad_y = round((size - resized_height) / 2 - 0.1)
    resized = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    square = np.full((size, size, 3), 114, dtype=np.uint8)
    square[pad_y:pad_y + resized_height, pad_x:pad_x + resized_width] = resized
    tensor = np.ascontiguousarray(square[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255
    return tensor, ratio, (pad_x, pad_y)


def non_maximum_suppression(boxes, scores, classes, threshold, max_det=300):
    """Greedy score-ordered, class-aware suppression; no Torch/torchvision import."""
    order = np.argsort(-scores, kind="stable")[:30000]
    selected = []
    areas = np.maximum(boxes[:, 2] - boxes[:, 0], 0) * np.maximum(boxes[:, 3] - boxes[:, 1], 0)
    while order.size and len(selected) < max_det:
        chosen = int(order[0])
        selected.append(chosen)
        rest = order[1:]
        low = np.maximum(boxes[chosen, :2], boxes[rest, :2])
        high = np.minimum(boxes[chosen, 2:], boxes[rest, 2:])
        overlap = np.maximum(high - low, 0).prod(axis=1)
        iou = overlap / np.maximum(areas[chosen] + areas[rest] - overlap, 1e-7)
        order = rest[(classes[rest] != classes[chosen]) | (iou <= threshold)]
    return np.asarray(selected, dtype=np.int64)


def native_masks(prototypes, coefficients, boxes, shape, mode="aligned", crop_mode="ceil"):
    """Reconstruct one mask at a time; keep only the binary mask stack in RAM.

    Export probes choose the installed Ultralytics version's scaling/crop rules.
    This avoids silently adopting different pixel rounding after an upgrade.
    """
    import cv2

    count, (height, width) = len(coefficients), shape
    channels, mask_height, mask_width = prototypes.shape
    masks = np.empty((count, height, width), dtype=np.uint8)
    factor = 1
    if mode == "aligned":
        gain = min(4 * mask_height / height, 4 * mask_width / width)
        missing = (4 * mask_height - max(round(height * gain), 1)) | (4 * mask_width - max(round(width * gain), 1))
        factor = 4 // math.gcd(4, missing | (missing // 2))
    scaled_height, scaled_width = factor * mask_height, factor * mask_width
    gain = min(scaled_height / height, scaled_width / width)
    if mode == "legacy":
        pad_x, pad_y = (scaled_width - width * gain) / 2, (scaled_height - height * gain) / 2
        left, top = int(pad_x), int(pad_y)
        right, bottom = int(scaled_width - pad_x), int(scaled_height - pad_y)
    else:
        content_width, content_height = max(round(width * gain), 1), max(round(height * gain), 1)
        left = round((scaled_width - content_width) / 2 - 0.1)
        top = round((scaled_height - content_height) / 2 - 0.1)
        right, bottom = left + content_width, top + content_height
    flattened = prototypes.reshape(channels, -1)
    for index, (weights, box) in enumerate(zip(coefficients, boxes)):
        logits = (weights @ flattened).reshape(mask_height, mask_width)
        if factor != 1:
            logits = cv2.resize(logits, (scaled_width, scaled_height), interpolation=cv2.INTER_LINEAR)
        enlarged = cv2.resize(logits[top:bottom, left:right], (width, height), interpolation=cv2.INTER_LINEAR)
        masks[index] = enlarged > 0
        bounds = np.rint(box) if crop_mode == "round" and count < 50 else np.ceil(box)
        x1, y1, x2, y2 = bounds.astype(int)
        x1, x2 = np.clip([x1, x2], 0, width)
        y1, y2 = np.clip([y1, y2], 0, height)
        masks[index, :y1] = 0
        masks[index, y2:] = 0
        masks[index, :, :x1] = 0
        masks[index, :, x2:] = 0
    return masks


class OnnxModel:
    def __init__(self, path):
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        options.enable_mem_pattern = False
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_EXTENDED
        self.session = ort.InferenceSession(str(Path(path)), sess_options=options, providers=["CPUExecutionProvider"])
        metadata = self.session.get_modelmeta().custom_metadata_map
        self.task = metadata["task"]
        self.names = {int(key): value for key, value in ast.literal_eval(metadata["names"]).items()}
        self.input_name = self.session.get_inputs()[0].name
        dimensions = self.session.get_inputs()[0].shape
        if dimensions[:2] != [1, 3] or dimensions[2] != dimensions[3] or not isinstance(dimensions[2], int):
            raise RuntimeError("Deployment requires a fixed, square, batch-one ONNX export.")
        self.size = dimensions[2]
        if self.task not in ("classify", "segment"):
            raise RuntimeError(f"Unsupported ONNX task: {self.task}")
        self.mask_mode = metadata.get("metal_mask_scaling", "aligned")
        self.crop_mode = metadata.get("metal_mask_crop", "ceil")

    def predict(self, source, imgsz, conf=0.25, iou=0.45, retina_masks=True, verbose=False):
        if imgsz != self.size:
            raise ValueError(f"This ONNX export requires imgsz={self.size}, received {imgsz}.")
        if self.task == "classify":
            tensor = classification_input(source, self.size)
            probabilities = self.session.run(None, {self.input_name: tensor})[0][0]
            return [SimpleNamespace(probs=SimpleNamespace(data=probabilities))]
        if not retina_masks:
            raise ValueError("Only native-resolution segmentation masks are supported.")
        tensor, ratio, _ = segmentation_input(source, self.size)
        outputs = self.session.run(None, {self.input_name: tensor})
        prediction, prototypes = outputs
        candidates = prediction[0].T
        class_count = len(self.names)
        if candidates.shape[1] != 4 + class_count + prototypes.shape[1]:
            raise RuntimeError("Unsupported segmentation export output layout.")
        scores_by_class = candidates[:, 4:4 + class_count]
        classes = scores_by_class.argmax(axis=1)
        scores = scores_by_class.max(axis=1)
        valid = scores > conf
        candidates, scores, classes = candidates[valid], scores[valid], classes[valid]
        coordinates = np.empty((len(candidates), 4), dtype=np.float32)
        coordinates[:, :2] = candidates[:, :2] - candidates[:, 2:4] / 2
        coordinates[:, 2:] = candidates[:, :2] + candidates[:, 2:4] / 2
        chosen = non_maximum_suppression(coordinates, scores, classes, iou)
        coordinates, scores, classes = coordinates[chosen], scores[chosen], classes[chosen]
        coefficients = candidates[chosen, 4 + class_count:]
        height, width = source.shape[:2]
        # Match scale_boxes' coordinate rounding, which is computed from the
        # original shape rather than the already-rounded resized dimensions.
        coordinates[:, [0, 2]] -= round((self.size - width * ratio) / 2 - .1)
        coordinates[:, [1, 3]] -= round((self.size - height * ratio) / 2 - .1)
        coordinates /= ratio
        coordinates[:, [0, 2]] = coordinates[:, [0, 2]].clip(0, width)
        coordinates[:, [1, 3]] = coordinates[:, [1, 3]].clip(0, height)
        masks = native_masks(prototypes[0], coefficients, coordinates, (height, width), self.mask_mode, self.crop_mode)
        # Ultralytics drops detections whose reconstructed mask is empty.
        retained = masks.any(axis=(1, 2))
        if not retained.all():
            coordinates, scores, classes, masks = coordinates[retained], scores[retained], classes[retained], masks[retained]
        return [SimpleNamespace(boxes=Boxes(coordinates, scores, classes), masks=SimpleNamespace(data=ArrayResult(masks)) if len(masks) else None)]
