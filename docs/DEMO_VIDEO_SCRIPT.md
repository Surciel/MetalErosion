# RustScan demo video script: scanning a steel element

**Length:** about 9 to 10 minutes. **Format:** screen recording with voice-over, plus short phone clips of the photo being taken.

Each scene lists what to do on screen (**On screen**) and what to say (**Say**). The spoken lines are written to be read aloud; change the wording to suit your voice, but keep the facts as they are, because they match what the system does.

---

## Before you record

**Accounts**
- An **Engineer** account to record with, so the review step is available. (Admin page → set the role to Engineer, or run the SQL at the end of migration 008.)

**Data**
- One site and one asset already set up, to show the finished state. You will also add a new one on camera in Scene 3.
- For the trend in Scene 8: an asset with at least 3 inspections spanning 7 days or more. If you use `backend/tools/seed_demo_series.py` for this, the site is marked **Demo data**. Leave that label visible and say it is demo data (the line is in Scene 8).

**Photos**
1. **A good photo:** painted steel with visible rust (a railing, gate, roof sheet or beam). Even daylight, in focus, the steel filling most of the frame.
2. **A non-metal photo** (wood, a wall, a plant) for the rejection demo.
3. *(Optional)* **A very dark photo** for the lighting check.

**Screen**
- Use a browser window about 1366 px wide, zoomed to 100%. Sign in before you start recording.
- Close other tabs and notifications.
- The first scan after the server starts can take longer while the models load. Run one scan before recording.

---

## Scene 1: Introduction (0:00 to 0:30)

**On screen:** Landing page, then sign in.

**Say:**
> This is RustScan, a web-based system for maintenance engineers and site inspectors who look after painted steel: structural members, roofing, railings, gates, tanks and equipment supports.
>
> Anyone can see that steel is rusty. What a person cannot do reliably by eye is grade it the same way every time, tell 8% rust from 12%, which is the line between spot repair and repainting the whole surface, or say how fast it is getting worse. RustScan does that from a photo, and keeps a dated record for every steel element.

---

## Scene 2: The dashboard (0:30 to 1:00)

**On screen:** Dashboard after sign-in. Point to the four tiles, then the "Assets by action level" chart and the priority register at the bottom.

**Say:**
> After signing in, the dashboard shows the condition of every steel element we track: how many need coating work, which are critical, and the total area to treat. Each chart has a one-line reading under it, so you don't have to interpret the graph yourself.
>
> At the bottom is the priority register: the most urgent elements first. Now let's add an element and scan it.

---

## Scene 3: Set up the site and the asset (1:00 to 2:15)

**On screen:**
1. Sidebar → **Sites and assets** → **Add a site**.
2. Fill in a name (e.g., "Engineering Building"), a location, and the **Exposure environment**. Pause on the list so it can be read.
3. Save, open the site, then **Add an asset**.
4. Fill in a tag (e.g., "R-1"), a description ("Stair railing, 2nd floor"), the **Element type**, and the coated area in m² if known. Save.

**Say:**
> First, the site: the building or plant where the steel is. The important setting here is the exposure environment. It follows the ISO 12944 corrosivity categories: C2 for interiors and rural areas, C3 for urban areas, C4 for industrial or coastal sites, and C5 for marine or aggressive industrial sites. The environment sets the baseline rate at which rust is expected to spread, so the same rust on the coast is more urgent than indoors.
>
> Next, the asset: one steel element on that site. We give it a tag, like the mark on a drawing, and choose its element type. The element type adds what to check on that kind of element, such as joints and fixings on a railing. The coated area is optional. If we enter it, the system can tell us how many square metres need work.

---

## Scene 4: Taking a good photo (2:15 to 2:50)

**On screen:** Phone clip of you photographing the element. Show one good framing. If you have them, briefly show bad examples: too far away, in shadow, blurred.

**Say:**
> The result is only as good as the photo. Four things matter:
> - **Even light.** Daylight or even indoor light; no flash or direct sun glaring off the paint.
> - **In focus.** Hold steady and tap to focus on the steel.
> - **Fill the frame.** The steel element should take up most of the photo, not the background.
> - **One element per photo.** Each photo is one inspection of one asset.

---

## Scene 5: Starting the scan (2:50 to 3:45)

**On screen:**
1. Open the asset page (Sites and assets → the site → **R-1**).
2. Click **Scan this asset**. On a phone this opens the camera; on a computer, choose your good photo.
3. The **New inspection scan** pop-up opens. Pause on "Checking the photo for a steel surface…", then "Steel surface detected. This photo can be scanned."
4. Show that the site and asset are already chosen. Optionally edit the scan name.
5. Click **Start scan**.

**Say:**
> From the asset's page, we choose "Scan this asset". On a phone this goes straight to the camera.
>
> Before anything is analysed, the system checks the photo: that it's a real image file, large enough, not too dark or too bright, not too blurry, and that it actually shows metal. The green line tells us this photo can be scanned.
>
> Because we started from the asset, the site and the asset are already filled in. The element type comes from the asset and the exposure from its site, so the inspector doesn't have to choose them again.
>
> We can also do a quick scan without an asset. Then we choose the element type and the exposure environment ourselves.

*(While saying the last line, click the "Quick scan, no asset" tab once to show it, then switch back before starting.)*

---

## Scene 6: How the system detects rust (3:45 to 5:00)

**On screen:** The "Analyzing your image…" screen. When results open, keep the photo on screen while you explain. You can cut to a simple diagram here if you have one.

**Say:**
> While the scan runs, the photo goes through the same checks again on the server, then through two trained models.
>
> **First, a classification model** looks at the whole photo and answers one question: is there a metal surface here? If not, the scan stops. This keeps random photos out of the records.
>
> **Second, a segmentation model** outlines, pixel by pixel, where the metal surface is and where it sees rust.
>
> **Then the rust is measured.** Inside the metal surface, the system counts rust-coloured pixels, but only in or near the areas the model marked as rust. That stops brown paint or shadows on clean metal from being counted. The rust percentage is the rusted pixels divided by the whole metal surface. The background doesn't count.
>
> **The pattern of the rust** is classified next, using the four ASTM D610 types: Spot, where rust is concentrated in a few areas; General, spread across the surface; Pinpoint, many tiny points; and Hybrid, a mix.
>
> **The rust percentage gives the ASTM D610 grade,** from 10, no rust, down to 0, more than half the surface rusted. The grade and the pattern together make the rating, for example "4-S".
>
> Finally, the decision support picks one of six action levels, from "no coating work" up to "structural assessment", and works out the timing from the exposure environment's rate.

---

## Scene 7: Reading the result (5:00 to 6:45)

**On screen, in order:**
1. The severity pop-up appears first. Read its headline, then close it.
2. **The photo:** hover over a highlighted rust region to show its details.
3. **Corrosion %** and **Classification** (e.g., "ASTM 4-S"). Point to the asset, element and exposure line under it.
4. Scroll to **Projected corrosion** and **Position on the ASTM D610 scale**.
5. Scroll to **Decision Support**: the badge and instruction, the "Act within" tile, the "Based on" chips, the level ladder, the timeline, the step cards. Tap one card to show its full sentence. Open **Show the full explanation** briefly, then close it.

**Say:**
> When the scan finishes, a pop-up gives the severity first, so an urgent result can't be missed.
>
> On the photo, the highlighted boxes are the largest rust areas the system measured. Hovering over one shows its details.
>
> The corrosion percentage is the share of the steel surface that is rusted. Here it's [read the number]. That gives ASTM D610 rating [read the rating]: grade [number], with a [Spot / General / Pinpoint / Hybrid] pattern.
>
> The projection chart shows how the rust is expected to grow at this environment's rate, and when it reaches the 33% critical level. The ASTM scale shows where this grade sits between 10 and 0.
>
> The decision support answers what an engineer needs to know. At the top is the action and how long we have: [read the badge, the instruction, and the "Act within" time]. The ladder shows where this scan sits among the six action levels, and the rust percentage at which it moves to the next one. The timeline shows what happens when: when to inspect again, when to act, and when it becomes critical.
>
> Below that are the steps, with the surface preparation grade on each one, such as SSPC-SP 3 for power tool cleaning. Tapping a step shows the full instruction. The complete reasoning, the limits of the result and the standards behind the rules are one click away, under "Show the full explanation".

---

## Scene 8: When the photo is not usable (6:45 to 7:20)

**On screen:** **New scan** → choose the non-metal photo → the pop-up rejects it. *(Optional: the dark photo is rejected for lighting.)*

**Say:**
> If the photo isn't usable, the system says why instead of guessing. This photo has no metal surface, so it's rejected before anything is analysed or saved.
>
> *(Optional)* This one is too dark. The system asks for the photo to be retaken in brighter, even light. Borderline photos are still analysed, but the result is flagged so we know to be careful.

---

## Scene 9: Tracking the element over time (7:20 to 8:15)

**On screen:** Open the asset with several inspections. Show the **Rust over time** chart, the **Deterioration rate** box ("Measured from N inspections"), and the **Inspections** table. Then open its site and show the **Priority register**.

**Say:**
> The value of the system grows with each inspection. Every scan of this asset is added to its history.
>
> With three or more inspections spanning at least a week, the system fits a trend through them and measures how fast rust is actually growing on this element, instead of relying only on the assumed rate for its environment. Here it is measured from [N] inspections, at [rate] per day.
>
> On the site page, every asset is ranked by urgency, so a limited maintenance budget goes to the right elements first.

*If this asset uses seeded data, add:*
> These inspections are demo data. The dates are simulated so the trend can be shown, but each rust percentage is a real measurement of its photo.

---

## Scene 10: Engineer review (8:15 to 8:45)

**On screen:** Open a scan → **Engineer review** → **Confirm the AI reading**, or **Correct the reading** with a value and a note.

**Say:**
> The system proposes; the engineer decides. An engineer can confirm the reading or correct it with a note. A corrected value is used everywhere from then on, and the system's original reading is kept beside it, so we can always see where the two agreed.

---

## Scene 11: The inspection report (8:45 to 9:20)

**On screen:** **Inspection report** → show the page → **Print or save as PDF**. *(Optional: from the site page, **Site report** and **Export CSV**.)*

**Say:**
> Every scan produces an inspection report: the element, the photo, the measurement, the action and its timing, the trend, the review, and lines for signatures. It prints, or saves as a PDF, for the maintenance file.
>
> For a whole site, the site report and the CSV export give the full register.

---

## Scene 12: Closing (9:20 to 9:45)

**On screen:** Back to the dashboard.

**Say:**
> To sum up: photograph the steel element, the system checks the photo, finds the metal and the rust, grades it under ASTM D610, and recommends the maintenance action and when to do it. Over repeated inspections, it measures how fast each element is deteriorating and ranks them by urgency.
>
> One limit to keep in mind: RustScan measures visible surface rust from a photo. It cannot measure pitting depth or loss of steel section, so it supports an inspection and does not replace one. In testing, its grade matched the labelled photos exactly 73% of the time, and within one grade 88% of the time.
>
> Thank you for watching.

---

## Recording checklist

- [ ] Engineer account signed in; one scan already run so the models are warm.
- [ ] Good photo, non-metal photo and (optional) dark photo ready in one folder.
- [ ] An asset with 3+ inspections for Scene 9 (labelled demo data if seeded).
- [ ] Browser at 100% zoom, notifications off.
- [ ] Fill in the bracketed parts of Scenes 7 and 9 from the result you actually get.

## Facts to keep exact

| Claim | Value |
|---|---|
| Rust % is measured against | the detected metal surface, not the whole photo |
| Rust is counted | rust-coloured pixels in or near model-marked rust, inside the metal surface |
| Distribution types | Spot (S), General (G), Pinpoint (P), Hybrid (H): ASTM D610 |
| Grades | 10 (no rust) to 0 (over 50% rusted) |
| Action levels | 6: no work, touch-up, spot repair, spot repair and overcoat, full recoat, structural assessment |
| Thresholds | 0.03%, 1%, 10%, 33% |
| Measured rate needs | 3 or more inspections spanning at least 7 days |
| Tested agreement | grade exact 73%, within one grade 88% |
| Exposure classes | C2 to C5 (ISO 12944) |
