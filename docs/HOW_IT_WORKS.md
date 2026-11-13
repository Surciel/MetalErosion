# How the system works and calculates

A quick guide to what happens to a photo, from upload to the maintenance answer. Every number here is taken from the backend code and the current `backend/.env` settings.

## The whole pipeline at a glance

| # | Step | Question it answers | Output |
|---|---|---|---|
| 1 | Photo checks | Is this photo usable? | Pass, pass with a warning, or reject |
| 2 | Metal check | Is there metal in it? | Pass or reject ("No metal surface detected") |
| 3 | Rust measurement | How much of the metal is rusted? | Rust % |
| 4 | ASTM grade | How bad is that on the standard scale? | Grade 10 (clean) to 0 (worst) |
| 5 | Spread analysis | How is the rust laid out? | Type S, G, P or H, plus a spread value |
| 6 | Prediction | How long until it is critical? | Days to critical and a priority |
| 7 | Decision support | What should the owner do? | Action, steps and timing |

Each step runs only if the one before it passed. Steps 1 and 2 run twice: once when the photo is chosen (to unlock the category picker) and again when the scan starts.

---

## Step 1. Photo checks

Checked in this order. The first failure rejects the photo.

| Check | How it is measured | Reject | Warn (still analysed) |
|---|---|---|---|
| Format | The file's first bytes, not its name | Not JPEG, PNG or WebP | |
| Size | Shortest side in pixels | Under 64 px | |
| Lighting | Average lightness (0 = black, 255 = white) | Under 35 (too dark) or over 230 (too bright) | Under 70 (dim) or over 200 (glare) |
| Sharpness | Edge strength score (see below) | Under 12 | Under 40 |

**Lighting** also rejects a photo when 85% or more of its pixels are near-black, or 60% or more are blown-out white. Glare on 25% or more of the pixels gives a warning.

**Sharpness** works like this:

1. Shrink the photo to 640 px and convert it to grey.
2. Apply a Laplacian filter, which lights up edges. A sharp photo has strong edges; a blurry one does not.
3. Split the photo into a 6 × 6 grid and measure the variance of the edges in each block.
4. Take the 90th percentile block as the score. This way a sharp object in front of a blurry background still counts as sharp.

## Step 2. Metal check

Two AI models must both agree there is metal.

1. **Classifier** (`metal_cls.pt`). Looks at the whole photo and gives a probability that it shows metal. It must be **0.40 or higher**.
2. **Segmentation model** (`best.pt`). Draws outlines around "metal" and "rust" areas, each with a confidence. The photo passes if outlines with confidence **0.50 or higher** cover at least **5% of the photo**. Either metal or rust outlines can satisfy this, so a fully rusted object with no clean metal showing still passes.

## Step 3. Rust measurement

The setting in use is `RUST_MEASUREMENT=hybrid`: the AI finds *where* to look, and colour decides *what counts*.

1. **Surface** = every pixel the model outlined as metal or rust (confidence 0.15 or higher). Background, hands and handles are left out.
2. **Rust-coloured pixels** inside that surface are found by colour, in HSV:
   - Hue 0 to 25 or 170 to 179 (red, orange, brown)
   - Saturation 40 or more (not grey)
   - Brightness 30 to 200 (not black shadow, not white glare)
3. **Hybrid filter**: a rust-coloured pixel is kept only if it sits in or near an area the model marked as rust (within 2% of the photo's longer side). This stops clean but reddish metal, such as copper tones, from being counted.

```
rust % = rust pixels kept ÷ surface pixels × 100
```

The rust % is a share of the **metal surface**, not of the whole photo.

## Step 4. ASTM D610 grade

The rust % is looked up on the ASTM D610 scale.

| Rust % up to | Grade | | Rust % up to | Grade |
|---|---|---|---|---|
| 0.01 | 10 | | 3 | 5 |
| 0.03 | 9 | | 10 | 4 |
| 0.1 | 8 | | 16 | 3 |
| 0.3 | 7 | | 33 | 2 |
| 1 | 6 | | 50 | 1 |
| | | | over 50 | 0 |

## Step 5. Spread analysis (distribution type)

Two measurements are taken from the rust pixels.

**Blobs.** Connected rust pixels form a blob. Each blob is sized against the surface:

- **Pinpoint**: smaller than 0.05% of the surface
- **Spot**: 0.2% of the surface or larger

**Spread (coverage).** The surface is divided into an 8 × 8 grid. A cell counts as rusted if at least 1% of its metal is rust.

```
coverage = rusted cells ÷ cells that contain metal      (0 to 1)
```

The type is then decided in this order. The first rule that fits wins.

| Order | Rule | Type |
|---|---|---|
| 1 | Coverage is 60% or more | **G** General |
| 2 | At least 1 spot, and 10 or more pinpoints that make up 5% or more of the rust area | **H** Hybrid |
| 3 | Pinpoints make up 50% or more of the rust area | **P** Pinpoint |
| 4 | Anything else | **S** Spot |

The grade and type are joined into the rating, for example **4-S**.

## Step 6. Prediction (days to critical)

**Critical** means 33% rust, the start of ASTM grade 1.

**a. Base rate, from the asset category** (% of the surface per day)

| Category | Rate | Rust-free to 33% |
|---|---|---|
| Hardware | 0.045 | about 2 years |
| Vehicles | 0.018 | about 5 years |
| Household | 0.009 | about 10 years |
| Metal Walls | 0.006 | about 15 years |
| Unmapped Category | 0.090 | about 1 year |

At startup, a linear regression is fitted for each category on 366 generated points (`rust = rate × day`, plus a little random noise). The fitted slope is used as the rate. Because the points are generated from the rate itself, the slope comes out almost equal to it (Hardware 0.045 becomes 0.04506). The rates are project assumptions, not measurements.

**b. Spread factor, from step 5.** Rust spread over more of the surface has more edges to grow from, so it is projected to grow faster.

```
spread factor = 0.85 + 0.45 × coverage
```

Concentrated in one place (coverage 0) gives × 0.85. Rust everywhere (coverage 1) gives × 1.30.

**c. Days to critical**

```
active rate      = base rate × spread factor
days to critical = (33 − rust %) ÷ active rate        (rounded down)
```

**How the time is shown.** The day count is kept exactly for the calculations, but it is displayed rounded: days under 2 months, months under 2 years, then whole years. Anything beyond 10 years is shown as "more than 10 years", because the rate is an assumption and a precise far-off figure would claim accuracy it does not have.

**d. Priority**

| Condition | Priority |
|---|---|
| Rust % is 33 or more | CRITICAL |
| 180 days or fewer | Elevated Priority |
| More than 180 days | Monitoring Required |

## Step 7. Decision support

Fixed rules turn the numbers into an action. The same scan always gives the same answer.

| Level | Rust % | Action |
|---|---|---|
| 1 | up to 0.03 | No repair, routine care |
| 2 | up to 1 | Touch up the rust spots |
| 3 | up to 10, type S | Repair the rusted areas |
| 4 | up to 10, type G, P or H | Repair the rusted areas and recoat the whole surface |
| 5 | under 33 | Remove all rust and coating, recoat fully |
| 6 | 33 or more | Critical: assess for replacement |

The steps shown under the action are worded for the asset category. Unmapped Category uses the generic steps.

**Timing** uses the same active rate as step 6, aimed at the next level's threshold (1%, 10% or 33%).

```
act within = (next threshold − rust %) ÷ active rate
scan again = half of that, kept between 30 and 365 days
```

---

## Worked example

A **Hardware** item, **5% rust**, in a few patches, with rust in a quarter of the grid cells (coverage 0.25).

| Step | Calculation | Result |
|---|---|---|
| Grade | 5% is over 3 and up to 10 | Grade **4** |
| Type | Coverage 25% is under 60%, few pinpoints | **S**, rating **4-S** |
| Spread factor | 0.85 + 0.45 × 0.25 | **0.9625** |
| Active rate | 0.04506 × 0.9625 | **0.0434** % per day |
| Days to critical | (33 − 5) ÷ 0.0434 | **645 days** |
| Priority | 645 is more than 180 | **Monitoring Required** |
| Action | 5% is between 1 and 10, type S | Level **3**: repair the rusted areas |
| Act within | (10 − 5) ÷ 0.0434 | **115 days** (about 4 months) |
| Scan again | 115 ÷ 2 | **57 days** |

## What is a standard and what is our assumption

| From a published standard | Our own assumption |
|---|---|
| The ASTM D610 grade table (step 4) | The category rates (step 6a) |
| The S, G, P, H type names (ASTM D610) | The cut-offs that pick the type (step 5) |
| The 1% and 10% action thresholds (ISO 4628-3, SSPC-PA Guide 5) | The spread factor range, 0.85 to 1.30 |
| | 33% as "critical" and 180 days as "elevated" |
| | The photo check thresholds (step 1) |

## Where each part lives

| Part | File |
|---|---|
| Photo checks | `backend/image_quality.py` |
| Metal check, segmentation, order of the steps | `backend/main.py` |
| Rust colour counting | `backend/rust_measurement.py` |
| Spread analysis | `backend/spread_analysis.py` |
| Category rates | `backend/asset_categories.py` |
| Grade, prediction, priority | `backend/predictive_engine.py` |
| Decision support | `backend/decision_support.py` |
