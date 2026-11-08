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
