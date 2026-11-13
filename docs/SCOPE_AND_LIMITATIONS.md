# MetalErosion: Scope and Limitations

## Purpose and evidence basis

This document defines the scope and limitations of the MetalErosion system for use in the research paper. It summarizes behavior supported by the current project documentation and implementation. Where the proposed paper description differs from the implementation, the difference is called out so that the paper does not describe planned or assumed behavior as completed functionality.

## Scope of the study

### System purpose

MetalErosion is a web-based system for estimating visible corrosion on a metal surface from a user-submitted, two-dimensional image. Its purpose is to support inspection by automating image screening, surface/rust analysis, corrosion grading, and maintenance triage. It is a decision-support tool; it does not replace an in-person inspection or an engineer's structural assessment.

### Functional scope

The current system includes the following functions:

1. **Image submission and screening.** An authenticated user submits a still image and scan title. The backend checks the upload format, file size, image dimensions, lighting, sharpness, and whether a metal/rust surface can be detected. Unusable images may be rejected; some imperfect but usable images receive quality warnings.
2. **Surface and corrosion analysis.** A YOLO segmentation model identifies metal and rust regions. In the default configuration, the system measures rust-colored pixels within the detected surface mask, rather than calculating the area of YOLO bounding boxes. It also derives rust-patch bounding boxes for display.
3. **Severity and maintenance guidance.** The system maps the estimated rust percentage to an ASTM D610 grade and remediation text. It also uses an asset-category regression rate and measured rust distribution/spread, when available, to estimate time to a configured critical corrosion threshold and assign a priority tier.
4. **Results and record management.** The system presents analysis results and provides authenticated users with saved scan history, including scan-title editing and deletion.
5. **Account and administrative functions.** Supabase Auth manages account sessions. Protected backend endpoints provide profile-backed account information, admin account and recovery-log operations, and scan metrics/analytics. The system does not currently persist account deactivation status; its status endpoint rejects that operation.

### Asset and input scope

The system is intended for photographs of visible, localized metal surfaces. The configured predictive engine recognizes the categories `Hardware`, `Vehicles`, `Household`, and `Metal Walls`; the analysis endpoint defaults to `Hardware`. The code confirms these categories, but does not by itself establish the exact composition or representativeness of the model's training dataset. Any paper claim about specific dataset objects (for example, nuts and bolts, roofing sheets, or hand tools) should be supported by the study's dataset documentation and evaluation records.

Inputs are two-dimensional digital images in JPEG, PNG, or WebP format, with a maximum upload size of 15 MB and a minimum of 64 pixels on the shortest side. The system is designed to analyze a discernible metal surface in the frame; its validation rules require a sufficiently large metal/rust detection, and surfaces occupying less than 15% of the image may be flagged as small.

### Technical scope

The implemented application uses:

- React, Vite, and TypeScript for the browser interface.
- Python and FastAPI for protected API operations and analysis orchestration.
- Ultralytics YOLO segmentation and OpenCV-based image processing.
- A Python predictive engine for grade mapping and maintenance-priority estimates.
- Supabase Auth, PostgreSQL-backed tables, and Supabase Storage for authentication and persistence.

The repository's deployment documentation describes Vercel, Render, and Supabase as the intended deployment topology. These providers are deployment choices, not part of the corrosion-estimation method itself.

## Limitations

### Image and surface limitations

- Results depend on the submitted image and on the surface being visible and sufficiently represented in the frame. Extreme viewing angles, occlusion, glare, poor lighting, blur, low resolution, or a very small surface can reduce reliability or cause the scan to be rejected.
- The system uses image color and segmentation to estimate visible rust. In its default color-measurement mode, reddish/orange paint or other rust-like colors can be counted as rust, while very dark, low-saturation, or otherwise atypical corrosion may be missed. These are consequences of the configured HSV thresholds and image-based method.
- The analysis represents a two-dimensional view. It does not measure corrosion depth, remaining wall thickness, material loss through the section, internal corrosion, load-bearing capacity, or structural integrity.
- The system cannot reliably distinguish superficial discoloration or flash rust from deep pitting or structurally consequential corrosion based only on the presented image.
- No 3D depth sensor, volumetric scanner, or multi-view reconstruction is part of the current system.

### Model and measurement limitations

- The segmentation model depends on its training data and learned visual characteristics. Performance on asset types, coatings, environments, camera conditions, or corrosion appearances not represented in training may differ. The exact generalizability should be established through evaluation, not assumed from the implementation.
- Rust percentage is not computed from the area of generated bounding boxes in the default implementation. It is computed from rust-colored pixels inside the model-detected surface mask. Patch boxes are generated separately from connected components in that measured rust mask and are principally a visualization output.
- Therefore, statements that the system uses a single-class YOLO object detector and estimates corrosion solely from 2D bounding-box area do not describe the current implementation. The backend requires a segmentation model with `metal` and `rust` classes.
- Image-quality and color thresholds are configured heuristics. They screen or classify inputs but cannot guarantee that every accepted image is suitable or that every rejected image is unsuitable.
- The implementation may optionally use a separate whole-image metal classifier if its model file is available. The segmentation-based surface validation remains part of the pipeline.

### Classification and prediction limitations

- The ASTM D610 grade is produced by mapping the system's estimated rust percentage to configured percentage thresholds. It is an image-derived estimate and should not be presented as a laboratory measurement or as proof of formal ASTM conformity.
- Maintenance time estimates use category-specific rates fitted from synthetic data generated at backend startup. The configured rates are project assumptions, not empirically established service-life forecasts for every real asset or environment.
- Consequently, the projected days to a critical threshold and the resulting priority tier are decision-support estimates. They should not be interpreted as guaranteed corrosion-growth rates or as a substitute for inspection history, environmental exposure data, material/coating specifications, or engineering judgment.
- A scan's asset category influences prediction, but the analysis endpoint currently defaults to `Hardware`; the implemented user workflow should be checked before the paper claims that users select among all categories for each scan.
- The configured distribution labels and spread adjustment are algorithmic descriptors and project assumptions. They do not independently establish a physical corrosion-growth mechanism.

### Operational and evaluation limitations

- The system is an image-based screening and decision-support application, not an end-to-end structural health monitoring system. It does not include continuous sensor telemetry, automated field inspections, or engineering certification.
- Persistence and some optional analysis fields depend on the external Supabase schema, storage configuration, and applied migrations. These managed-service settings are outside the application repository and must be confirmed for a particular deployment.
- Account deactivation is not supported by the confirmed profile schema. Administrative account and recovery-log functions are limited to the operations currently implemented by the backend.
- This document does not establish a model accuracy rate, field reliability level, or statistical significance. Such claims require documented test data, evaluation protocols, ground-truth labels, and results.

## Recommended paper wording

The following paragraphs are aligned with the verified implementation and may be adapted for the paper.

### Scope

> This study focuses on the development of MetalErosion, a web-based decision-support system for estimating visible corrosion from user-submitted images of localized metal surfaces. The application screens uploaded images for format, size, lighting, sharpness, and detectable metal surface; applies a YOLO-based segmentation model and image-processing procedures to estimate rust coverage; maps the resulting percentage to an ASTM D610 grade; and provides maintenance-priority guidance using configured asset-category regression rates. The system also supports authenticated scan-result storage and history, together with selected administrative account and analytics functions. The application is implemented using React and TypeScript on the frontend, Python and FastAPI on the backend, and Supabase for authentication, database persistence, and image storage. The configured asset categories are Hardware, Vehicles, Household, and Metal Walls. Claims about the particular objects represented in the training dataset should be limited to those documented in the dataset records.

### Limitations

> The system is limited to the analysis of two-dimensional images and estimates visible surface corrosion; it does not measure corrosion depth, material thickness loss, internal damage, or structural integrity. Its results depend on image quality, framing, lighting, surface visibility, and the visual characteristics represented in the model's training data. In the default configuration, rust coverage is estimated by counting rust-colored pixels within the AI-detected surface mask; generated patch bounding boxes are used separately to indicate localized regions. Accordingly, color similarities may lead to false inclusion or omission of pixels, and the resulting percentage should be treated as an image-based estimate. The ASTM D610 grade and maintenance guidance are derived from configured rules, while projected time to a critical condition uses category rates fitted to synthetic data. These outputs are intended to support, not replace, qualified inspection and engineering judgment. Evaluation claims about accuracy or generalizability require a separate validation study using documented ground truth.

## Draft statements to correct or substantiate

| Draft statement | Recommendation |
|---|---|
| “YOLOv26 object detection architecture” trained on “a unified corrosion class” | Revise: the implemented backend requires a YOLO **segmentation** model with `metal` and `rust` classes. Do not describe it as a single-class detector unless the implementation/model is changed and verified. |
| “Rust area percentage of the generated 2D bounding boxes” | Revise: default rust percentage is calculated from rust-colored pixels inside the segmented surface mask. Bounding boxes are derived separately from connected rust-mask components. |
| A defined list of dataset object types | Substantiate against the actual training/evaluation dataset inventory; configured predictor categories alone do not prove dataset composition. |
| ASTM D610 grade as an “objective engineering grade” | Qualify as an image-derived grade estimate mapped using implemented ASTM D610 percentage thresholds. Avoid implying formal inspection or standards certification. |
| Regression output as a forecast of real degradation | Qualify as a prototype estimate based on configured category rates and synthetic regression data, unless validated against longitudinal field measurements. |
| Broad “structural health monitoring” capability | Narrow to image-based corrosion estimation and maintenance decision support; structural diagnostics, depth measurement, and continuous monitoring are not implemented. |

## Source references

- `backend/main.py` — upload validation, segmentation workflow, rust percentage use, persistence, and API routes.
- `backend/rust_measurement.py` — default HSV color-mask measurement and rust-patch bounding boxes.
- `backend/image_quality.py` — accepted image formats, dimensions, lighting, and sharpness checks.
- `backend/predictive_engine.py` — asset categories, ASTM percentage mapping, configured regression rates, and priority rules.
- `CHAPTER_3_CLASSIFICATION_SPECIFICATION_MATRIX.md` — current classification, threshold, and prediction specifications.
- `DFD_CONTEXT.md` — current application boundaries and implemented data flows.
