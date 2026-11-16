"""Decision support: the maintenance answer shown for a scan, and where each rule comes from.

The answer is rule-based on purpose: the same scan always gives the same answer, and every
line can be traced to a row in this file. Nothing here changes the rust %, the ASTM grade,
the regression slope or the priority tier; it only turns them into an action.

THE RULES (rust % of the detected metal surface -> action level)
  1  up to 0.03%  (ASTM D610 grade 10-9)  no repair, routine care
  2  up to 1%     (grade 8-6)             spot touch-up
  3  up to 10%    (grade 5-4), Spot       spot repair
  4  up to 10%    (grade 5-4), General, Pinpoint or Hybrid
                                          spot repair and recoat the whole surface
  5  under 33%    (grade 3-2)             full removal and recoat
  6  33% and over (grade 1-0)             assess for replacement

WHAT EACH THRESHOLD RESTS ON (checked 2026-11-13; see SOURCES)
- 1%:  ISO 4628-3 rust grade Ri 3 is 1% rusted area, and ISO 12944 defines a paint
       system's durability as the time to its first major maintenance. Secondary summaries
       of ISO 12944 tie that point to Ri 3; the standard's own wording was not read.
- 10%: SSPC-PA Guide 5, as cited by S. Sondag (MnDOT) in JPCL, January 2016: at 10 to 15%
       coating deterioration, removal and replacement is preferred because spot touch-up
       is no longer economical. Guide 5 itself is paywalled and was not read.
- 33%: the system's own critical threshold (start of ASTM D610 grade 1), not a standard.

PROJECT RULES, NOT FROM A STANDARD
- Spot against scattered rust (level 3 against 4). ASTM D610 defines the distribution
  types; using them to choose between spot repair and a full recoat is this system's
  rule. Coating-industry articles say the same thing (breakdown in well-defined areas can
  be touched up, the same amount scattered over the surface cannot), but no such article
  could be opened and checked, so none is cited.
- "Act within" is the time the existing regression projects until the rust % crosses
  into the next level. It inherits the assumed environment rates (asset_profile.py).
- "Inspect again" is half of that time, kept between RESCAN_MIN_DAYS and
  RESCAN_MAX_DAYS. The yearly cap follows common annual inspection practice.
- The steps per action level name the maintenance painting strategy and the surface
  preparation grade for painted steel. The check added for each element type is general
  good practice, not taken from a standard.

WHO THIS IS WRITTEN FOR (since 2026-11-15)
Maintenance engineers and inspectors of painted steel elements. The wording names the
strategy (spot touch-up, spot repair, full overcoat, full removal) and the cleaning grade
an engineer would put in a work order.
"""

from typing import Optional

from asset_profile import ELEMENT_BY_NAME, ENVIRONMENT_BY_CODE
from predictive_engine import ASTM_D610_SCALE, CRITICAL_RUST_PERCENTAGE

# Upper rust % of each action level's band.
NO_ACTION_MAX = 0.03  # end of ASTM D610 grade 9
TOUCH_UP_MAX = 1.0  # ISO 4628-3 Ri 3
SPOT_REPAIR_MAX = 10.0  # SSPC-PA Guide 5 (10 to 15%)

RESCAN_MIN_DAYS = 30
RESCAN_MAX_DAYS = 365

# Agreement of the system's ASTM grade with the labelled test photos (105-image test
# split, tested settings). Update these if the models or settings change.
TESTED_GRADE_EXACT_PERCENT = 73
TESTED_GRADE_WITHIN_ONE_PERCENT = 88

SOURCES = {
    "ASTM_D610": {
        "label": "ASTM D610 / SSPC-VIS 2, Standard Practice for Evaluating Degree of Rusting on Painted Steel Surfaces (rust grades and distribution types).",
        "url": "https://store.astm.org/d0610-08r12.html",
    },
    "PA_GUIDE_5": {
        "label": "SSPC-PA Guide 5, Guide to Maintenance Coating of Steel Structures in Atmospheric Service, as cited in S. Sondag, \"MnDOT's Approach to Improving Bridge Maintenance Painting Operations\", Journal of Protective Coatings and Linings, January 2016 (removal and replacement preferred at 10 to 15% deterioration).",
        "url": "https://kta.com/improving-bridge-maintenance-painting/",
    },
    "ISO_4628_3": {
        "label": "ISO 4628-3, Paints and varnishes: Evaluation of degradation of coatings, Part 3: Assessment of degree of rusting (Ri 3 = 1% rusted area).",
        "url": "https://standards.iteh.ai/catalog/standards/iso/23b73de1-ea20-4c20-abb9-11ebfde8b7ac/iso-4628-3-2024",
    },
    "ISO_12944": {
        "label": "ISO 12944-1, Corrosion protection of steel structures by protective paint systems (durability is the expected time to first major maintenance).",
        "url": "https://standards.iteh.ai/catalog/standards/iso/b701a72d-668f-4d02-8732-28f03d0b72ad/iso-12944-1-2017",
    },
    "SURFACE_PREP": {
        "label": "SSPC surface preparation standards SP 2 (hand tool), SP 3 (power tool) and SP 6 (commercial blast) with their ISO 8501-1 equivalents, as summarised in the Sherwin-Williams surface preparation guide.",
        "url": "https://images.sherwin-williams.com/content_images/sw-pdf-surface-prep-guide.pdf",
    },
}

# level: (headline, the rule that selected it, source keys)
ACTION_LEVELS = {
    1: (
        "No maintenance painting required.",
        "ASTM D610 grades 10 and 9 mean no rust or only minute traces (up to 0.03%), so no coating work is called for.",
        ("ASTM_D610",),
    ),
    2: (
        "Spot touch-up.",
        "The rusted area is below 1%. That is the level (ISO 4628-3 Ri 3) at which a coating is treated as due for its first major maintenance under ISO 12944, so touch-up is enough for now.",
        ("ASTM_D610", "ISO_4628_3", "ISO_12944", "SURFACE_PREP"),
    ),
    3: (
        "Spot repair.",
        "The rusted area has passed 1% (ISO 4628-3 Ri 3), so maintenance is due. It is still under 10%, where repairing only the rusted areas remains the economical strategy (SSPC-PA Guide 5).",
        ("ASTM_D610", "ISO_4628_3", "ISO_12944", "PA_GUIDE_5", "SURFACE_PREP"),
    ),
    4: (
        "Spot repair and full overcoat.",
        "The rusted area is between 1% and 10%, where spot repair is normally economical (SSPC-PA Guide 5). Here the rust is scattered across the surface (an ASTM D610 General, Pinpoint or Hybrid pattern), so repairing it spot by spot would cover most of the surface. This system's rule is to overcoat the whole surface after the rusted areas are repaired.",
        ("ASTM_D610", "ISO_4628_3", "ISO_12944", "PA_GUIDE_5", "SURFACE_PREP"),
    ),
    5: (
        "Full removal and recoating.",
        "More than 10% of the surface is rusted. At 10 to 15% deterioration, removing and replacing the coating is preferred because spot touch-up is no longer economical (SSPC-PA Guide 5).",
        ("ASTM_D610", "PA_GUIDE_5", "SURFACE_PREP"),
    ),
    6: (
        "Critical: structural assessment before any coating work.",
        "33% or more of the surface is rusted, which is this system's critical level. A photo shows surface rust only, so the steel that remains has to be measured before the element is relied on.",
        ("ASTM_D610",),
    ),
}

DISTRIBUTION_REASONS = {
    "S": "The rust pattern is Spot (S): concentrated in a few localized areas.",
    "G": "The rust pattern is General (G): spread across most of the surface.",
    "P": "The rust pattern is Pinpoint (P): many very small points scattered over the surface.",
    "H": "The rust pattern is Hybrid (H): larger spots together with many scattered points.",
}

# level: (maintenance painting strategy, surface preparation grade)
STRATEGIES = {
    1: ("No maintenance painting", "None"),
    2: ("Spot touch-up", "Hand tool cleaning, SSPC-SP 2"),
    3: ("Spot repair", "Power tool cleaning, SSPC-SP 3"),
    4: ("Spot repair and full overcoat", "Power tool cleaning, SSPC-SP 3, then overall cleaning"),
    5: ("Full removal and recoating", "Abrasive blast cleaning, SSPC-SP 6 / ISO 8501-1 Sa 2 or better"),
    6: ("Structural assessment", "After assessment: SSPC-SP 6 / ISO 8501-1 Sa 2 or better"),
}

# Steps per action level, worded for painted steel. The SSPC grades say how thoroughly the
# surface is cleaned. A check for the element type is added to these (asset_profile.py).
LEVEL_STEPS: dict[int, tuple[str, ...]] = {
    1: (
        "Record the condition; no coating work is required.",
        "Keep the surface free of debris and standing water so it can dry.",
    ),
    2: (
        "Remove oil, grease and dirt from each rust spot (solvent cleaning, SSPC-SP 1).",
        "Clean each spot by hand to remove loose rust and loose paint (hand tool cleaning, SSPC-SP 2), and feather the edge of the sound coating.",
        "Prime the bare steel the same day with a primer compatible with the existing coating, then touch up the topcoat.",
    ),
    3: (
        "Remove oil, grease and dirt from the rusted areas (solvent cleaning, SSPC-SP 1).",
        "Clean each rusted area to sound metal with power tools (power tool cleaning, SSPC-SP 3), and feather the edge of the sound coating.",
        "Spot-prime the cleaned steel the same day with a primer compatible with the existing coating.",
        "Apply intermediate and finish coats over the repaired areas, overlapping onto the sound coating.",
    ),
    4: (
        "Clean every rusted area to sound metal with power tools (power tool cleaning, SSPC-SP 3), and spot-prime the cleaned steel the same day.",
        "Wash the whole surface and lightly abrade the sound coating so the new coat bonds.",
        "Check on a test patch that the overcoat is compatible with the existing coating and adheres to it.",
        "Apply a full overcoat to the whole surface.",
    ),
    5: (
        "Remove the existing coating and all rust from the whole surface by abrasive blast cleaning (commercial blast, SSPC-SP 6 / ISO 8501-1 Sa 2, or near-white SSPC-SP 10 / Sa 2\u00bd where the coating system requires it).",
        "Inspect the bare steel for pitting, thinning and holes before any coating is applied.",
        "Apply a complete coating system rated for the exposure environment (ISO 12944), priming on the same day as blasting.",
    ),
    6: (
        "Restrict the load on or the use of the element until it has been assessed.",
        "Have an engineer assess the remaining section: measure the steel thickness and inspect connections for loss of metal.",
        "Repair or replace the parts that fail the assessment.",
        "Where the element is kept, remove all rust and coating by abrasive blast cleaning and apply a complete coating system.",
    ),
}

# Used when no element type was recorded (scans saved before element types existed).
GENERIC_CHECK = "Check joints, fixings and places where water collects."
GENERIC_SAFETY = "Have load-bearing and safety parts physically inspected before they are relied on."

IF_DELAYED = {
    1: "No coating work is needed now. At the {rate} rate the rust is projected to pass 1% in {time}, when maintenance painting becomes due.",
    2: "In {time} the rust is projected to pass 1%. Touch-up is then no longer enough: the rusted areas need power tool cleaning to sound metal and priming.",
    3: "In {time} the rust is projected to pass 10%, where full removal and recoating is preferred over spot repair. That means blast cleaning and a complete coating system for the whole surface.",
    4: "In {time} the rust is projected to pass 10%, where full removal and recoating is preferred over an overcoat. That means blast cleaning and a complete coating system for the whole surface.",
    5: "In {time} the rust is projected to reach 33%, the critical level, where the element needs a structural assessment before any coating work.",
    6: "Rust this extensive can hide loss of section. Relying on the element without an assessment risks failure.",
}


def action_level(rust_percentage: float, distribution_type: Optional[str]) -> int:
    """The action level (1 to 6) for a rust % and distribution type."""
    if rust_percentage >= CRITICAL_RUST_PERCENTAGE:
        return 6
    if rust_percentage > SPOT_REPAIR_MAX:
        return 5
    if rust_percentage > TOUCH_UP_MAX:
        # Scattered rust (General, Pinpoint, Hybrid) is recoated as a whole surface.
        return 4 if distribution_type in ("G", "P", "H") else 3
    if rust_percentage > NO_ACTION_MAX:
        return 2
    return 1


def _next_threshold(level: int) -> Optional[float]:
    """Rust % at which the answer moves on from this level; None at the last level."""
    if level <= 2:
        return TOUCH_UP_MAX
    if level <= 4:
        return SPOT_REPAIR_MAX
    if level == 5:
        return CRITICAL_RUST_PERCENTAGE
    return None


# Projections further out than this are stated as "more than 10 years". The rate behind
# them is an assumption, so a precise far-off figure would claim accuracy it lacks.
MAX_STATED_YEARS = 10


def beyond_stated_range(days: int) -> bool:
    return days > MAX_STATED_YEARS * 365


def describe_days(days: int) -> str:
    """A day count in words people plan with: days, then months, then whole years."""
    if beyond_stated_range(days):
        return f"more than {MAX_STATED_YEARS} years"
    if days < 60:
        return f"about {days} day{'' if days == 1 else 's'}"
    if days < 730:
        return f"about {round(days / 30.4)} months"
    return f"about {int(days / 365 + 0.5)} years"


def _grade_band(grade: int) -> str:
    """The rust % range of an ASTM D610 grade, in words."""
    lower = 0.0
    for max_percentage, band_grade, _ in ASTM_D610_SCALE:
        if band_grade == grade:
            if lower == 0.0:
                return f"up to {max_percentage:g}%"
            return f"over {lower:g}% to {max_percentage:g}%"
        lower = max_percentage
    return "over 50%"


def build_decision_support(
    *,
    rust_percentage: float,
    astm_grade: int,
    distribution_type: Optional[str],
    element_type: Optional[str],
    environment: Optional[str],
    legacy_category: Optional[str] = None,
    days_to_critical: int,
    active_slope: float,
    priority_tier: str,
    lighting_status: Optional[str] = None,
    quality_warnings: Optional[list[str]] = None,
) -> dict:
    """The maintenance answer for one scan: what to do, how, by when, why and how sure.

    `element_type` and `environment` are None for scans saved before they were recorded;
    those scans carry a `legacy_category` (or nothing) and get the generic checks.
    """
    level = action_level(rust_percentage, distribution_type)
    headline, rule, source_keys = ACTION_LEVELS[level]
    strategy, surface_preparation = STRATEGIES[level]
    element = ELEMENT_BY_NAME.get(element_type or "")
    exposure = ENVIRONMENT_BY_CODE.get(environment or "")

    steps = list(LEVEL_STEPS[level])
    steps.append(element.check if element else GENERIC_CHECK)
    if level >= 5:
        steps.append(element.safety if element else GENERIC_SAFETY)

    # --- By when ---------------------------------------------------------------------
    threshold = _next_threshold(level)
    if threshold is None or active_slope <= 0:
        days_to_next: Optional[int] = None
    elif level == 5:
        # Same figure the result already shows as "days to critical".
        days_to_next = int(days_to_critical)
    else:
        days_to_next = int(max(0.0, (threshold - rust_percentage) / active_slope))

    # Level 1 needs no coating work, so it has a date to look again but nothing to act on.
    act_within_days = days_to_next if 2 <= level <= 5 else None
    rescan_in_days = (
        None
        if days_to_next is None
        else int(min(RESCAN_MAX_DAYS, max(RESCAN_MIN_DAYS, days_to_next // 2)))
    )

    if level == 6:
        summary = "Act now, before the element is relied on again."
    elif level == 1:
        summary = f"Inspect again in {describe_days(rescan_in_days)}."
    elif act_within_days == 0:
        summary = "Carry out now: the rust is at the edge of the next level."
    elif beyond_stated_range(act_within_days):
        summary = (
            f"Not urgent: the next level is projected to be "
            f"{describe_days(act_within_days)} away. Inspect again in "
            f"{describe_days(rescan_in_days)}."
        )
    else:
        summary = (
            f"Carry out within {describe_days(act_within_days)}, and inspect again in "
            f"{describe_days(rescan_in_days)} to confirm the repair is holding."
        )

    if days_to_next is None:
        if_delayed = IF_DELAYED[6]
    elif days_to_next == 0:
        if_delayed = IF_DELAYED[level].format(time="less than a day", rate="assumed")
    else:
        if_delayed = IF_DELAYED[level].format(time=describe_days(days_to_next), rate="assumed")

    # --- Why -------------------------------------------------------------------------
    reasons = [
        f"{rust_percentage:g}% of the detected steel surface is rusted, which is ASTM D610 "
        f"grade {astm_grade} ({_grade_band(astm_grade)})."
    ]
    if distribution_type in DISTRIBUTION_REASONS:
        reasons.append(DISTRIBUTION_REASONS[distribution_type])
    reasons.append(rule)
    if level < 6:
        if exposure:
            rate_owner = f"Exposure {exposure.code} ({exposure.name.lower()})"
        elif legacy_category:
            rate_owner = f"The earlier \"{legacy_category}\" category of this scan"
        else:
            rate_owner = "No exposure environment was recorded, so the earlier default"
        adjusted = " after the spread adjustment" if distribution_type else ""
        reasons.append(
            f"{rate_owner} gives a projected rate of {active_slope:.3f}% of the surface "
            f"per day{adjusted}, which reaches the 33% critical level in "
            f"{describe_days(int(days_to_critical))}. Priority: {priority_tier}."
        )
    if exposure and level >= 2:
        reasons.append(exposure.note)

    # --- How sure --------------------------------------------------------------------
    photo_flags = list(quality_warnings or [])
    if lighting_status in ("low_light", "overexposed"):
        photo_flags.append(lighting_status)
    limits = []
    if photo_flags:
        limits.append(
            "This photo was flagged for lighting, sharpness or framing, which lowers "
            "confidence in the reading. Retake the photo before acting on this result."
        )
    limits.append(
        "The result is based on visible surface rust in one photo. It cannot measure "
        "pitting depth or loss of section, so it supports an inspection and does not "
        "replace one."
    )
    if level < 6:
        limits.append(
            "The timing uses the assumed baseline rate for the exposure environment, not "
            "a rate measured on this element."
        )
    limits.append(
        f"In testing, the ASTM grade matched the labelled photos exactly "
        f"{TESTED_GRADE_EXACT_PERCENT}% of the time and within one grade "
        f"{TESTED_GRADE_WITHIN_ONE_PERCENT}% of the time, so a result near a boundary "
        "may belong to the neighbouring level."
    )

    return {
        "level": level,
        "headline": headline,
        "strategy": strategy,
        "surface_preparation": surface_preparation,
        "summary": summary,
        "steps": steps,
        "act_within_days": act_within_days,
        "rescan_in_days": rescan_in_days,
        "reasons": reasons,
        "if_delayed": if_delayed,
        "limits": limits,
        "confidence": "reduced" if photo_flags else "normal",
        "sources": [SOURCES[key] for key in source_keys],
    }
