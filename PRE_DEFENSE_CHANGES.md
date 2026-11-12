# Pre-Defense Changes: Review Guide

This guide covers the six **[SYSTEM]** tasks from the pre-defense task board. For each task it says what changed, where the change is, and how to check it by hand. Work through the steps in order: later steps build on earlier ones.

| # | Task on the board | Step in this guide |
|---|---|---|
| 1 | Remove image cropping | [Step 1](#step-1-remove-image-cropping) |
| 2 | Validation checker: metal/rust or not ("Error Dropping") | [Step 2](#step-2-metal-validation-error-dropping) |
| 3 | Environmental lighting (light/darkness) | [Step 3](#step-3-environmental-lighting) |
| 4 | Geometric Spread Regression (Spotted, Pinpoint, General, Hybrid) | [Step 4](#step-4-geometric-spread-and-astm-d610-grades) |
| 5 | Tooltips explaining classifications | [Step 5](#step-5-tooltips) |
| 6 | Alert notification sound and pop-up by severity | [Step 6](#step-6-severity-alert-sound-and-pop-up) |
| — | Making scans more accurate (model retraining) | [Model training plan](#model-training-plan-before-the-friday-defense) |

---

## 0. Before you test

1. **Use the new model.** `backend/models/best.pt` must be the **metal + rust segmentation model**: 23 MB, `task: segment`, classes `{0: metal, 1: rust}`. The backend now refuses to start with the old single-class `corrosion` detector and says so clearly. The new model is in the working copy but **not committed yet**.
2. **Run the database migration.** In the Supabase dashboard, open the SQL editor and run [`backend/migrations/002_add_distribution_and_lighting.sql`](backend/migrations/002_add_distribution_and_lighting.sql). It adds the `distribution_type`, `lighting_status` and `days_to_critical` columns to `scans`.
   - If you skip it, scans still save. The backend logs a warning and leaves those three fields out, so history won't show the distribution or lighting status.
3. **Restart both servers.**
   ```powershell
   # Terminal 1: backend
   cd backend
   .\venv\Scripts\Activate.ps1
   uvicorn main:app --reload --port 8000

   # Terminal 2: frontend (http://localhost:8443)
   cd frontend
   npm run dev
   ```
4. **Prepare a test photo set** and reuse it for every step:
   - clean metal
   - lightly spotted rust
   - fine pinpoint rust
   - heavily or fully rusted metal
   - a non-metal photo (person, pet, room)
   - a very dark photo
   - an overexposed or flash-glare photo

**Automated checks run so far:**
- `python -m py_compile` passes on all backend files.
- `npm run build` passes.
- The TypeScript check shows only the older errors in `AuthModal.tsx` and `BoundingBoxImage.tsx`, which these changes don't touch (see [Other notes](#other-notes)).
- Unit and smoke tests on synthetic images, described in each step.

**Not yet tested:** real metal and rust photos, because none are on the development machine. The by-hand checks below cover that gap.

---

## Step 1: Remove image cropping

**What changed:** the scan preparation pop-up no longer crops. It shows the full image and asks only for a **scan name**, which the backend requires. The whole image is analysed.

| File | Change |
|---|---|
| [`frontend/src/components/ScanPreparationModal.tsx`](frontend/src/components/ScanPreparationModal.tsx) | Crop modes, zoom and crop canvas removed. Shows the full preview and the name input; Enter submits. |
| `frontend/src/utils/cropImage.ts` | Deleted. |
| [`frontend/package.json`](frontend/package.json) | Removed `react-easy-crop` and `react-image-crop`. |
| [`HomePage.tsx`](frontend/src/pages/HomePage.tsx), [`ResultsPage.tsx`](frontend/src/pages/ResultsPage.tsx) | Variable rename only (`croppedFile` → `scanFile`). |

**Check by hand**
- [ ] Uploading from **Home** and from **Add another image** on the results page opens the pop-up with the full image.
- [ ] The calculating and results pages show the full, uncropped image.
- [ ] Escape, × and Cancel close the pop-up; an empty name shows "Enter a name for this scan."

---

## Step 2: Metal validation ("Error Dropping")

**What changed:** the backend now uses the new **segmentation** model properly.

- **Metal comes first.** A photo is accepted only if the model finds **metal with at least 0.5 confidence** covering at least **5% of the photo**.
- **Fully rusted objects still pass.** If no metal is visible but rust is found at the same confidence and size, the scan goes through. It will show as up to 100% rust and trigger the critical alert in Step 6.
- **Anything else is rejected** (error 422, `not_metal`) before anything is uploaded or saved. The user sees "This doesn't look like metal."
- **Rust % is measured inside the metal only:** rust pixels ÷ the AI-detected metal surface, not the whole photo. Background, hands, handles and other objects are excluded. See [Step 2b](#step-2b-how-rust--is-measured-fix-after-the-scissors-test) for how the rust pixels are counted.
- **Bounding boxes are drawn around the largest rust patches,** scaled back to the original photo size so the overlay lines up.
- **Large photos are downscaled** to 1024 px on the longest side before analysis. The model was trained at that size, and it keeps memory use reasonable.

| File | Change |
|---|---|
| [`backend/main.py`](backend/main.py) | `_segment_surface()`, the `SurfaceSegmentation` class (`is_metal_surface`, `rust_percentage`), the startup check for model type and classes, the 422 `not_metal` error, and import cleanup. |
| [`backend/.env.example`](backend/.env.example) | New settings `VALIDATION_CONFIDENCE=0.5` and `MIN_SURFACE_AREA_RATIO=0.05`. |
| [`frontend/src/services/api.ts`](frontend/src/services/api.ts) | `parseError()` reads structured `{detail: {code, message}}` errors; 422 `not_metal` becomes the `not-metal` error type. |
| [`frontend/src/pages/CalculatingPage.tsx`](frontend/src/pages/CalculatingPage.tsx) | "Invalid input" screen with a **Choose another image** button and no retry, since retrying the same photo can't help. |

**Settings you can tune** (in `backend/.env`, restart the backend after changing):
- `VALIDATION_CONFIDENCE`: raise it if non-metal photos get through; lower it if real metal gets rejected.
- `MIN_SURFACE_AREA_RATIO`: the minimum share of the photo that must be metal or rust.
- `RUST_CONFIDENCE` and `RUST_MIN_METAL_OVERLAP`: see the table below.

**Confidence thresholds, by detection:**

| Detection | What happens |
|---|---|
| Metal ≥ 0.25 (`METAL_CONFIDENCE`) | Kept as metal surface. |
| Metal ≥ 0.5 (`VALIDATION_CONFIDENCE`) over ≥ 5% of the photo | Passes the metal check. |
| Rust ≥ 0.25 | Kept. |
| Rust ≥ 0.5 over ≥ 5% of the photo | Passes the check alone (fully rusted objects). |
| Rust 0.12–0.25 (`RUST_CONFIDENCE`) | Kept **only if at least 50% of its outline lies on detected metal** (`RUST_MIN_METAL_OVERLAP`). |
| Rust < 0.12 | Dropped. |

The low rust band recovers rust the model is unsure about, and the metal-overlap rule stops low-confidence "rust" on wood, walls or skin from being counted. Each scan logs `low_conf_rust(kept=…, dropped=…)` in the backend terminal. Set `RUST_CONFIDENCE=0.25` to turn the low band off.

**Choosing the thresholds by measurement:** [`backend/tools/evaluate_thresholds.py`](backend/tools/evaluate_thresholds.py) runs the model on a labelled test set and reports, for each threshold, the share of metal photos wrongly rejected and of non-metal photos wrongly accepted. It also compares `RUST_MEASUREMENT=color` against `mask` with the labelled rust share. Run it from the `backend` folder:
```powershell
python tools/evaluate_thresholds.py --data <test split folder> --negatives <non-metal photos> --out <results folder>
```
To accept weaker metal detections, lower `METAL_CONFIDENCE` and `VALIDATION_CONFIDENCE` together; lowering only one has no effect.

**Don't combine a low `RUST_CONFIDENCE` with `RUST_MEASUREMENT=mask` on the current model:** its rust outlines cover whole objects, so the scissors would read about 90% instead of about 50%.

**Known limitation:** in testing, random colour noise was once read as metal with **0.895** confidence, which is above any sensible threshold. The real fix is retraining with non-metal **background images** (see [Model training plan](#model-training-plan-before-the-friday-defense), item 2).

**Check by hand**
- [ ] A non-metal photo shows "This doesn't look like metal." and no history entry is created.
- [ ] Rusty metal is accepted, the rust % looks plausible, and the boxes sit on the rust.
- [ ] Clean metal comes out close to 0%.

### Step 2b: How rust % is measured (fix after the scissors test)

**The problem found:** a clearly rusted pair of scissors (`remove-rust-from-tools-01`) scored **0%**. Running the model on that photo showed two things:
1. The model's "rust" detection scored only **0.13 confidence**, below the 0.25 cut-off, so it was dropped and rust % was 0.
2. More importantly, the rust outline covered **the entire blade**, the same area as the metal outline. The model outlines a rusty *object* instead of the individual *rust patches*. Even if it had been accepted, the scan would have read about 90%. The earlier "rusty shovel" scan at 95.55% shows the same pattern. With this model, rust % could only ever be about 0% or about 95%.

**Cause:** how the training data was labelled. Rust appears to be outlined as whole rusty objects rather than tight polygons around each rust patch. Lowering the confidence cut-off would **not** fix it.

**The fix (two stages, default):**
1. **The AI finds the metal surface** (the metal and rust outlines), which excludes background, skin and plastic handles.
2. **Inside that surface only, rust-coloured pixels are counted** using HSV colour ranges: reddish-orange to brown hues with enough saturation, skipping very dark or very bright pixels. These are the same colour thresholds the original pipeline used, now limited to the AI-detected metal.

rust % = rust-coloured pixels inside the metal ÷ metal surface pixels. The distribution type (Step 4) and the result boxes use this same rust mask.

**Result on the scissors:** 0% → **51.5% rust, `ASTM 0-G`, CRITICAL**, with boxes on the rusted blades and none on the handles or fingers. The rust % depends on the saturation threshold: 51.5% at `RUST_MIN_SATURATION=40` (the default), 42% at 60, 33% at 80. All three are grade 1 or 0, so CRITICAL either way.

| File | Change |
|---|---|
| [`backend/rust_measurement.py`](backend/rust_measurement.py) | **New.** `colour_rust_mask()` (the HSV thresholds are constants at the top of the file) and `rust_patch_boxes()`. |
| [`backend/main.py`](backend/main.py) | The `RUST_MEASUREMENT` setting; `SurfaceSegmentation.measured_rust_mask`; spread analysis now uses the measured rust. |
| [`backend/.env.example`](backend/.env.example) | `RUST_MEASUREMENT=color`. |

**Setting `RUST_MEASUREMENT`** (in `backend/.env`):
- `color` (default): the two-stage method above.
- `mask`: uses the model's own rust outlines. Switch to this **only after** the model is retrained with tight rust-patch labels (see [training plan](#model-training-plan-before-the-friday-defense), item 1), and compare both on your test photos first.

**Explaining it at the defense:** *"The YOLO segmentation model locates the metal surface and rejects non-metal inputs. Corrosion coverage is then quantified at pixel level inside that surface using HSV colour segmentation, which makes the result independent of how coarsely rust was labelled in training."*

**Limitations to know:**
- Rust-coloured **paint or coatings on the metal** (orange or red paint) will count as rust.
- **Very dark brown or black corrosion** may be undercounted (pixels darker than V=30 are skipped).
- Colour is affected by lighting. The Step 3 lighting check rejects or flags the worst cases.

**Check by hand**
- [ ] Re-scan the scissors photo: it should read about 50% and CRITICAL.
- [ ] Clean metal should read close to 0%, and lightly spotted metal should read low (grades 5–8).
- [ ] Orange or red plastic **next to** the metal (like the scissor handles) should not count.

---

## Step 3: Environmental lighting

The board notes this task as "For AI training", so it has two parts.

### 3a. Runtime lighting check (in the repo)
The backend measures brightness on the **L (lightness) channel of LAB colour space**, which separates brightness from colour so rust hues don't skew it. The check runs **before** the model:

| Status | When (L channel, 0–255) | Result |
|---|---|---|
| `too_dark` | average below 35, or 85% or more of pixels near black | **Rejected** (422 `poor_lighting`): "too dark to analyze reliably" |
| `too_bright` | average above 230, or 60% or more of pixels blown out | **Rejected**: "too bright or has too much glare" |
| `low_light` | average below 70 | Analysed, with a **Low light** warning banner |
| `overexposed` | average above 200, or 25% or more of pixels blown out | Analysed, with an **Overexposed** warning banner |
| `ok` | otherwise | Normal |

| File | Change |
|---|---|
| [`backend/image_quality.py`](backend/image_quality.py) | **New.** `assess_lighting()`, with every threshold as a named constant at the top of the file. |
| [`backend/main.py`](backend/main.py) | Rejects unusable exposures and includes `lighting_status` in the response and the saved scan. |
| [`frontend/src/components/LightingNotice.tsx`](frontend/src/components/LightingNotice.tsx) | **New.** Warning banner shown on the results and history detail pages. |
| [`CalculatingPage.tsx`](frontend/src/pages/CalculatingPage.tsx) | "The lighting in this photo is unusable." screen. |

Rust % now comes from the AI masks (Step 2) instead of fixed colour thresholds, which already makes the result much less sensitive to lighting.

### 3b. Retraining for lighting (optional, recommended)
Retraining is **not required** for the system to work: the runtime check above already rejects or flags bad lighting. Retraining makes the model itself more accurate on dim or glare-heavy photos, which the board's "For AI training" note points to. One fine-tuning round covers lighting and the Step 2 metal-detection weakness together. See **[Model training plan](#model-training-plan-before-the-friday-defense)**.

**Check by hand**
- [ ] A very dark photo shows the unusable-lighting screen.
- [ ] A dim but visible photo is analysed and shows the **Low light** banner.
- [ ] A normal photo shows no banner.

---

## Step 4: Geometric spread and ASTM D610 grades

### 4a. Distribution type (geometric spread)
ASTM D610 pairs each rust grade with a **distribution letter**, written e.g. **`5-S`**. The type is worked out from the **geometry of the AI rust mask**, relative to the metal surface:

1. **Blob analysis:** connected rust regions give the number and size of each rust blob.
   - A blob smaller than 0.05% of the surface counts as a **pinpoint**.
   - A blob at least 0.2% of the surface counts as a **spot**.
2. **Spread:** the metal surface is split into an 8×8 grid, and the system measures the share of grid cells that contain rust.
3. **Rules,** checked in this order:
   - **G (General):** rust in at least 60% of the surface grid cells.
   - **H (Hybrid):** at least one spot, plus at least 10 pinpoints making up at least 5% of the rust area.
   - **P (Pinpoint):** pinpoints make up at least 50% of the rust area.
   - **S (Spot):** everything else.

   No rust means no letter: the rating shows `10` instead of `10-S`.

**Unit test on synthetic masks:** two large circles → **S**; 300 tiny dots → **P**; 400 medium dots covering the surface → **G**; two circles plus 150 tiny dots → **H**; empty mask → none.

### 4b. ASTM D610 grade table corrected
The old table skipped grades 9–6 and had no grade 0. It now follows the full standard:

| Grade | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Max rust % | 0.01 | 0.03 | 0.1 | 0.3 | 1 | 3 | 10 | 16 | 33 | 50 | >50 |

- **Priority** is unchanged in principle. Days to critical = (33% − current rust) ÷ the category's regression slope:
  - more than 180 days → **Monitoring Required**
  - 180 days or fewer → **Elevated Priority**
  - 33% rust or more → **CRITICAL**
- **The regression's random noise is now seeded,** so the same photo always gets the same result. Before, the slope changed slightly every time the server restarted.
- **A fully rusted object (100%) is now grade 0,** "ASSET CONDEMNED". It still triggers the critical alert from Step 6, which covers grades 1 and 0.

| File | Change |
|---|---|
| [`backend/spread_analysis.py`](backend/spread_analysis.py) | **New.** `classify_distribution()`, with every threshold as a named constant at the top of the file. |
| [`backend/predictive_engine.py`](backend/predictive_engine.py) | Full `ASTM_D610_SCALE`, seeded regression, `astm_rating` (e.g. `5-S`) and the distribution type in the output. |
| [`backend/main.py`](backend/main.py) | Calls the spread analysis and returns `astm_rating`, `distribution_type` and `days_to_critical`. `_insert_scan()` saves the new columns, or falls back if migration 002 hasn't been run. History uses `select("*")`. |
| [`backend/migrations/002_add_distribution_and_lighting.sql`](backend/migrations/002_add_distribution_and_lighting.sql) | **New** migration. |
| [`frontend/src/types/index.ts`](frontend/src/types/index.ts), [`api.ts`](frontend/src/services/api.ts) | New fields `astmRating`, `distributionType`, `daysToCritical` and `lightingStatus`. The classification now shows as `ASTM 5-S`. |
| Results, history detail and info pages | "Distribution: Spot (S)" line. |

**Decision for the team:** the distribution type does **not** affect the regression yet. The predicted days to critical depend only on rust % and asset category. To make it a true "spread regression", one option is a slope multiplier per type (for example General faster than Pinpoint). That needs agreed values with a source or justification, so it was left out on purpose.

**Check by hand**
- [ ] Spotted rust → `ASTM x-S`; fine scattered rust → `x-P`; rust all over → `x-G`.
- [ ] The backend terminal logs `Scan analysed: rust=… rating=… geometry={…}` for each scan. Use these numbers to tune the thresholds in `spread_analysis.py` if a type looks wrong.
- [ ] Older history entries (from before migration 002) show `Distribution: —` and still load.

---

## Step 5: Tooltips

An **ⓘ** button now sits next to every classification value. It opens on hover or keyboard focus and toggles on tap for phones; Escape closes it.

| Tooltip | Content |
|---|---|
| Corrosion % | What rust % means (rust ÷ metal surface). |
| Classification | The ASTM D610 explanation plus the full grade table, with the current grade highlighted. |
| Distribution | The four types (S/G/P/H) with descriptions, with the current type highlighted. |
| Priority badge | How the regression gives days to critical, and what each tier means. |
| Decision Support System | What the recommendation is based on. |
| Lighting banner | What the lighting check does. |

The **Analysis** text panels were always empty before, because the API never filled them. They now show a generated explanation, for example: *"About 8% of the detected metal surface is covered by rust. The rust pattern is hybrid… ASTM D610 rating 4-H. Grade 4: Considerable rusting (up to 10% rust). Priority: Monitoring Required. At the current corrosion rate it is projected to reach the critical threshold (33% rust) in about 554 days."*

| File | Change |
|---|---|
| [`frontend/src/utils/classificationInfo.ts`](frontend/src/utils/classificationInfo.ts) | **New.** The single source for all explanation text. Edit the wording here. |
| [`frontend/src/components/InfoTooltip.tsx`](frontend/src/components/InfoTooltip.tsx) | **New.** The reusable, accessible tooltip. |
| [`frontend/src/components/ClassificationTooltips.tsx`](frontend/src/components/ClassificationTooltips.tsx) | **New.** Ready-made tooltips for each value. |
| [`ResultsPage.tsx`](frontend/src/pages/ResultsPage.tsx), [`HistoryDetailPage.tsx`](frontend/src/pages/HistoryDetailPage.tsx), [`InfoPage.tsx`](frontend/src/pages/InfoPage.tsx) | Tooltips added. |

**Check by hand**
- [ ] Each ⓘ opens on hover, on Tab focus, and on tap in the browser's mobile view.
- [ ] The grade table highlights the scan's grade.
- [ ] Tooltip panels near the right edge of the screen are not cut off.

---

## Step 6: Severity alert sound and pop-up

A pop-up appears **once, when a new scan finishes**. It never appears when you browse history. It plays a sound matched to the severity.

| Severity | When | Pop-up | Sound | Closes |
|---|---|---|---|---|
| Critical | `CRITICAL` priority, or grade 1 or 0 (33% rust or more, including fully rusted objects) | Red, pulsing, "Critical corrosion: immediate action required" | Urgent repeated two-tone pulses | **Only when acknowledged** |
| High | `Elevated Priority`, or grade 3 or worse | Orange | Rising two-tone chime | After 8 s |
| Moderate | Grades 4–6 | Yellow | Soft chime | After 8 s |
| Low | Grades 7–9 | Green | Quiet chime | After 8 s |
| None | Grade 10 | Green, "No corrosion detected" | **None** | After 8 s |

- The pop-up shows the rust %, ASTM rating, distribution, the recommendation, and days to critical.
- **Mute toggle:** "Alert sounds on/off" is remembered in the browser (`localStorage`).
- **Sounds are generated in the browser** with the Web Audio API, so there are no audio files. Browsers block sound unless it starts from a click, so audio is unlocked when **Start scan** is clicked.
- **The colour scale is unified.** Badges, rings and the pop-up now share one severity scale based on the ASTM grade and priority, replacing the old arbitrary 30%/60% rust cut-offs.

| File | Change |
|---|---|
| [`frontend/src/utils/alertSound.ts`](frontend/src/utils/alertSound.ts) | **New.** Tones, audio unlock (`primeAlertAudio`) and the mute setting. |
| [`frontend/src/components/SeverityAlert.tsx`](frontend/src/components/SeverityAlert.tsx) | **New.** The pop-up. |
| [`frontend/src/utils/severity.ts`](frontend/src/utils/severity.ts) | `severityLevel()` and `severityColor(scan)` based on grade and priority. |
| [`frontend/src/App.tsx`](frontend/src/App.tsx) | `alertResult` is set only in `handleCalculationDone` and cleared when you leave the results page. |
| [`ScanPreparationModal.tsx`](frontend/src/components/ScanPreparationModal.tsx) | Calls `primeAlertAudio()` on Start scan. |
| [`frontend/src/index.css`](frontend/src/index.css) | Slide-in and critical-pulse animations, turned off for users who prefer reduced motion. |

**Check by hand** (in Chrome, with sound on)
- [ ] A fresh scan plays a sound and shows the pop-up; heavy rust gives the red critical pop-up, which stays until **Acknowledge**.
- [ ] A clean-metal scan shows "No corrosion detected" with no sound.
- [ ] Muting persists after a page reload.
- [ ] Opening a scan from **History** shows no pop-up; leaving and returning to results doesn't replay it.

---

## Model training plan (before the Friday defense)

**For:** whoever trains the model in Colab or Roboflow.
**Goal:** one **fine-tuning round** of the current model, focused on better training data rather than a new model design.

**Why the data matters most:** rust % and the distribution type both come straight from the model's **metal and rust outlines** (segmentation masks). The precision of those outlines is what makes scans accurate. Every change below improves the outlines without needing any backend change.

**Current model, for reference:** `runs/segment/final3`, YOLO26s-seg, classes `{0: metal, 1: rust}`, 120 epochs at `imgsz=1024`, with `hsv_h=0.005`, `hsv_s=0.7` and `hsv_v=0.4` (the default).

### 1. Clean up the existing labels (biggest gain, no training needed)
- [ ] **Most important: outline rust patches, not whole rusty objects.** The current model labels an entire rusty blade as "rust" (see [Step 2b](#step-2b-how-rust--is-measured-fix-after-the-scissors-test)), which is why the backend measures rust by colour for now. Each rust polygon should cover only the visibly rusted area, and clean metal next to it should stay "metal".
- [ ] **Rust outlines** are tight and include small spots. Missing pinpoint rust makes both the rust % and the Pinpoint/Hybrid types wrong.
- [ ] **Metal is labelled the same way in every image.** Either always outline the whole metal object, including the rusted parts, or never. The backend handles both (it measures rust ÷ (metal + rust)), but mixing them confuses the model.
- [ ] **Sloppy or partial outlines** are fixed or the image is removed. Roboflow's annotation review makes this quick.

### 2. Add hard negatives: photos with nothing labelled (about 10–15% of the dataset)
- [ ] Non-metal photos: people, rooms, plastic, fabric.
- [ ] **Most important: rust-coloured things that aren't rust:** wood, brick, orange paint, dry leaves, cardboard.
- [ ] In Roboflow, upload them with **no annotations** (as null/background images).

This fixes the Step 2 limitation, where random noise was read as "metal" with 0.895 confidence, and reduces false rust detections.

### 3. Add lighting variety (about 15–20% of the dataset)
- [ ] Real photos of metal and rust in **dim light, in shade, with flash glare, and overexposed**, labelled like the rest.
- [ ] Raise brightness augmentation: `hsv_v` from 0.4 to **0.6**. In Roboflow, add the **Brightness ±30%** and **Exposure** augmentations.
- [ ] **Keep hue augmentation small** (`hsv_h` 0.005–0.015). Rust colour is the main thing the model learns from, and shifting hue too much teaches it that orange-brown doesn't matter.

### 4. Fine-tune from the current model (don't train from scratch)
Fine-tuning is faster and keeps what the model already learned:
```bash
yolo segment train model=runs/segment/final3/weights/best.pt data=dataset/rust.yaml \
  epochs=80 patience=20 imgsz=1024 \
  hsv_h=0.01 hsv_s=0.7 hsv_v=0.6 \
  fliplr=0.5 flipud=0.5 degrees=10 scale=0.5 \
  mosaic=1.0 close_mosaic=10 copy_paste=0.3 \
  name=final4
```
| Setting | Why |
|---|---|
| `model=…/final3/weights/best.pt` | Starts from the current model instead of from scratch. |
| `patience=20` | Stops early if accuracy stops improving, which saves time. |
| `hsv_v=0.6`, `hsv_h=0.01` | More brightness variety; hue stays small (see step 3). |
| `flipud=0.5`, `degrees=10` | Which way up a metal surface is doesn't matter, so these add free variety. |
| `copy_paste=0.3` | Pastes rust outlines into other images. Helps most with small, scarce rust areas. |
| `close_mosaic=10` | Trains the last 10 epochs on normal, un-mosaicked images so outlines match real photos. |

**Must not change:** `imgsz=1024` and the class names **`metal`** and **`rust`**. The backend depends on both and refuses to start without the two class names.

### 5. Prove the new model is better before swapping it in
- [ ] Set aside **30–50 test photos** that are never used in training, including some low-light ones.
- [ ] Compare old and new models on **mask mAP for rust** (outline accuracy), not just box mAP. The outlines are what feed rust %.
- [ ] **Keep the old `best.pt` as a backup.** Swap only if the new model wins.
- [ ] Save the comparison table, confusion matrix and precision-recall curves from the training run folder. They make good defense slides.

**To swap the model:** replace `backend/models/best.pt` and restart the backend. No code changes are needed.

### Avoid this week
- **Training from scratch, or a bigger model (YOLO26m or larger).** More accurate, but slower to train, and probably too slow or heavy for Render's CPU.
- **Increasing `imgsz` above 1024.** It would help pinpoint rust, but needs backend changes (`MODEL_IMAGE_SIZE`, `INFERENCE_MAX_SIDE`) and retesting, which is too risky this close to the defense.
- **New classes** (for example labelling the distribution types). That means re-labelling everything, and the geometric spread analysis already covers it.

### Schedule
| Day | Work |
|---|---|
| **Mon–Tue, Nov 9–10** | Clean up labels. Collect and label hard negatives, low-light photos, and close-ups of pinpoint rust. |
| **Tue night, Nov 10** | Run the fine-tuning (about 80 epochs). |
| **Wed, Nov 11** | Compare with the old model on the test set and swap if better. Then tune `VALIDATION_CONFIDENCE` and the spread thresholds in `spread_analysis.py` on real photos. |
| **Thu, Nov 12** | **Freeze the code and model.** Run the full by-hand test from this guide and prepare the metrics slides. |
| **Fri, Nov 13** | Defense. Keep the old model ready as a fallback. |

---

## Second change list

### Spread changes the regression slope
Before this change the distribution type was only a label: two scans with the same rust % got the same prediction whether the rust was one patch or spread everywhere.

**Now:** effective corrosion rate = category rate × spread factor.
- The spread analysis already measures **coverage**: the share of the metal surface grid (8×8) that contains rust.
- **Spread factor** = 0.85 + 0.45 × coverage. Rust in one small area gives ×0.85; rust across the whole surface gives ×1.30.
- Days to critical = (33% − current rust %) ÷ effective rate, so wider spread means fewer days.
- No rust, or an older scan with no stored coverage, keeps the factor at ×1.00.

Example at 8% rust, Hardware category:

| Coverage | Factor | Days to critical |
|---|---|---|
| 10% (concentrated) | ×0.895 | 619 |
| 50% | ×1.075 | 516 |
| 100% (everywhere) | ×1.30 | 426 |
| Not stored (older scan) | ×1.00 | 554 |

**The 0.85 and 1.30 bounds are project assumptions, not values from ISO 9223 or ASTM D610.** The reasoning is that rust spread over more of the surface has more active edges to grow from. They are named constants (`SPREAD_FACTOR_MIN`, `SPREAD_FACTOR_MAX`) at the top of `backend/predictive_engine.py`; cite a source for them or adjust them before presenting them as established.

| File | Change |
|---|---|
| [`backend/predictive_engine.py`](backend/predictive_engine.py) | `spread_factor()`; `analyze_scan` takes the coverage and returns `spread_factor`, `spread_coverage` and the effective slope. |
| [`backend/main.py`](backend/main.py) | Passes the measured coverage to the engine, saves it, and returns `spread_coverage`, `spread_factor` and `regression_slope`. History uses the stored coverage. Saving a scan now drops only the columns whose migration is missing. |
| [`backend/migrations/003_analytics_fields.sql`](backend/migrations/003_analytics_fields.sql) | **New.** Adds `scans.spread_coverage`. Safe to run more than once. |
| [`frontend/src/utils/classificationInfo.ts`](frontend/src/utils/classificationInfo.ts), [`api.ts`](frontend/src/services/api.ts), [`types/index.ts`](frontend/src/types/index.ts) | New fields; the classification explanation and the priority tooltip now state the spread and its factor. |

**Check by hand**
- [ ] Run migration 003 in the Supabase SQL editor and restart the backend.
- [ ] Scan a photo with rust all over and one with a single rust patch. The classification text should say "Rust is found across N% of the surface, so the projected rate is scaled ×…", with a higher factor for the first.
- [ ] The backend terminal logs `slope=… (spread x…) days=…` for each scan.
- [ ] Reopen the scan from History: the days to critical match the original result.

### More input validations
The upload is now checked in this order. Anything rejected is never uploaded or saved.

| Check | Result when it fails |
|---|---|
| File type and 15 MB limit, **in the browser** before upload | Message in the upload pop-up; **Start scan** is disabled. |
| Asset category is one of the known ones | Rejected (400). Before, an unknown category silently used a default rate. |
| Real file format is JPEG, PNG or WebP, read from the file's bytes | Rejected (400 `unsupported_format`). |
| The file decodes as an image | Rejected (400 `invalid_image`). |
| Shortest side is at least 200 px | Rejected (422 `too_small`). |
| Lighting (existing check) | Rejected (422 `poor_lighting`) or analysed with a warning. |
| **Sharpness** | Very blurry: rejected (422 `too_blurry`). Slightly blurry: analysed with a warning. |
| Metal present (existing check) | Rejected (422 `not_metal`). |
| **Metal fills at least 15% of the photo** | Analysed with a "metal is small in the frame" warning. |

- **How sharpness is measured:** edge strength (variance of the Laplacian) in each cell of a 6×6 grid on the photo scaled to 640 px; the score is the 90th percentile cell, so a sharp object in front of a blurred background still passes.
- **Where the thresholds come from:** on 117 real photos (your 12 scans and the 105 test images) the lowest score was 63. Moderately blurred copies scored under 15 and lightly blurred ones around 27. Photos below **12** are rejected and below **40** get the warning. The constants are at the top of `backend/image_quality.py`.
- **Minimum size is 200 px,** not the 320 px first planned, because one valid test-set photo is 205 px on its shortest side.
- **Images are stored with their real format.** Before, anything that wasn't a JPEG was saved as `.png`.
- **Warnings** are returned as `quality_warnings` and saved with the scan, so they also show in History.
- **Rejections are logged** (user, reason, time; no image) in a new `scan_rejections` table for the admin chart. If the table doesn't exist yet, the scan is still rejected normally.

| File | Change |
|---|---|
| [`backend/image_quality.py`](backend/image_quality.py) | `assess_sharpness()`, `detect_image_format()`, `MIN_IMAGE_SIDE`. |
| [`backend/main.py`](backend/main.py) | The new checks, `quality_warnings`, and `_reject_scan()` which logs the reason. |
| [`backend/migrations/003_analytics_fields.sql`](backend/migrations/003_analytics_fields.sql) | Adds `scans.quality_warnings` and the `scan_rejections` table. |
| [`frontend/src/components/ScanPreparationModal.tsx`](frontend/src/components/ScanPreparationModal.tsx) | File type and size check before upload. |
| [`frontend/src/components/QualityNotice.tsx`](frontend/src/components/QualityNotice.tsx) | **New.** Replaces `LightingNotice`; one banner for lighting, blur and small-metal warnings. |
| [`CalculatingPage.tsx`](frontend/src/pages/CalculatingPage.tsx), [`api.ts`](frontend/src/services/api.ts), [`types/index.ts`](frontend/src/types/index.ts) | "This photo is too blurry." and "This photo is too small." screens. |

**Check by hand** (run migration 003 again first; it now adds more)
- [ ] Choose a GIF or a file over 15 MB: the pop-up shows the reason and **Start scan** is disabled.
- [ ] Scan an out-of-focus photo: "This photo is too blurry."
- [ ] Scan a photo where the metal is small and far away: it is analysed, with the "Metal is small in the frame" banner.
- [ ] A normal sharp photo shows no banner.

### Graphs and charts
Charts are in three places. Each chart card has a **Show table** button with the same numbers, and a tooltip on hover.

**Results page and history detail page (per scan)**
- **Projected corrosion:** rust % over time from today's measured point to the 33% critical threshold, at the scan's corrosion rate. The line is dashed because it is a projection from one scan, and the card says so. A scan already at or past 33% shows a message instead of a chart. The table lists when each ASTM grade boundary is passed.
- **Position on the ASTM D610 scale:** eleven grade blocks from 10 to 0 with the scan's grade highlighted.

**Analytics page (new, in the side menu; the signed-in user's own scans)**
- Period filter (last 7, 30 or 90 days, or all time) that every tile and chart follows.
- Tiles: number of scans, average rust coverage, critical scans.
- **Rust coverage per scan:** one dot per scan by date. The dots are not joined, because the scans are of different objects and a line would suggest a trend that isn't there.
- Scans by ASTM grade, by maintenance priority and by rust distribution.

**Admin dashboard (all users' scans)**
- Replaces the old "Scan activity" bars, whose heights were just the count × 24 px.
- Period filter (last 7, 30 or 90 days) for the whole section.
- Tiles: scans analysed, scans rejected, rejection rate.
- Scans per day (in the admin's local time), by ASTM grade, by priority, by distribution, by photo lighting, and rejected scans by reason.
- The rejection chart needs migration 003; until then it says the log isn't set up.

**Design choices**
- Charts sit on a darker panel (`#1f2818`). On the app's normal card colour the chart colours fall below the 3:1 contrast minimum; on this panel every colour passes (checked with a palette validator).
- One blue for all counts. Green, amber and red are used only where the colour means a state (priority, the highlighted grade, the critical line), always with a text label.
- Bars are at most 24 px thick; grid lines are thin and solid.

| File | Change |
|---|---|
| [`frontend/src/components/charts/`](frontend/src/components/charts/) | **New.** `ChartCard`, `CountBarChart`, `ProjectionChart`, `AstmScale`, `ScanDotsChart`, `StatTile`, `AdminAnalyticsSection`, `chartTheme`. |
| [`frontend/src/pages/AnalyticsPage.tsx`](frontend/src/pages/AnalyticsPage.tsx), [`utils/analytics.ts`](frontend/src/utils/analytics.ts) | **New.** The user analytics page and its counting helpers. |
| [`App.tsx`](frontend/src/App.tsx), [`SideMenu.tsx`](frontend/src/components/SideMenu.tsx), [`AdminPage.tsx`](frontend/src/pages/AdminPage.tsx), [`ResultsPage.tsx`](frontend/src/pages/ResultsPage.tsx), [`HistoryDetailPage.tsx`](frontend/src/pages/HistoryDetailPage.tsx) | The new `analytics` view and menu item; charts added to the pages. |
| [`backend/main.py`](backend/main.py) | **New** `GET /admin/analytics?days=…&tz_offset=…` (admin only). |
| [`frontend/package.json`](frontend/package.json) | Adds `recharts` 3.10.1. |

**Check by hand**
- [ ] Results page: the projection chart and the ASTM scale appear under the analysis text; hovering the line shows the projected rust % and grade.
- [ ] A scan at 33% rust or more shows "already at or past the critical threshold" instead of a chart.
- [ ] Side menu → **Analytics**: tiles and four charts; changing the period changes all of them; **Show table** works.
- [ ] Admin page: the analytics section loads, and the period filter updates every chart.

### Metal classifier and hybrid rust measurement (hierarchical classification)
This is the colleague's backend update, merged into our `main.py` (not overwritten, so the spread slope, validations and analytics are kept). It **supersedes the threshold table in Step 2 above**: the tested configuration uses one detection confidence, 0.15, for metal and rust.

**The pipeline is now a hierarchy.** Each level runs only if the one before it passed.

| Level | Question | Decided by |
|---|---|---|
| 1 | Is this a photo of metal? | Metal classifier `models/metal_cls.pt` (YOLO26s-cls), probability ≥ 0.4 |
| 2 | Where is the metal, and where is rust on it? | Segmentation model `models/best.pt` |
| 3 | How much of the metal is rusted? | Hybrid measurement: rust-coloured pixels, counted only in or near areas the model marked as rust |
| 4 | How severe? | ASTM D610 grade table |
| 5 | How is it spread? | Geometric spread analysis |
| 6 | How urgent? | Regression on rust %, category and spread |

Levels 1 and 2 are trained models; levels 3 to 6 are measurements and rules.

**Settings in `backend/.env`** (already added; add the same three in the Render dashboard):
```
RUST_MEASUREMENT=hybrid
METAL_CLASSIFIER_THRESHOLD=0.4
MODEL_CONFIDENCE=0.15
```
Do not set `METAL_CONFIDENCE`, `RUST_CONFIDENCE`, `VALIDATION_CONFIDENCE` or `HYBRID_REACH`; their defaults are the tested values. If `metal_cls.pt` is missing, the backend still runs without level 1.

**Results reproduced with the merged backend on the 105 test images** (81 metal, 24 non-metal):

| | Before | Now |
|---|---|---|
| Non-metal rejected | 18 of 24 (75.0%) | 21 of 24 (87.5%) |
| Metal accepted | 75 of 81 (92.6%) | 74 of 81 (91.4%) |
| Gate accuracy | 88.6% | 90.5% |
| ASTM grade vs hand labels | 45.3% exact (colour mode) | 73.0% exact, 87.8% within one grade |

The "Now" column was re-measured on this machine and matches the colleague's figures exactly. Our added size and blur checks reject none of the 105 images.

**Two alternatives were measured and not adopted** (same test set):

| Setting change | Metal accepted | Non-metal rejected | Grade exact | Clean metal given rust | Effect on our scan photos |
|---|---|---|---|---|---|
| Tested configuration | 74 of 81 | 21 of 24 | 73.0% | 2 of 10 | Scissors read 0% |
| `RUST_CONFIDENCE=0.10` | 74 of 81 | 21 of 24 | 70.3% | 3 of 10 | Scissors read 51.3% |
| `VALIDATION_CONFIDENCE=0.15` | 78 of 81 | 21 of 24 | 69.2% | 2 of 10 | Wrench accepted but read as 0% rust |

**Known limitations** (state these at the defense):
- Close-up non-metal textures (fabric, leather, paper) can still be accepted.
- Plain metal filling the whole frame, with no edges or background, can be rejected.
- **Rust the model is not confident about is read as 0%.** The rusted scissors photo (`remove-rust-from-tools-01`) reads 0% and the pruner's rusty blade reads 0%, because the model's rust detection on them is below 0.15.
- Fine scattered rust and almost completely rusted surfaces are underestimated.
- A fully rusted object with no clean metal visible can be rejected at level 2 even when the classifier is sure it is metal (the wrench).
- At 0.15, two of the ten clean metal test images were given some rust.
- Copper, brass and bronze can be read as rusted; ASTM D610 applies to steel.
- Perforation and depth cannot be judged from a photo.

| File | Change |
|---|---|
| [`backend/main.py`](backend/main.py) | `hybrid` mode, `MODEL_CONFIDENCE` from the environment, the classifier (`metal_probability`, `passes_metal_classifier`) and its check before segmentation. Classifier rejections are logged as `not_metal_classifier`. |
| `backend/models/metal_cls.pt` | **New** (10.5 MB). Must be deployed the same way as `best.pt`. |
| [`backend/evaluate_system.py`](backend/evaluate_system.py) | **New**, the colleague's test tool. `make_figures.py` has not been received, so it skips the charts. |
| [`backend/.env.example`](backend/.env.example) | The three tested settings and the optional overrides. |

**Check by hand**
- [ ] A rusty metal photo is accepted with a rust %.
- [ ] A sunset, forest or person photo shows "This doesn't look like metal."
- [ ] A clean metal object reads close to 0%.

---

## API response changes (analysis and history)

New fields; all existing fields are unchanged:
```jsonc
{
  "astm_grade": 4,
  "astm_rating": "4-H",          // grade plus distribution letter
  "distribution_type": "H",      // "S" | "G" | "P" | "H" | null
  "days_to_critical": 554,
  "lighting_status": "ok",       // "ok" | "low_light" | "overexposed" | null (old scans)
  "box_coordinates": [/* rust boxes only, original image pixels */]
}
```
New error responses (status 422) have the shape `{"detail": {"code": "not_metal" | "poor_lighting", "message": "..."}}`.

---

## Other notes

**Fixed along the way**
- `HistoryDetailPage` called `onEdit` without receiving it, so saving a title from the detail page crashed. It's now wired up.

**Still open (older issues, not part of these tasks)**
- **History images can break after about an hour.** The saved image link expires after 1 hour (`SUPABASE_SIGNED_URL_TTL`), and `storage_path` isn't saved. **Recommended before the defense.**
- **Deleting a history scan leaves its image in Storage.**
- **The asset category is always "Hardware",** because the upload screen has no category picker.
- **TypeScript can't run on the project as configured.** `tsconfig.json` has `"ignoreDeprecations": "6.0"`, which the installed TypeScript 5.9 rejects. The `AuthModal.tsx` and `BoundingBoxImage.tsx` type errors are older and outside these tasks.
- **The new model and these changes are not committed yet.** Commit them once you've reviewed them.
