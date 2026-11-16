"""Trend of one asset: how fast its rust is growing, measured from repeated inspections.

A single scan can only use the assumed rate for its exposure environment. Once the same
asset has been inspected several times, the growth between inspections is measured with
an ordinary least-squares line (rust % against days) and takes over from the assumption.

THE RULES (project rules, stated here so they can be defended or changed in one place)
- Inspections less than MIN_SPACING_HOURS apart count once: a retake on the same visit
  is not a second observation of growth.
- A measured rate needs at least MIN_POINTS inspections spanning MIN_SPAN_DAYS or more.
  Below that the assumed rate is used and labelled as assumed.
- From MIN_POINTS inspections the fitted slope is blended with the assumed rate, with
  weight (N - 2) / 3 capped at 1. Three inspections trust the fit one third; five or
  more trust it fully. A line through three points is too easily bent by one bad photo
  to be trusted alone.
- A fitted slope of zero or less is reported as "no growth measured". No date is
  projected from it, because the model has no way to project rust that is not growing.
- The 95% interval of the slope is reported so the user can see how firm the fit is.

The caller decides which inspections belong to the trend (same measurement method, and
only those after the asset was last recoated); see inventory.asset_condition.
"""

from datetime import datetime
from typing import Optional

import numpy as np
from scipy import stats
from sklearn.linear_model import LinearRegression

MIN_SPACING_HOURS = 24
MIN_POINTS = 3
MIN_SPAN_DAYS = 7
# Inspections needed before the fitted slope is used on its own.
FULL_WEIGHT_POINTS = 5

ASSUMED = "assumed"
MEASURED = "measured"
NO_GROWTH = "no_growth"


def _spaced(points: list[tuple[datetime, float]]) -> list[tuple[datetime, float]]:
    """Drop inspections taken less than MIN_SPACING_HOURS after the previous kept one."""
    kept: list[tuple[datetime, float]] = []
    for moment, rust in sorted(points, key=lambda point: point[0]):
        if not kept or (moment - kept[-1][0]).total_seconds() >= MIN_SPACING_HOURS * 3600:
            kept.append((moment, rust))
    return kept


def fit_trend(points: list[tuple[datetime, float]], assumed_rate: float) -> dict:
    """The rate to project with for one asset, and where it comes from.

    `points` are (inspection time, rust %) pairs in any order. `assumed_rate` is the
    rate the latest scan would use on its own (environment rate x spread factor), in
    rust % per day.
    """
    usable = _spaced(points)
    count = len(usable)
    span_days = (usable[-1][0] - usable[0][0]).total_seconds() / 86400 if count >= 2 else 0.0
    result = {
        "source": ASSUMED,
        "inspections": len(points),
        "usable_inspections": count,
        "span_days": round(span_days, 1),
        "assumed_rate": round(float(assumed_rate), 5),
        "rate_used": round(float(assumed_rate), 5),
        "fitted_rate": None,
        "fitted_rate_low": None,
        "fitted_rate_high": None,
        "r_squared": None,
        "blend_weight": 0.0,
        "intercept": None,
        "first_inspection": usable[0][0].isoformat() if usable else None,
    }
    if count < MIN_POINTS or span_days < MIN_SPAN_DAYS:
        return result

    start = usable[0][0]
    days = np.array([(moment - start).total_seconds() / 86400 for moment, _ in usable])
    rust = np.array([value for _, value in usable], dtype=float)

    model = LinearRegression()
    model.fit(days.reshape(-1, 1), rust)
    slope = float(model.coef_[0])
    intercept = float(model.intercept_)
    predicted = model.predict(days.reshape(-1, 1))
    residual = float(((rust - predicted) ** 2).sum())
    total = float(((rust - rust.mean()) ** 2).sum())
    r_squared = 1.0 - residual / total if total > 0 else 1.0

    # 95% interval of the slope: slope +/- t * standard error, with N - 2 degrees of freedom.
    spread_x = float(((days - days.mean()) ** 2).sum())
    low: Optional[float] = None
    high: Optional[float] = None
    if count > 2 and spread_x > 0:
        standard_error = (residual / (count - 2) / spread_x) ** 0.5
        margin = float(stats.t.ppf(0.975, count - 2)) * standard_error
        low, high = slope - margin, slope + margin

    result.update(
        fitted_rate=round(slope, 5),
        fitted_rate_low=round(low, 5) if low is not None else None,
        fitted_rate_high=round(high, 5) if high is not None else None,
        r_squared=round(r_squared, 3),
        intercept=round(intercept, 3),
    )
    if slope <= 0:
        result.update(source=NO_GROWTH, rate_used=0.0)
        return result

    weight = min(1.0, (count - 2) / (FULL_WEIGHT_POINTS - 2))
    blended = weight * slope + (1.0 - weight) * float(assumed_rate)
    result.update(source=MEASURED, blend_weight=round(weight, 2), rate_used=round(blended, 5))
    return result
