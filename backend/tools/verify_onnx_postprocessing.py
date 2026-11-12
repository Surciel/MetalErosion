"""Focused checks that also run locally without Torch, OpenCV or ONNX Runtime."""

import unittest

import numpy as np

from onnx_inference import classification_input, non_maximum_suppression


class PostprocessingTests(unittest.TestCase):
    def test_same_class_overlap_is_suppressed_but_other_class_survives(self):
        boxes = np.array([[0, 0, 10, 10]] * 3, dtype=np.float32)
        result = non_maximum_suppression(boxes, np.array([.9, .8, .7]), np.array([0, 0, 1]), .45)
        np.testing.assert_array_equal(result, [0, 2])

    def test_nonoverlapping_boxes_are_returned_by_confidence(self):
        boxes = np.array([[0, 0, 10, 10], [20, 20, 30, 30]], dtype=np.float32)
        result = non_maximum_suppression(boxes, np.array([.5, .9]), np.array([0, 0]), .45)
        np.testing.assert_array_equal(result, [1, 0])

    def test_no_detections_and_detection_limit(self):
        empty = non_maximum_suppression(np.empty((0, 4)), np.empty(0), np.empty(0), .45)
        self.assertEqual(empty.size, 0)
        boxes = np.array([[0, 0, 10, 10], [20, 20, 30, 30]], dtype=np.float32)
        limited = non_maximum_suppression(boxes, np.array([.5, .9]), np.array([0, 0]), .45, max_det=1)
        np.testing.assert_array_equal(limited, [1])

    def test_classifier_preserves_rgb_order_and_float_normalization(self):
        image = np.zeros((400, 800, 3), dtype=np.uint8)
        image[:] = [20, 100, 200]  # BGR
        tensor = classification_input(image, 224)
        self.assertEqual(tensor.shape, (1, 3, 224, 224))
        self.assertEqual(tensor.dtype, np.float32)
        np.testing.assert_allclose(tensor[0, :, 100, 100], np.array([200, 100, 20]) / 255, atol=1e-7)


if __name__ == "__main__":
    unittest.main()
