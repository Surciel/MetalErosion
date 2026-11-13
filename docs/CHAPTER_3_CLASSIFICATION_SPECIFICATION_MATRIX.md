# Chapter 3: Classification and Maintenance Specification Matrix

This matrix documents the classification rules and the Decision Support System (DSS) rules as implemented in MetalErosion (RustScan) on 13 November 2026. It is a source for the Chapter 3 system-design and methodology sections. Every table uses the same four columns as Table 9 of the paper, so each can be pasted in directly. Table numbers after Table 9 are placeholders; renumber them to fit the paper.

> **Scope note.** The values describe the application's implementation. Three kinds of value appear, and the paper should keep them apart:
> - **From a published standard:** the ASTM D610 grade limits and distribution types, the ISO 4628-3 Ri 3 level (1%), and the SSPC-PA Guide 5 threshold (10 to 15%).
> - **Project rules:** the 33% critical level, the 180-day priority limit, the spread factor bounds, the split between spot repair and full recoat, the re-scan interval, and the image-quality thresholds.
> - **Project assumptions:** the four asset category rates. The published evidence supports their order, not their absolute values.
>
> The maintenance standards cited were written for painted structural steel. Applying their thresholds to tools, vehicles and household items is an adaptation and should be stated as one.

## 1. ASTM D610 grade and maintenance classification (replaces Table 9)

*Table 9. ASTM D610 Surface Rust Coverage and Maintenance Classification Rule Base*

| Classification / Specification | Implemented System Rule | System Output Grade | Maintenance Interpretation |
|---|---|---|---|
| ASTM Grade 10 | Rust coverage ≤ 0.01% | Grade 10 (no distribution letter) | Level 1: No repair needed; keep up routine care. |
| ASTM Grade 9 | > 0.01% and ≤ 0.03% | Grade 9 | Level 1: No repair needed; keep up routine care. |
| ASTM Grade 8 | > 0.03% and ≤ 0.1% | Grade 8 | Level 2: Touch up the rust spots (hand tool cleaning, primer, matching topcoat). |
| ASTM Grade 7 | > 0.1% and ≤ 0.3% | Grade 7 | Level 2: Touch up the rust spots. |
| ASTM Grade 6 | > 0.3% and ≤ 1% | Grade 6 | Level 2: Touch up the rust spots. |
| ASTM Grade 5 | > 1% and ≤ 3% | Grade 5 | Level 3 when the distribution is Spot: repair the rusted areas. Level 4 when it is General, Pinpoint or Hybrid: repair the rusted areas and recoat the whole surface. |
| ASTM Grade 4 | > 3% and ≤ 10% | Grade 4 | Level 3 when Spot; Level 4 when General, Pinpoint or Hybrid (as Grade 5). |
| ASTM Grade 3 | > 10% and ≤ 16% | Grade 3 | Level 5: Remove all rust and old coating, then recoat fully. |
| ASTM Grade 2 | > 16% and ≤ 33% | Grade 2 | Level 5: Remove all rust and old coating, then recoat fully. At exactly 33% the scan is critical (Level 6). |
| ASTM Grade 1 | > 33% and ≤ 50% | Grade 1 | Level 6: Critical; have it assessed for replacement. |
| ASTM Grade 0 | > 50% | Grade 0 | Level 6: Critical; have it assessed for replacement. |

The grade limits are checked in ascending order; the grade is the first limit that contains the measured value, and grade 0 is used above 50%. The displayed rating joins the grade and the distribution letter, for example `5-S`. Grade 10 has no letter.

## 2. Decision Support System rule base

The DSS is rule-based. It does not use generated text: the same scan always produces the same answer, and every line of the answer traces to a rule in `backend/decision_support.py`. The answer is rebuilt from stored scan values each time, so nothing extra is saved and older scans receive it too.

*Table 10. Decision Support System Action Level Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Action Level 1 | Rust coverage ≤ 0.03% (ASTM grade 10 to 9) | "No repair needed. Keep up routine care." | No repair. Keep the surface clean and dry. Basis: ASTM D610, no rust or minute traces. |
| Action Level 2 | > 0.03% and ≤ 1% (grade 8 to 6) | "Touch up the rust spots." | Hand tool cleaning of each spot (SSPC-SP 2), primer, matching topcoat. Basis: below ISO 4628-3 Ri 3 (1% rusted area), the point treated as first major maintenance under ISO 12944. |
| Action Level 3 | > 1% and ≤ 10% (grade 5 to 4), distribution Spot (S) or not recorded | "Repair the rusted areas." | Power tool cleaning of each area to sound metal (SSPC-SP 3), primer, topcoat over the repaired areas. Basis: Ri 3 passed, so maintenance is due; under 10%, so spot repair is still economical (SSPC-PA Guide 5). |
| Action Level 4 | > 1% and ≤ 10% (grade 5 to 4), distribution General (G), Pinpoint (P) or Hybrid (H) | "Repair the rusted areas and recoat the whole surface." | As Level 3, then a full topcoat over the whole surface. Basis: same band, but the rust is scattered, so spot-by-spot repair would cover most of the surface. Project rule. |
| Action Level 5 | > 10% and < 33% (grade 3 to 2) | "Remove all rust and old coating, then recoat fully." | Strip the whole surface (commercial blast, SSPC-SP 6 / ISO 8501-1 Sa 2, or power tools to bare metal), inspect the bare metal, apply a full coating system. Basis: SSPC-PA Guide 5, removal and replacement is preferred at 10 to 15% deterioration. |
| Action Level 6 | ≥ 33% (grade 1 to 0, and grade 2 at exactly 33%) | "Critical: have it assessed for replacement." | Stop relying on the item, have it physically inspected, replace it if the metal is thinned, perforated or cracked. Basis: the system's critical level; a photo cannot show loss of metal. |

*Table 11. Decision Support System Timing and Confidence Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Next-level threshold | Level 1 and 2: 1%. Level 3 and 4: 10%. Level 5: 33%. Level 6: none. | Rust % at which the answer moves to the next level | The point at which the required work becomes larger. |
| Act within | Days = (next-level threshold − current rust %) ÷ effective corrosion rate, for Levels 2 to 5. For Level 5 this equals the days to critical. | "Act within N days"; "Act now" at Level 6; not shown at Level 1 | Deadline for the current, smaller repair. |
| Scan again in | Half of the days to the next-level threshold, not less than 30 days and not more than 365 days. Not given at Level 6. | "Scan again in N days" | Re-inspection interval. Project rule; the yearly limit follows annual inspection practice. |
| If this is left | The next level and the days until the projection reaches its threshold | One sentence naming the consequence | States the cost of delay. |
| Confidence: normal | Lighting status is `ok` and no quality warning | No flag | The photo met the quality checks. |
| Confidence: reduced | Lighting status is `low_light` or `overexposed`, or the scan has a `slightly_blurry` or `small_surface` warning | "Confidence reduced by photo quality" | Retake the photo before acting on the result. |
| Stated limits | Shown on every answer | Three statements | (1) The result is from visible surface rust in one photo and cannot measure pitting depth or metal loss. (2) The timing uses the category's assumed rate, not a measured one. (3) In testing, the ASTM grade matched the labelled photos exactly 73% of the time and within one grade 88% of the time. |

*Table 12. Decision Support System Maintenance Steps by Asset Category*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Hardware | Category chosen by the user; steps selected by action level | Steps worded for tools, fasteners and fittings | L1: wipe dry, light oil, dry storage. L2: wire brush or abrasive pad, then oil or rust-preventive spray. L3 and L4: power wire brush or rust-remover soak, protect bare steel, check moving parts and threads. L5: strip to bare metal, check for pitting and cracks, replace if it carries load and is pitted. L6: stop using it and replace it. |
| Vehicles | As above | Steps worded for body panels and frames | L1: wash and dry, touch up stone chips, clear drain holes. L2: sand spots to clean metal, anti-rust primer, touch-up paint. L3: grind to bright metal, check for holes, rust converter or etch primer, repaint the areas. L4: as L3, then respray the whole panel. L5: strip and inspect the panel, replace perforated metal, full respray, check frame and brake lines if the rust is underneath. L6: inspection by a mechanic or body shop before further driving if structural parts are affected. |
| Household | As above | Steps worded for appliances, furniture, gates and railings | L1: wipe dry, avoid standing water, touch up chips. L2: hand cleaning, primer, matching enamel. L3: power tool cleaning, primer, a coating suited to the item. L4: as L3, then recoat the whole item. L5: strip to bare metal, check joints and welds, full coating system, replace items that hold weight, gas or water if pitted. L6: stop using items that hold weight, gas or water until inspected. |
| Metal Walls | As above | Steps worded for roofing and cladding sheet | L1: clear debris so water drains, check fasteners and cut edges. L2: wire-brush spots, zinc-rich primer, roofing paint. L3: power wire brush, replace rusted fasteners, zinc-rich primer, roofing paint on the areas. L4: as L3, then recoat the whole sheet. L5: remove all rust and failed coating, replace perforated sheets, full roofing paint system. L6: do not walk on or load the sheet; inspect and replace perforated or thin sheets. |
| No category recorded | Scans saved before the category was stored | Generic steps | The same six levels with wording that fits any steel item. |

The steps per category are general good practice, not taken from a standard. The named SSPC grades state how thoroughly the surface is cleaned.

*Table 13. Sources of the Decision Support System Rules*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| ASTM D610 / SSPC-VIS 2 | Grade limits and distribution types | Grade 10 to 0; S, G, P, H | Standard used directly. |
| ISO 4628-3 | Ri 3 = 1% rusted area | Level 2 to Level 3 boundary | Table value confirmed from the standard's sample pages. |
| ISO 12944 | Durability is the time to first major maintenance | Supports the 1% boundary | The link to Ri 3 was taken from secondary summaries. Check the standard's wording before quoting it. |
| SSPC-PA Guide 5 | Removal and replacement preferred at 10 to 15% deterioration | Level 4 to Level 5 boundary | Read as cited in Sondag, S. (2016), "MnDOT's Approach to Improving Bridge Maintenance Painting Operations", *Journal of Protective Coatings and Linings*, January 2016. The guide itself was not read; cite it as "as cited in". |
| SSPC-SP 2, SP 3, SP 6; ISO 8501-1 | Cleaning grade named in the steps | Wording of the steps | Equivalents taken from the Sherwin-Williams surface preparation guide. |

## 3. Rust distribution classification

Distribution is calculated from connected rust areas in the measured rust mask, relative to the detected surface.

*Table 14. Rust Distribution Classification Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| General | Checked first. Rust is present in at least 60% of the surface cells of an 8×8 grid. A cell counts as surface when at least 5% of it is metal, and as rusted when at least 1% of its surface is rust. | `G` | Rust spread across most of the surface. Selects Action Level 4 in the 1% to 10% band. |
| Hybrid | Checked second. At least one spot-sized area (≥ 0.2% of the surface), at least 10 pinpoints, and pinpoints making up at least 5% of the rust area. | `H` | Larger spots together with scattered points. Selects Action Level 4. |
| Pinpoint | Checked third. Areas smaller than 0.05% of the surface are pinpoints; pinpoints make up at least 50% of the rust area. | `P` | Many small scattered points. Selects Action Level 4. |
| Spot | Used when none of the above applies. | `S` | Rust in a few localized areas. Selects Action Level 3. |
| No rust | No rust area of at least four pixels | No letter | Not applicable. |

## 4. Maintenance priority and regression projection

`effective rate = category rate × spread factor`
`days to critical = (33 − current rust %) ÷ effective rate`

The category rate is the slope of a linear regression fitted at start-up to a seeded, synthetic 365-day series generated from the configured rate, so results are the same on every run.

*Table 15. Asset Category and Regression Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Hardware | Chosen by the user. Rate 0.045% of the surface per day. | Rust-free to 33% in about 2 years | Tools, fasteners and fittings with thin or no coating. Set fastest. |
| Vehicles | Rate 0.018% per day | About 5 years | Painted, galvanized body panels. About 3 times faster than Metal Walls, in line with zinc coating thickness (7 to 10 µm against 21 µm per side). |
| Household | Rate 0.009% per day | About 10 years | Coated items in and around the home. Slower than Vehicles because sheltered atmospheres are less corrosive (ISO 9223). |
| Metal Walls | Rate 0.006% per day | About 15 years | Galvanized or pre-painted building sheet. Set slowest. |
| Category validation | The category is required, with no default. Only the four names are accepted. | Scan refused with "category required" | Prevents a silent or mistyped category from setting the rate. |
| Category not recorded | Scans saved before the category was stored | Hardware rate; shown as "Not recorded" | The owner can set the category afterwards; the prediction is recalculated. |
| Spread factor | 0.85 + 0.45 × coverage, where coverage is the share of surface grid cells that contain rust. 1.00 when there is no rust or no stored coverage. | ×0.85 (concentrated) to ×1.30 (whole surface) | Wider spread shortens the projected days. The two bounds are project rules. |

The four rates are project assumptions. No published source gives a rust-area growth rate per day by type of object; the sources support the order of the categories only.

*Table 16. Maintenance Priority Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Monitoring Required | Rust below 33% and more than 180 projected days to 33% | `Monitoring Required` | Continue scheduled inspection. |
| Elevated Priority | Rust below 33% and 180 or fewer projected days to 33% | `Elevated Priority` | Plan maintenance soon. |
| Critical | Rust coverage at least 33% | `CRITICAL`; days to critical set to 0 | Immediate attention. |

## 5. Severity colors and alert behavior

*Table 17. Severity and Alert Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Critical | Priority is `CRITICAL` or ASTM grade is 1 or lower | Red (`#c0392b`) | Alert with a tone; stays until acknowledged. |
| High | Priority is `Elevated Priority` or ASTM grade is 3 or lower | Orange (`#e67e22`) | Alert with a tone; closes by itself after 8 seconds. |
| Moderate | Otherwise, ASTM grade is 6 or lower | Yellow (`#d4ac0d`) | Alert with a tone; closes by itself after 8 seconds. |
| Low | Grades 7 to 9 that meet no higher condition | Green (`#27ae60`) | Alert with a tone; closes by itself after 8 seconds. |
| None | ASTM grade 10 | Green (`#27ae60`) | Shows "No corrosion detected". |

## 6. Detection and rust measurement

The values below are the tested configuration set in `backend/.env` (`METAL_CLASSIFIER_THRESHOLD=0.4`, `MODEL_CONFIDENCE=0.15`, `RUST_MEASUREMENT=hybrid`). The code's built-in defaults differ (0.5, 0.25, `color`); the reported test results apply to the tested configuration only.

*Table 18. Hierarchical Detection and Measurement Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| Stage 1: metal classifier | YOLO26s-cls model with classes `metal` and `not_metal`. The photo passes when the metal probability is at least 0.4. | Pass, or rejection "not metal" | Non-metal photos are stopped before any measurement. |
| Stage 2: surface segmentation | YOLO26s-seg model with classes `metal` and `rust`, detection confidence 0.15, image size 1024. The measured surface is the union of the metal and rust masks. | Surface mask | Background is excluded from the measurement. |
| Stage 2 validation | Detections with confidence of at least 0.5, for metal or for rust, must cover at least 5% of the photo. | Pass, or rejection "not metal" | A fully rusted object passes on a confident rust detection alone. |
| Stage 3: rust measurement (hybrid) | Rust-colored pixels inside the surface (HSV hue 0 to 25 and 170 to 179, saturation at least 40, value 30 to 200, 3×3 opening), counted only within 2% of the image's longer side of an area the model marked as rust. | `rust % = counted rust pixels ÷ surface pixels × 100` | Rust is measured against the metal surface, not the whole photo. |
| Stage 4: ASTM grade | Table 9 | Grade 10 to 0 | |
| Stage 5: distribution | Table 14 | S, G, P or H | |
| Stage 6: priority and DSS | Tables 10, 11, 15 and 16 | Priority, days to critical, DSS answer | |

Results on the 105-image test split (81 metal, 24 non-metal) with the tested configuration: metal accepted 74 of 81, non-metal rejected 21 of 24, ASTM grade exact 73.0%, within one grade 87.8%.

## 7. Image-quality and input-validation specifications

Checks run in the order listed. Rejected scans are not saved; the reason is logged for the admin analytics.

*Table 19. Input Validation Rule Base*

| Classification / Specification | Implemented System Rule | System Output | Maintenance Interpretation |
|---|---|---|---|
| File type and size | Image content type; not empty; at most 15 MB (also checked in the browser before upload) | Rejected | |
| Scan title | Required; at most 120 characters | Rejected | |
| Asset category | One of the four category names | Rejected, "category required" | |
| Real file format | JPEG, PNG or WebP, identified from the file's first bytes | Rejected, "unsupported format" | The browser's stated type is not trusted. |
| Minimum size | Shortest side at least 64 pixels | Rejected, "too small" | |
| Very dark | Mean LAB lightness below 35, or at least 85% of pixels at lightness 25 or lower | Rejected, "poor lighting" | |
| Very bright | Mean LAB lightness above 230, or at least 60% of pixels at lightness 250 or higher | Rejected, "poor lighting" | |
| Low light | Mean LAB lightness below 70 | Analyzed with a warning | Lowers DSS confidence. |
| Overexposed | Mean LAB lightness above 200, or at least 25% of pixels at lightness 250 or higher | Analyzed with a warning | Lowers DSS confidence. |
| Too blurry | Sharpness below 12. Sharpness is the variance of the Laplacian per block on a 6×6 grid of the photo scaled to 640 pixels; the 90th-percentile block is used. | Rejected, "too blurry" | |
| Slightly blurry | Sharpness below 40 | Analyzed with a warning | Lowers DSS confidence. |
| Not metal | Stage 1 or Stage 2 validation of Table 18 fails | Rejected, "not metal" | |
| Small surface | Detected surface covers less than 15% of the photo | Analyzed with a warning | Lowers DSS confidence. |

## 8. Classification pipeline summary

1. Check the file, title and asset category; identify the real file format; check the image size.
2. Check lighting and sharpness; reject unusable photos and flag borderline ones.
3. Stage 1: the metal classifier accepts or rejects the photo.
4. Stage 2: the segmentation model locates the metal and the rust; reject the photo if no confident surface is found.
5. Stage 3: measure rust coverage inside the surface with the hybrid method.
6. Stage 4 and 5: assign the ASTM grade and the distribution type, and join them into the rating.
7. Stage 6: scale the category rate by the spread factor, project the days to 33%, and assign the priority.
8. Build the DSS answer: action level, steps for the asset category, timing, reasons, limits and sources.
9. Return the result and save the scan.

## 9. Implementation references

- [backend/decision_support.py](../backend/decision_support.py): DSS action levels, steps per category, timing rules, limits and sources.
- [backend/predictive_engine.py](../backend/predictive_engine.py): ASTM grade limits, spread factor, days-to-critical formula and priority tiers.
- [backend/asset_categories.py](../backend/asset_categories.py): the four categories, their rates and the published evidence.
- [backend/spread_analysis.py](../backend/spread_analysis.py): distribution definitions and thresholds.
- [backend/rust_measurement.py](../backend/rust_measurement.py): rust color thresholds and patch boxes.
- [backend/image_quality.py](../backend/image_quality.py): file format, size, lighting and sharpness thresholds.
- [backend/main.py](../backend/main.py): classifier, segmentation, validation order, hybrid measurement and API responses.
- [frontend/src/components/DecisionSupportPanel.tsx](../frontend/src/components/DecisionSupportPanel.tsx): the DSS panel.
- [frontend/src/utils/severity.ts](../frontend/src/utils/severity.ts) and [frontend/src/components/SeverityAlert.tsx](../frontend/src/components/SeverityAlert.tsx): severity levels, colors and alert behavior.
