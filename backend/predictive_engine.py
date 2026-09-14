import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

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
        
        # 2. Train the OLS Linear Regression models on server startup
        for category, base_slope in self.category_slopes.items():
            days = np.arange(0, 366).reshape(-1, 1) # 365-day control cycle
            
            # Inject slight statistical variance for realistic data distribution
            noise = np.random.normal(0, 0.2, size=(366, 1))
            
            # Y = mx + b (where m is base_slope, x is days)
            rust_percentage = (days * base_slope) + noise
            rust_percentage = np.clip(rust_percentage, 0, 100)
            
            # Scikit-Learn fits the line of best fit through the synthetic scatterplot
            model = LinearRegression()
            model.fit(days, rust_percentage)
            
            # Store the mathematically calculated slope for future predictions
            self.trained_models[category] = model.coef_[0][0]

    def analyze_scan(self, current_rust_percentage, asset_category):
        """
        Receives the YOLOv8 percentage and UI category, returning the DSS payload.
        """
        # Fetch the specific slope (Defaulting to 0.09 if category is unmapped)
        active_slope = self.trained_models.get(asset_category, 0.09)
        
        # 3. ASTM D610 Classification & Remediation Mapping
        if current_rust_percentage <= 0.01:
            grade = 10
            protocol = "No action required. Standard cleaning."
        elif current_rust_percentage <= 3.0:
            grade = 5
            protocol = "Localized wire brush cleaning and spot primer."
        elif current_rust_percentage <= 10.0:
            grade = 4
            protocol = "Abrasive blasting of affected areas and two-coat epoxy."
        elif current_rust_percentage <= 16.0:
            grade = 3
            protocol = "Complete surface stripping and heavy-duty protective coating."
        elif current_rust_percentage <= 33.0:
            grade = 2
            protocol = "Major structural assessment required prior to coating."
        else:
            grade = 1 
            protocol = "ASSET CONDEMNED: Immediate structural replacement."

        # 4. Predict Timeline via Algebra (Delta X = (Target Y - Current Y) / Slope)
        if grade > 1:
            percent_to_critical = 33.0 - current_rust_percentage
            days_to_critical = int(max(0, percent_to_critical / active_slope))
            
            # Assign automated DSS priority tier
            priority_tier = "Monitoring Required" if days_to_critical > 180 else "Elevated Priority"
        else:
            days_to_critical = 0
            priority_tier = "CRITICAL"

        return {
            "astm_grade": grade,
            "remediation_protocol": protocol,
            "priority_tier": priority_tier,
            "days_to_critical": days_to_critical,
            "active_regression_slope": round(active_slope, 4)
        }