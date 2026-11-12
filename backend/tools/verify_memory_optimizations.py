"""Build-time parity checks for memory-saving code; never run in the API process."""

import numpy as np
import cv2
from sklearn.linear_model import LinearRegression

from image_quality import assess_lighting
from predictive_engine import ISOPredictiveEngine


def verify_regression() -> None:
    engine = ISOPredictiveEngine()
    rng = np.random.default_rng(42)
    days = np.arange(366).reshape(-1, 1)
    for category, slope in engine.category_slopes.items():
        noise = rng.normal(0, 0.2, size=(366, 1))
        rust = np.clip(days * slope + noise, 0, 100)
        expected = float(LinearRegression().fit(days, rust).coef_[0][0])
        np.testing.assert_allclose(engine.trained_models[category], expected, rtol=0, atol=1e-15)
        reference = ISOPredictiveEngine()
        reference.trained_models[category] = expected
        for value in np.linspace(0, 100, 201):
            for distribution, coverage in [(None, None), ("S", 0.1), ("G", 0.9), ("P", 0.5), ("H", 1.0)]:
                assert engine.analyze_scan(float(value), category, distribution, coverage) == reference.analyze_scan(
                    float(value), category, distribution, coverage
                )


def verify_lighting() -> None:
    rng = np.random.default_rng(177)
    for height, width in [(1, 1), (63, 129), (64, 128), (65, 127), (640, 1024), (2048, 3072)]:
        image = rng.integers(0, 256, (height, width, 3), dtype=np.uint8)
        lightness = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)[:, :, 0]
        expected = (
            round(float(lightness.mean()), 1),
            round(float((lightness <= 25).mean()), 3),
            round(float((lightness >= 250).mean()), 3),
        )
        actual = assess_lighting(image)
        assert (actual.mean_lightness, actual.dark_share, actual.clipped_share) == expected
    for value in [0, 15, 35, 65, 90, 150, 200, 230, 250, 255]:
        image = np.full((137, 219, 3), value, dtype=np.uint8)
        lightness = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)[:, :, 0]
        actual = assess_lighting(image)
        assert actual.mean_lightness == round(float(lightness.mean()), 1)
        assert actual.dark_share == round(float((lightness <= 25).mean()), 3)
        assert actual.clipped_share == round(float((lightness >= 250).mean()), 3)


if __name__ == "__main__":
    verify_regression()
    verify_lighting()
    print("Memory optimization parity checks passed: regression and lighting unchanged.")
