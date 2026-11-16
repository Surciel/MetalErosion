# Post-defense changes: an inspection tool for engineers

This guide records the changes made after the final defense, one section per step, with a hand checklist for each. The earlier guide is [PRE_DEFENSE_CHANGES.md](PRE_DEFENSE_CHANGES.md).

## Why the system is changing

The panel asked what the system is for: a person who sees a rusty object already knows it is rusty. They suggested dedicating it to engineers or construction workers.

The new purpose is to do what a person cannot do by eye:

1. grade rust the same way every time under ASTM D610;
2. tell 8% from 12%, which is the line between spot repair and full repainting;
3. rank many steel elements so a limited budget goes to the right ones first;
4. say how fast an element is getting worse;
5. keep a dated inspection record for each element.

So the unit of work moves from one photo of one object to an inventory of steel elements inspected over time.

## The nine steps

| Step | Change | Status |
|---|---|---|
| 1 | Element type and exposure environment replace the consumer categories; professional wording | Built, tested; awaiting hand check |
| 2 | Sites and assets: each scan belongs to a steel element | Built, tested; awaiting hand check |
| 3 | Trend per asset and a measured deterioration rate | Built, tested; awaiting hand check |
| 4 | Priority register: all assets on a site, ranked | Built, tested; awaiting hand check |
| 5 | Engineer review and roles (Inspector, Engineer, Admin) | Built, tested; awaiting hand check |
| 6 | Printable inspection report and CSV export | Built; print checked in Edge |
| 7 | Evidence for the paper: engineer grading and user evaluation | Tools built; the studies are done outside the code |
| 8 | Dashboard with graphs for interpretation (panel request) | Built; rendered and checked |
| 9 | Interface revamp (panel request) | Built; checked at phone and laptop widths |

The models, the rust measurement, the ASTM grade and distribution rules, the photo checks and the six action-level thresholds do not change in any step. The test results in Chapter 4 still apply.

---

## Step 1: element type and exposure environment

### What changed
A scan no longer asks "what kind of object is this?" with Hardware, Vehicles, Household, Metal Walls and Unmapped Category. It asks two things an inspector records:

| Question | Options | What it controls |
|---|---|---|
| Element type | Structural member; Roofing and cladding sheet; Railing, stair and grating; Door, gate and fence; Tank, pipe and duct; Equipment housing and support | The check added to the maintenance steps |
| Exposure environment | C2, C3, C4, C5 (ISO 12944-2 corrosivity categories) | The baseline corrosion rate |

Both are required, with no default, and anything outside the lists is refused.

### The rates and what they rest on

| Environment | Examples | Rate (% of surface per day) | Rust-free to 33% |
|---|---|---|---|
| C2 Low | Rural; unheated interiors | 0.0045 | about 20 years |
| C3 Medium | Urban; low-salinity coast | 0.009 | about 10 years |
| C4 High | Industrial; moderate-salinity coast | 0.0144 | about 6 years |
| C5 Very high | High-salinity coast; aggressive industrial | 0.036 | about 2.5 years |

- **From a standard:** ISO 9223 and ISO 12944-2 give the first-year thickness loss of low-carbon steel in each category: C2 over 1.3 to 25 µm, C3 over 25 to 50 µm, C4 over 50 to 80 µm, C5 over 80 to 200 µm. I read these on SteelConstruction.info, which reproduces the table from BS EN ISO 12944-2. The **ratios** between environments (0.5 : 1 : 1.6 : 4) come from the upper limits of those ranges.
- **Project assumption:** the **anchor**. In C3 a rust-free painted surface is assumed to reach 33% rust in about 10 years. The standard gives thickness loss, not rusted area, so one value has to be assumed.
- This is stronger than the old categories, where both the order and the values were assumptions. Step 3 replaces the anchor with a rate measured from repeated inspections.

### The maintenance answer is reworded for professionals

| Level | Before | Now | Surface preparation |
|---|---|---|---|
| 1 | No repair needed. Keep up routine care. | No maintenance painting required. | None |
| 2 | Touch up the rust spots. | Spot touch-up. | Hand tool cleaning, SSPC-SP 2 |
| 3 | Repair the rusted areas. | Spot repair. | Power tool cleaning, SSPC-SP 3 |
| 4 | Repair the rusted areas and recoat the whole surface. | Spot repair and full overcoat. | SSPC-SP 3, then overall cleaning |
| 5 | Remove all rust and old coating, then recoat fully. | Full removal and recoating. | Abrasive blast, SSPC-SP 6 / ISO 8501-1 Sa 2 or better |
| 6 | Critical: have it assessed for replacement. | Critical: structural assessment before any coating work. | After assessment |

- The 30 consumer step texts ("wipe dry, light oil") are gone. There is now one step set per level for painted steel.
- Each answer adds one check for the element type, for example "Check laps, fasteners, cut edges and gutters" for roofing.
- At levels 5 and 6 a safety step is added for the element type, for example "Do not walk on or load heavily rusted sheets".
- For C3 to C5 the answer adds a note for the environment.
- The thresholds between levels are unchanged.

### Old scans
Scans saved before this step keep the category and the rate they were analysed with, so their results do not change. They show "Element: Not recorded" and can be given an element type and environment from the history page, which recalculates the result.

### Files

| File | Change |
|---|---|
| [`backend/asset_profile.py`](../backend/asset_profile.py) | **New.** Element types, environments, rates, evidence. Replaces `asset_categories.py`, which is removed. |
| [`backend/decision_support.py`](../backend/decision_support.py) | Professional step set, strategy and surface preparation per level, element and environment notes. |
| [`backend/predictive_engine.py`](../backend/predictive_engine.py) | Rates looked up by environment; the old category rates kept for old scans only. |
| [`backend/main.py`](../backend/main.py) | Upload takes `element_type` and `environment`; `GET /scan-options` replaces `/asset-categories`; history, update and admin analytics use the new fields. |
| [`backend/migrations/006_element_and_environment.sql`](../backend/migrations/006_element_and_environment.sql) | **New.** Adds `scans.element_type` and `scans.environment`. |
| [`frontend/src/components/ScanPreparationModal.tsx`](../frontend/src/components/ScanPreparationModal.tsx) | Two pickers in place of the category list. |
| [`frontend/src/components/ScanDetailsLine.tsx`](../frontend/src/components/ScanDetailsLine.tsx) | **New.** Shows and edits the element type and environment. Replaces `AssetCategoryLine.tsx`. |
| `frontend/src/` types, API, pages, analytics charts, landing page | Renamed fields; charts by environment and by element type; landing text addressed to engineers and inspectors. |

### Before you test
Run [`006_element_and_environment.sql`](../backend/migrations/006_element_and_environment.sql) in Supabase. Without it a new scan is still analysed, but its element type and environment are not saved.

### Check by hand
- [ ] The landing page speaks to maintenance engineers and inspectors.
- [ ] Choosing a photo opens "New inspection scan" with two dropdowns, nothing preselected, and the Start button disabled until both are chosen.
- [ ] Choosing an environment shows its rate and the note that it is an assumption.
- [ ] The result shows "Element: … · Exposure: C3 (Medium: urban) · 0.0088% per day".
- [ ] The Decision Support panel shows the strategy as the headline, a "Surface preparation" line, and the element check as the last step.
- [ ] The same photo scanned as C2 and as C5 gives different "Act within" times and the same ASTM grade.
- [ ] An old scan in the history shows "Not recorded"; choosing **Set** and saving recalculates it.
- [ ] The analytics page has "Scans by exposure environment" and "Scans by element type".

### Notes for the paper
- Scope and Limitations (Chapter 1) lists Hardware, Vehicles, Household and Metal Walls. Replace with the six element types and the four environments.
- Table 13 (asset category slopes) becomes a table of environment rates with the anchor and the ISO ratios.
- Tables 16 to 18 (action levels and steps by category) need the new wording. Table 18 becomes one row per element type with its check and safety step.
- Cite ISO 9223 for the corrosivity categories. The values were read from a secondary source that reproduces the table; check the standard before quoting it.

---

## Before testing Steps 2 to 9

Run these in the Supabase SQL editor, in order. Each is meant to be run once; if one is missing, the app names the file to run.

| File | Adds |
|---|---|
| [`006_element_and_environment.sql`](../backend/migrations/006_element_and_environment.sql) | `scans.element_type`, `scans.environment` (Step 1) |
| [`007_sites_and_assets.sql`](../backend/migrations/007_sites_and_assets.sql) | Tables `sites` and `assets`; `scans.asset_id` |
| [`008_review_and_roles.sql`](../backend/migrations/008_review_and_roles.sql) | Review columns on `scans`, `rust_method`, `inspector_name`; the `engineer` role |

Migrations 003, 004 and 005 must already have been run. To test review, make one account an engineer from the Admin page (or with the SQL at the end of 008).

---

## Step 2: sites and assets

### What changed
- A **site** is a building, plant or project. It has a name, a location and one exposure environment (C2 to C5).
- An **asset** is one steel element on a site: a tag (unique on its site, such as `R-1`), a description, an element type, the coated area in m², the coating system, the date it was last coated, and notes.
- Scanning an asset takes the element type from the asset and the environment from its site, so the inspector does not choose them again. A **quick scan** with no asset is still possible and asks for both.
- Everyone in the deployment sees every site and asset and can add them. Editing and deleting a site or asset is for engineers, admins, and whoever created it.
- Deleting an asset keeps its scans; they become quick scans. Deleting a site deletes its assets.
- A scan that belongs to an asset cannot have its element type or environment changed on its own; change the asset or the site instead.

### Files
| File | Change |
|---|---|
| [`backend/inventory.py`](../backend/inventory.py) | **New.** Site and asset routes, the register, the dashboard. |
| [`backend/main.py`](../backend/main.py) | Upload takes `asset_id`; scans carry their asset reference. |
| `frontend/src/pages/SitesPage.tsx`, `SitePage.tsx`, `AssetPage.tsx` | **New.** Site list, site register, asset page. |
| `frontend/src/components/InventoryForms.tsx` | **New.** Site and asset forms. |
| `frontend/src/components/ScanPreparationModal.tsx` | "An asset on a site" or "Quick scan, no asset". |

### Check by hand
- [ ] Sites and assets → Add a site → it appears with its environment chip.
- [ ] On the site, add two assets with the same tag: the second is refused.
- [ ] New scan → choose the site and the asset → the result shows "Asset: R-1 · site name" and the site's environment.
- [ ] With no sites at all, the scan pop-up opens on Quick scan.
- [ ] Delete an asset that has scans: the scans remain under My scans.

---

## Step 3: trend and measured rate per asset

### The rules
| Rule | Value | Why |
|---|---|---|
| Inspections closer than 24 hours count once | 24 h | Two photos the same day are one inspection, not a rate. |
| A rate is measured only from at least 3 inspections spanning at least 7 days | 3 and 7 days | Fewer points cannot separate growth from measurement noise. |
| The measured rate is blended with the environment rate | weight (N − 2) / 3, full at 5 inspections | The assumed rate is replaced gradually as evidence builds. |
| A fitted slope of zero or less | "No growth measured", no deadline | The system does not invent a date. |
| Only inspections measured with the same method are fitted together | `rust_method` | A change of measurement method is not deterioration. |
| Only inspections after the date last coated are fitted | `last_coated_on` | Recoating restarts the trend. |

The fit is ordinary least squares of rust % against days, with the slope's 95% interval and R². The asset page names the source of the rate ("Assumed", "Measured from 6 inspections").

These rules are project choices, not taken from a standard. Say so in the paper.

### Files
| File | Change |
|---|---|
| [`backend/asset_trend.py`](../backend/asset_trend.py) | **New.** The fit and its rules. |
| `frontend/src/components/charts/TrendChart.tsx` | **New.** Inspection points, fitted line, projection to the next threshold, and the 1%, 10% and 33% lines. |

### Check by hand
- [ ] An asset with 1 or 2 inspections says "Assumed" and uses the environment rate.
- [ ] Setting "Last coated" to a date after some inspections drops those from the fit.
- [ ] The trend chart's reading says how fast rust is growing and when it reaches the next threshold.

---

## Step 4: priority register

### What changed
Each site page ranks its assets: the highest action level first, then the nearest deadline. Each row shows the latest rust %, ASTM rating, action level, the "act by" date, the rate and its source, and the area to treat.

- **Area to treat** is the whole coated area at levels 4 to 6, and the rusted area (rust % × coated area) at levels 2 and 3. No allowance factor is added; a note says the feathering allowance follows the project specification.
- Charts on the site page: assets by action level, assets by ASTM grade, and area to treat by strategy. Each has a one-line reading and a table view.

### Check by hand
- [ ] The most urgent asset is at the top; an asset never inspected is at the bottom with "Not inspected yet".
- [ ] An asset without a coated area shows "-" for area.

---

## Step 5: engineer review and roles

### Roles
| Role | Stored as | Can |
|---|---|---|
| Inspector | `user` | Scan; add sites and assets; edit or delete their own |
| Engineer | `engineer` | Edit or delete any site, asset or scan; review scans |
| Admin | `admin` | Everything an engineer can, plus manage accounts |

Existing accounts become Inspectors with no data change, because the stored value `user` is kept.

### Review
- An engineer either **confirms** the AI reading or **corrects** it (rust %, optionally the distribution) with a required note.
- A corrected value replaces the AI value for the grade, the maintenance answer and the trend. The AI value is kept and shown beside it.
- A review can be withdrawn.
- `GET /review-agreement` pairs AI grades with engineer grades. This is the data for the agreement study in Step 7.

### Check by hand
- [ ] As an Inspector, the review buttons are not shown.
- [ ] As an Engineer, correct a scan from 14% to 16%: the grade and action level follow 16%, and "Corrected by engineer" appears in the register.
- [ ] Withdraw the review: the AI values return.

---

## Step 6: inspection report and CSV export

### What changed
- **Inspection report** (from a scan): site, asset, element type, environment, inspector, date, the photo, rust %, ASTM rating, strategy, surface preparation, timing, the asset's trend chart, review status, limits and signature lines.
- **Site condition report** (from a site): counts and area per action level, and the full priority register.
- **Export CSV** on the site page and the site report: one row per asset, ready for a spreadsheet.
- Printing uses the browser's "Save as PDF". The print layout is black on white with no navigation.

When an asset has a measured rate, the scan report shows both timings and labels them: "Act within (assumed rate)" in the result, and below it the deadline from the asset's trend, which the report says replaces the first.

### Check by hand
- [ ] Print a scan report: no sidebar or header; the photo, the scale bar and the trend chart print.
- [ ] Export CSV opens correctly in Excel.

---

## Step 7: evidence for the paper

The code supports two studies. Both need people and are done outside the code.

1. **Engineer agreement.** An engineer reviews a sample of scans (or the test photos) against the ASTM D610 pictorial standard using the review buttons. The dashboard's "Engineer review" card and `GET /review-agreement` give exact and within-one-grade agreement, ready for a weighted kappa.
2. **User evaluation.** Engineers and maintenance staff use the system and answer a recognised instrument.

**Demo data.** [`backend/tools/seed_demo_series.py`](../backend/tools/seed_demo_series.py) runs a folder of photos through the real pipeline and saves them with simulated dates, so a trend can be shown without waiting months. The site it creates is marked `is_demo` and shows a "Demo data" label on the site list, the site page, the asset page and the reports. Run it with `--dry-run` first. It has not yet been run against the real database.

---

## Step 8: dashboard

The dashboard is the first page after sign-in.

| Part | Shows |
|---|---|
| Four tiles | Assets inspected; needing coating work; critical or overdue; area to treat |
| Assets by action level | How many assets need each kind of work |
| Work coming due | Assets by the month their work is due, overdue first |
| Condition by site; by element type | Stacked bars by urgency group |
| Inspections per month | The last 12 months |
| Engineer review | Confirmed, corrected, not reviewed; AI grade against engineer grade |
| Priority register | The ten most urgent assets across all sites |

Every chart has a "Reading:" line in plain words and a table view. Status colours always come with a text label.

---

## Step 9: interface

- A sidebar that stays visible on wide screens (Dashboard, Sites and assets, New scan, My scans, Scan statistics, Admin), and a menu button on phones.
- Breadcrumbs: Sites and assets › site › asset.
- One scan pop-up: photo check first, then the asset, then start.
- On phones: "Scan this asset" opens the camera directly, and New scan lets the phone offer the camera or the gallery; pages stack into one column; wide tables scroll sideways with a hint.
- Empty states say what to do next ("Add a site").

### Fixes found while checking the screens
- Older pages used a fixed 896 px grid. Phones zoomed out to fit it, and with the sidebar it overflowed laptops narrower than about 1150 px. The grid now shrinks.
- The scan detail page hid half its content on phones. Its scan strip is now hidden below tablet width and its cards stack.
- "No corrosion regions detected" no longer covers thumbnails or escapes the photo when printed.
- A scan of an asset now says that its own projection uses the assumed rate and that the asset page has the measured one.

### Check by hand
- [ ] On a phone: the menu button opens the navigation; "Scan this asset" opens the camera; the result reads top to bottom.
- [ ] On a laptop: the sidebar stays visible and no page scrolls sideways.
