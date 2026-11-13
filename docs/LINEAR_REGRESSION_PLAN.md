# System Prompt: MetalErosion Predictive Engine (`predictive_engine.py`)

## 1. Architectural Context
You are tasked with building the `predictive_engine.py` module for the MetalErosion system. This backend is built with FastAPI (Python) and hosted on Render. 

This engine is the final step in a daisy-chain data flow:
1. The system receives an image and an ISO 9223 environmental category (C1 to C5, CX).
2. A YOLOv8/OpenCV pipeline extracts the `current_rust_percentage`.
3. **[YOUR TASK]** This engine takes the `current_rust_percentage` and the `iso_category`, processes it through a Scikit-Learn Ordinary Least Squares (OLS) Linear Regression model, and calculates the `days_to_critical` (days until the asset reaches a 75% rust failure threshold).

## 2. Technical Requirements
*   **Library:** Must strictly use `scikit-learn` (`sklearn.linear_model.LinearRegression`).
*   **Input Parameters:** 
    *   `current_rust_percentage` (float): The current degradation state.
    *   `iso_category` (str): The environmental baseline (e.g., "C3").
*   **Output:** 
    *   `days_to_critical` (int): The projected number of days until the metal hits the critical failure threshold (default: 75.0%).

## 3. Mathematical Framework (OLS Regression)
The system calculates the degradation trend using the standard linear regression formula:
$$y = \beta_0 + \beta_1 x$$

Where:
*   $y$ = The critical failure threshold (75.0%).
*   $\beta_0$ = The `current_rust_percentage`.
*   $\beta_1$ = The environmental corrosion rate (derived from ISO 9223 mapping).
*   $x$ = The time required in days (`days_to_critical`).

To find the days to critical failure, the math resolves to:
$$x = \frac{y - \beta_0}{\beta_1}$$

## 4. Implementation Strategy for the AI Agent
Because this is a Machine Learning requirement, do not just hardcode the algebra. The script must utilize `LinearRegression().fit()`. 

Please write the Python script to follow this exact logic:
1.  **ISO Mapping:** Create a dictionary mapping the ISO 9223 categories (C1 to CX) to an estimated annual corrosion rate (e.g., percentage growth per year). 
2.  **Synthetic Data Generation:** Create a helper function that generates a small synthetic dataset of historical points (Time vs. Rust Percentage) based on the provided `current_rust_percentage` and the selected ISO rate.
3.  **Model Fitting:** Initialize `model = LinearRegression()` and use `.fit()` to train it on the synthetic dataset to establish the trend line.
4.  **Prediction:** Use the fitted model's coefficients (`model.coef_` and `model.intercept_`) to solve for $x$ (days) when $y = 75.0$.
5.  **Return:** Ensure the final output is cast to an integer so it cleanly inserts into the Supabase database.

## 5. Required Function Signature
Please expose a main asynchronous or synchronous function for the FastAPI router to call, formatted similarly to this:

```python
def calculate_days_to_critical(current_rust_percentage: float, iso_category: str, critical_threshold: float = 75.0) -> int:
    # Implementation here
    pass