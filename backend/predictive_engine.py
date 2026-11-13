from typing import Optional

import numpy as np
from sklearn.linear_model import LinearRegression

from asset_categories import CATEGORY_RATES

# ASTM D610 rust grade scale: (maximum rusted surface %, grade, remediation protocol).
ASTM_D610_SCALE = [
    (0.01, 10, "No action required. Standard cleaning."),
    (0.03, 9, "No action required. Routine inspection and cleaning."),
    (0.1, 8, "Clean the surface and touch up the coating at the rust points."),
    (0.3, 7, "Spot clean the rust points and apply a touch-up primer."),
    (1.0, 6, "Localized hand or power tool cleaning and spot primer."),
    (3.0, 5, "Localized wire brush cleaning and spot primer."),
    (10.0, 4, "Abrasive blasting of affected areas and two-coat epoxy."),
    (16.0, 3, "Complete surface stripping and heavy-duty protective coating."),
    (33.0, 2, "Major structural assessment required prior to coating."),
    (50.0, 1, "Severe corrosion: structural assessment and replacement planning required."),
]
CONDEMNED_GRADE = 0
CONDEMNED_PROTOCOL = "ASSET CONDEMNED: Immediate structural replacement."

# Rust coverage at which an asset is treated as critical (start of ASTM grade 1).
CRITICAL_RUST_PERCENTAGE = 33.0
ELEVATED_PRIORITY_DAYS = 180

# Geometric spread scaling of the regression slope. The spread analysis measures the
# share of the metal surface grid that contains rust (0 = one concentrated area,
# 1 = rust everywhere). Rust spread over more of the surface has more active edges to
# grow from, so the projected rate is scaled linearly between these two factors.
# NOTE: the two bounds are project assumptions, not values from ISO 9223 or ASTM D610.
SPREAD_FACTOR_MIN = 0.85  # rust concentrated in a single small area
SPREAD_FACTOR_MAX = 1.30  # rust present across the whole surface


def spread_factor(coverage_ratio: Optional[float]) -> float:
    """Slope multiplier for a measured spread; 1.0 when the spread is unknown."""
    if coverage_ratio is None:
        return 1.0
    coverage = min(1.0, max(0.0, float(coverage_ratio)))
    return round(SPREAD_FACTOR_MIN + (SPREAD_FACTOR_MAX - SPREAD_FACTOR_MIN) * coverage, 3)


class ISOPredictiveEngine:
    def __init__(self):
        # 1. Baseline slope per asset category (% rust per day). The values, what they
        #    are based on and the published evidence are defined in asset_categories.py.
        self.category_slopes = dict(CATEGORY_RATES)

        self.trained_models = {}

        # Fixed seed so the fitted slopes (and every prediction) are reproducible
        # across server restarts.
        rng = np.random.default_rng(42)

        # 2. Train the OLS Linear Regression models on server startup
        for category, base_slope in self.category_slopes.items():
            days = np.arange(0, 366).reshape(-1, 1) # 365-day control cycle

            # Inject slight statistical variance for realistic data distribution
            noise = rng.normal(0, 0.2, size=(366, 1))

            # Y = mx + b (where m is base_slope, x is days)
            rust_percentage = (days * base_slope) + noise
            rust_percentage = np.clip(rust_percentage, 0, 100)

            # Scikit-Learn fits the line of best fit through the synthetic scatterplot
            model = LinearRegression()
            model.fit(days, rust_percentage)

            # Store the mathematically calculated slope for future predictions
            self.trained_models[category] = model.coef_[0][0]

    @staticmethod
    def astm_grade(current_rust_percentage: float) -> tuple[int, str]:
        """3. ASTM D610 Classification & Remediation Mapping."""
        for max_percentage, grade, protocol in ASTM_D610_SCALE:
            if current_rust_percentage <= max_percentage:
                return grade, protocol
        return CONDEMNED_GRADE, CONDEMNED_PROTOCOL

    def analyze_scan(
        self,
        current_rust_percentage,
        asset_category,
        distribution_type: Optional[str] = None,
        coverage_ratio: Optional[float] = None,
    ):
        """
        Receives the segmentation rust percentage, the UI category, the geometric
        distribution type (S/G/P/H) and the measured spread (share of the surface grid
        containing rust), returning the DSS payload.
        """
        # Fetch the specific slope (Defaulting to 0.09 if category is unmapped)
        base_slope = float(self.trained_models.get(asset_category, 0.09))

        # The measured spread scales the slope. A surface with no rust has no spread to
        # measure, and scans saved before the spread was stored have none either: both
        # keep the category slope unchanged (factor 1.0).
        factor = spread_factor(coverage_ratio) if distribution_type else 1.0
        active_slope = base_slope * factor

        grade, protocol = self.astm_grade(current_rust_percentage)

        # ASTM notation pairs the grade with the distribution letter, e.g. "5-S".
        # A grade 10 surface has no rust, so it carries no distribution letter.
        astm_rating = (
            f"{grade}-{distribution_type}"
            if distribution_type and grade < 10
            else str(grade)
        )

        # 4. Predict Timeline via Algebra (Delta X = (Target Y - Current Y) / Slope)
        if current_rust_percentage < CRITICAL_RUST_PERCENTAGE:
            percent_to_critical = CRITICAL_RUST_PERCENTAGE - current_rust_percentage
            days_to_critical = int(max(0, percent_to_critical / active_slope))

            # Assign automated DSS priority tier
            priority_tier = (
                "Monitoring Required"
                if days_to_critical > ELEVATED_PRIORITY_DAYS
                else "Elevated Priority"
            )
        else:
            days_to_critical = 0
            priority_tier = "CRITICAL"

        return {
            "astm_grade": grade,
            "astm_rating": astm_rating,
            "distribution_type": distribution_type,
            "remediation_protocol": protocol,
            "priority_tier": priority_tier,
            "days_to_critical": days_to_critical,
            "base_regression_slope": round(base_slope, 4),
            "spread_coverage": coverage_ratio if distribution_type else None,
            "spread_factor": factor,
            "active_regression_slope": round(active_slope, 4),
            # Unrounded, for the decision support timing (not sent to the client).
            "active_slope_exact": float(active_slope),
        }
