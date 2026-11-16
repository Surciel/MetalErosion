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
| 1 | Element type and exposure environment replace the consumer categories; professional wording | **Built, awaiting hand check** |
| 2 | Sites and assets: each scan belongs to a steel element | Not started |
| 3 | Trend per asset and a measured deterioration rate | Not started |
| 4 | Priority register: all assets on a site, ranked | Not started |
| 5 | Engineer review and roles (Inspector, Engineer, Admin) | Not started |
| 6 | Printable inspection report and CSV export | Not started |
| 7 | Evidence for the paper: engineer grading and user evaluation | Not started |
| 8 | Dashboard with graphs for interpretation (panel request) | Not started |
| 9 | Interface revamp (panel request) | Not started |

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
