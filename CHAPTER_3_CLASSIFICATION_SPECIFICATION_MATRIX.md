# Chapter 3: Classification and Maintenance Specification Matrix

This matrix documents the classification rules and maintenance guidance currently implemented in MetalErosion. It is intended as a source for the Chapter 3 system-design and methodology sections.

> **Scope note:** The values below describe the application's current implementation. In particular, the regression rates and lighting/color thresholds are configured system rules, not independently validated field measurements. Verify the adopted ASTM D610 edition and the empirical basis for maintenance rates before presenting them as externally prescribed standards.

## 1. Rust measurement and ASTM D610 classification

| Classification/specification | Basis and implemented rule | System output | Maintenance interpretation |
|---|---|---|---|
| Analyzed surface | YOLOv26 segmentation identifies `metal` and `rust` masks. The measured surface is the union of those masks; surrounding background is excluded. | Detected metal/rust surface mask | Rust coverage is calculated for the detected asset surface, not the entire photograph. |
| Rust measurement | Default `RUST_MEASUREMENT=color`: within the detected surface, count HSV rust-colored pixels. OpenCV hue ranges are 0–25 and 170–179; minimum saturation is 40; value is 30–200. A 3x3 morphological opening removes isolated noise. | `rust % = rust-colored pixels inside surface / detected surface pixels × 100` | Pixel-color measurement helps when the model's rust segmentation outlines a whole rusty object instead of individual rust patches. Orange/red paint can be counted as rust; very dark corrosion may be missed. |
| ASTM grade 10 | Rust coverage `<= 0.01%` | Grade `10`; no distribution suffix | No action required; standard cleaning. |
| ASTM grade 9 | `> 0.01%` and `<= 0.03%` | Grade `9` | No action required; routine inspection and cleaning. |
| ASTM grade 8 | `> 0.03%` and `<= 0.1%` | Grade `8` | Clean the surface and touch up the coating at rust points. |
| ASTM grade 7 | `> 0.1%` and `<= 0.3%` | Grade `7` | Spot-clean rust points and apply touch-up primer. |
| ASTM grade 6 | `> 0.3%` and `<= 1%` | Grade `6` | Localized hand or power-tool cleaning and spot primer. |
| ASTM grade 5 | `> 1%` and `<= 3%` | Grade `5` | Localized wire-brush cleaning and spot primer. |
| ASTM grade 4 | `> 3%` and `<= 10%` | Grade `4` | Abrasive blast affected areas and apply a two-coat epoxy. |
| ASTM grade 3 | `> 10%` and `<= 16%` | Grade `3` | Complete surface stripping and heavy-duty protective coating. |
| ASTM grade 2 | `> 16%` and `<= 33%` | Grade `2` | Major structural assessment before coating. At exactly 33%, the priority rule also marks the scan critical. |
| ASTM grade 1 | `> 33%` and `<= 50%` | Grade `1` | Severe corrosion: structural assessment and replacement planning. |
| ASTM grade 0 | `> 50%` | Grade `0` | Asset condemned; immediate structural replacement. |

The backend checks the grade limits in ascending rust-percentage order. Each grade is the first maximum-percent limit that contains the observed value; grade 0 is used above 50%.

## 2. Rust distribution classification

Distribution is calculated from connected components in the measured rust mask, relative to the detected surface. The current default color-based measurement means these are components of the color-derived rust mask.

| Type | Name | Implemented classification basis | Interpretation |
|---|---|---|---|
| `S` | Spot | Default when the General, Hybrid, and Pinpoint rules do not apply. | Rust concentrated in a few larger, localized areas. |
| `G` | General | Rust is present in at least 60% of qualifying cells in an 8x8 grid over the surface bounding box. A surface cell must contain at least 5% metal; a rusted cell must have at least 1% rust coverage. | Rust is spread widely across most of the surface. |
| `P` | Pinpoint | Blobs smaller than 0.05% of surface area are pinpoints; pinpoints must account for at least 50% of total rust-blob area. | Many small, scattered rust points. |
| `H` | Hybrid | At least one spot-sized blob (at least 0.2% of surface area), at least 10 pinpoints, and pinpoints accounting for at least 5% of rust-blob area. | A combination of larger spots and pinpoints. |

Connected components smaller than four pixels are ignored. Rules are checked in this order: General, Hybrid, Pinpoint, then Spot. With no detected rust, the distribution type is null.

The displayed ASTM rating combines grade and distribution when rust exists, for example `5-S`. Grade 10 is displayed without a suffix.

## 3. Maintenance priority and regression projection

The predictive engine assigns category-specific corrosion slopes, fits a seeded linear regression to synthetic yearly control-cycle data at startup, and estimates days to 33% rust:

`days to critical = (33 - current rust percentage) / fitted category slope`

| Asset category | Configured base slope (% rust per day) | Priority use |
|---|---:|---|
| Hardware | 0.045 | Used when the scan category is Hardware. |
| Vehicles | 0.018 | Used when the scan category is Vehicles. |
| Household | 0.009 | Used when the scan category is Household. |
| Metal Walls | 0.006 | Used when the scan category is Metal Walls. |
| Unmapped category | 0.09 fallback | Used when a category has no configured fitted slope. |

| Priority | Implemented rule | Maintenance meaning |
|---|---|---|
| `Monitoring Required` | Rust is below 33%, with more than 180 projected days to reach 33%. | Continue scheduled inspection and monitoring. |
| `Elevated Priority` | Rust is below 33%, with 180 or fewer projected days to reach 33%. | Plan maintenance soon. |
| `CRITICAL` | Rust coverage is at least 33%. | Immediate attention is indicated by the system. Projected days are set to zero. |

The regression is deterministic because its random-number generator uses a fixed seed. The current rates are configured baselines and the fit uses synthetic data; they should be described as the system's prototype estimates unless validated against historical inspection data for the relevant asset categories.

## 4. Severity colors and alert behavior

The interface derives severity from ASTM grade and priority, not from a separate rust-percentage color scale.

| Severity | Rule | Color | Alert behavior |
|---|---|---|---|
| Critical | Priority is `CRITICAL` or ASTM grade is 1 or lower | Red (`#c0392b`) | Critical alert remains until acknowledged. |
| High | Priority is `Elevated Priority` or ASTM grade is 3 or lower | Orange (`#e67e22`) | Non-critical alert auto-dismisses after 8 seconds. |
| Moderate | Otherwise, ASTM grade is 6 or lower | Yellow (`#d4ac0d`) | Non-critical alert auto-dismisses after 8 seconds. |
| Low | Grades 7–9 that do not meet a higher-priority condition | Green (`#27ae60`) | Non-critical alert auto-dismisses after 8 seconds. |
| None | ASTM grade is 10 | Green (`#27ae60`) | Shows “No corrosion detected”; non-critical alert auto-dismisses after 8 seconds. |

Priority conditions take precedence in practice: for example, an `Elevated Priority` scan is high severity even if its grade would otherwise map to moderate or low.

## 5. Image-quality and input-validation specifications

| Check | Implemented threshold | System behavior |
|---|---|---|
| Very dark image | Mean LAB lightness below 35, or at least 85% of pixels have lightness `<= 25` | Rejects the scan as unusable lighting. |
| Low-light image | Mean LAB lightness below 70, unless rejected as very dark | Analyzes the scan and shows a low-light warning. |
| Overexposure warning | Mean LAB lightness above 200, or at least 25% of pixels have lightness `>= 250` | Analyzes the scan and shows an overexposure warning. |
| Very bright image | Mean LAB lightness above 230, or at least 60% of pixels have lightness `>= 250` | Rejects the scan as unusable lighting. |
| Metal/rust input validation | At least 5% of the image must be covered by detections with confidence `>= 0.5` for either the metal class or the rust class. | Rejects images without a sufficiently confident detected metal/rust surface before upload or saving. |

Lighting uses the LAB lightness channel to assess brightness separately from color. A fully rusted object can pass input validation on a sufficiently large, confident rust detection even if no metal pixels are detected.

## 6. Classification pipeline summary

1. Reject invalid or unusable-lighting images.
2. Run the existing YOLOv26 segmentation model and validate that metal or rust is detected.
3. Measure rust coverage within the detected surface using the configured rust-measurement method (color is the default).
4. Classify rust distribution as Spot, General, Pinpoint, or Hybrid.
5. Map rust percentage to an ASTM grade and append the distribution letter when applicable.
6. Estimate days to 33% rust for the asset category, assign a priority, and select the interface severity/alert.
7. Return the classification, maintenance recommendation, lighting status, and rust-patch boxes; save scan analysis fields when the database migration is applied.

## 7. Implementation references

- [backend/predictive_engine.py](backend/predictive_engine.py) — ASTM grade thresholds, remediation text, regression slopes, days-to-critical formula, and priority tiers.
- [backend/spread_analysis.py](backend/spread_analysis.py) — distribution definitions and geometric thresholds.
- [backend/rust_measurement.py](backend/rust_measurement.py) — color-based rust thresholds and patch boxes.
- [backend/image_quality.py](backend/image_quality.py) — lighting assessment thresholds.
- [backend/main.py](backend/main.py) — segmentation, validation, analysis sequence, and API responses.
- [frontend/src/utils/classificationInfo.ts](frontend/src/utils/classificationInfo.ts) — user-facing grade, distribution, priority, and lighting explanations.
- [frontend/src/utils/severity.ts](frontend/src/utils/severity.ts) — severity levels and interface colors.
- [frontend/src/components/SeverityAlert.tsx](frontend/src/components/SeverityAlert.tsx) — alert display and dismissal behavior.
