from typing import Optional

import numpy as np
from sklearn.linear_model import LinearRegression

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


class ISOPredictiveEngine:
    def __init__(self):
        # 1. Define the ISO 9223 macro-environmental baseline slopes
        self.category_slopes = {
            "Hardware": 0.045,      # 730 days to critical (accounts for zinc/friction)
            "Vehicles": 0.018,      # 1,825 days to critical
            "Household": 0.009,     # 3,650 days to critical
            "Metal Walls": 0.006    # 5,475 days to critical
        }

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
    ):
        """
        Receives the segmentation rust percentage, the UI category and the geometric
        distribution type (S/G/P/H), returning the DSS payload.
        """
        # Fetch the specific slope (Defaulting to 0.09 if category is unmapped)
        active_slope = self.trained_models.get(asset_category, 0.09)

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
            "active_regression_slope": round(active_slope, 4)
        }
