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
  into the next level. It inherits the assumed category rates (asset_categories.py).
- "Scan again" is half of that time, kept between RESCAN_MIN_DAYS and RESCAN_MAX_DAYS.
  The yearly cap follows common annual inspection practice.
- The steps per asset category are general good practice worded for that kind of object.
"""

from typing import Optional

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
        "No repair needed. Keep up routine care.",
        "ASTM D610 grades 10 and 9 mean no rust or only minute traces (up to 0.03%), so no repair is called for.",
        ("ASTM_D610",),
    ),
    2: (
        "Touch up the rust spots.",
        "The rusted area is below 1%. That is the level (ISO 4628-3 Ri 3) at which a coating is treated as due for its first major maintenance under ISO 12944, so touch-up is enough for now.",
        ("ASTM_D610", "ISO_4628_3", "ISO_12944", "SURFACE_PREP"),
    ),
    3: (
        "Repair the rusted areas.",
        "The rusted area has passed 1% (ISO 4628-3 Ri 3), so maintenance is due. It is still under 10%, where repairing only the rusted areas remains the economical strategy (SSPC-PA Guide 5).",
        ("ASTM_D610", "ISO_4628_3", "ISO_12944", "PA_GUIDE_5", "SURFACE_PREP"),
    ),
    4: (
        "Repair the rusted areas and recoat the whole surface.",
        "The rusted area is between 1% and 10%, where spot repair is normally economical (SSPC-PA Guide 5). Here the rust is scattered across the surface (an ASTM D610 General, Pinpoint or Hybrid pattern), so repairing it spot by spot would cover most of the surface. This system's rule is to recoat the whole surface after the rusted areas are repaired.",
        ("ASTM_D610", "ISO_4628_3", "ISO_12944", "PA_GUIDE_5", "SURFACE_PREP"),
    ),
    5: (
        "Remove all rust and old coating, then recoat fully.",
        "More than 10% of the surface is rusted. At 10 to 15% deterioration, removing and replacing the coating is preferred because spot touch-up is no longer economical (SSPC-PA Guide 5).",
        ("ASTM_D610", "PA_GUIDE_5", "SURFACE_PREP"),
    ),
    6: (
        "Critical: have it assessed for replacement.",
        "33% or more of the surface is rusted, which is this system's critical level. A photo shows surface rust only, so the metal that remains has to be checked physically before the item is trusted.",
        ("ASTM_D610",),
    ),
}

DISTRIBUTION_REASONS = {
    "S": "The rust pattern is Spot (S): concentrated in a few localized areas.",
    "G": "The rust pattern is General (G): spread across most of the surface.",
    "P": "The rust pattern is Pinpoint (P): many very small points scattered over the surface.",
    "H": "The rust pattern is Hybrid (H): larger spots together with many scattered points.",
}

GENERIC = "Generic"

# Steps per asset category and action level. General good practice, worded for the kind
# of object; the named SSPC grades say how thoroughly the surface is cleaned.
CATEGORY_METHODS: dict[str, dict[int, tuple[str, ...]]] = {
    GENERIC: {
        1: (
            "Keep the surface clean and dry.",
            "Leave the existing coating as it is.",
            "Check it again at the next routine inspection.",
        ),
        2: (
            "Clean each rust spot by hand with a wire brush or abrasive paper until the loose rust is gone (hand tool cleaning, SSPC-SP 2).",
            "Wipe off the dust and let the surface dry.",
            "Apply a rust-inhibiting primer to the cleaned spots, then a matching topcoat.",
        ),
        3: (
            "Remove all rust and loose paint in each affected area with a power wire brush or sanding disc (power tool cleaning, SSPC-SP 3).",
            "Feather the edges of the sound paint around each area.",
            "Prime the cleaned metal with a rust-inhibiting primer on the same day.",
            "Apply a topcoat over the repaired areas, overlapping onto the sound paint.",
        ),
        4: (
            "Clean every rusted area to sound metal with a power wire brush or sanding disc (power tool cleaning, SSPC-SP 3).",
            "Wash and lightly abrade the rest of the surface so new paint bonds to it.",
            "Prime the cleaned metal with a rust-inhibiting primer on the same day.",
            "Apply a full topcoat over the whole surface.",
        ),
        5: (
            "Remove the old coating and all rust from the whole surface, by abrasive blasting (commercial blast, SSPC-SP 6 / ISO 8501-1 Sa 2) or by power tools to bare metal.",
            "Check the bare metal for pitting, thinning and holes.",
            "Apply a full primer and topcoat system on the same day.",
            "Replace the part instead if cleaning exposes deep pitting or holes.",
        ),
        6: (
            "Stop relying on the item for any load-bearing or safety purpose until it has been checked.",
            "Have a qualified person inspect it for pitting, holes and loss of thickness.",
            "Replace it if the metal is thinned, perforated or cracked.",
            "If it is found sound, strip it to bare metal and apply a complete coating system.",
        ),
    },
    "Hardware": {
        1: (
            "Wipe the item clean and dry after use.",
            "Put a thin film of light oil on bare steel parts.",
            "Store it in a dry place.",
        ),
        2: (
            "Rub the rust spots with a wire brush, steel wool or an abrasive pad until the loose rust is gone (hand tool cleaning, SSPC-SP 2).",
            "Wipe the item clean and dry it fully.",
            "Coat bare steel with light oil or a rust-preventive spray, and repaint any painted parts.",
        ),
        3: (
            "Remove the rust in each area with a power wire brush or coarse abrasive (power tool cleaning, SSPC-SP 3). A rust-remover soak also works for small items.",
            "Rinse or wipe the item clean and dry it fully straight away.",
            "Protect the bare steel with oil, a rust-preventive spray, or primer and paint.",
            "Check that moving parts, cutting edges and threads still work, and replace the item if they do not.",
        ),
        4: (
            "Remove the scattered rust over the whole item with a power wire brush (power tool cleaning, SSPC-SP 3) or a rust-remover soak.",
            "Rinse or wipe the item clean and dry it fully straight away.",
            "Protect the whole item with oil, a rust-preventive spray, or primer and paint.",
            "Check that moving parts, cutting edges and threads still work, and replace the item if they do not.",
        ),
        5: (
            "Strip the whole item to bare metal with a power wire brush, abrasive blasting or a rust-remover soak.",
            "Check it for pitting, cracks, worn threads and loose joints.",
            "Replace it if this work costs more than a new item, or if it carries load (bolts, chains, lifting or cutting tools) and shows pitting.",
            "If you keep it, protect all bare steel with primer and paint or a rust-preventive coating.",
        ),
        6: (
            "Stop using the item, especially if it carries load or cuts.",
            "Check it for pitting, cracks, worn threads and loose joints.",
            "Replace it. At this level a new item is normally cheaper and safer than restoring the old one.",
        ),
    },
    "Vehicles": {
        1: (
            "Wash the panel, including seams and wheel arches, and dry it.",
            "Touch up stone chips before they start to rust.",
            "Keep drain holes clear so water does not sit inside the panel.",
        ),
        2: (
            "Sand each rust spot back to clean metal and feather the paint edge around it.",
            "Clean off dust and grease.",
            "Apply an anti-rust primer, then matching touch-up paint and clear coat.",
        ),
        3: (
            "Grind or sand each rusted area back to bright metal and feather the surrounding paint.",
            "Check for holes or soft metal. A perforated panel needs a body shop.",
            "Apply a rust converter or etch primer, then primer filler.",
            "Repaint the repaired areas with matching colour and clear coat.",
        ),
        4: (
            "Sand every rust spot across the panel back to bright metal.",
            "Scuff the rest of the panel so new paint bonds to it.",
            "Prime the bare metal with etch primer.",
            "Respray the whole panel instead of patching it, and check the inner side and seams for rust.",
        ),
        5: (
            "Have the panel stripped to bare metal and inspected, including its inner side.",
            "Have any perforated or thin metal cut out and replaced.",
            "Apply an epoxy or etch primer, then respray the whole panel.",
            "If the rust is underneath the vehicle, have the frame, suspension mounts and brake lines checked.",
        ),
        6: (
            "If the rust is on structural parts (frame, sills, suspension mounts), have the vehicle inspected by a qualified mechanic or body shop before driving it further.",
            "Have perforated panels cut out and replaced. Patching over them does not last.",
            "Strip, prime and respray the areas that are kept.",
        ),
    },
    "Household": {
        1: (
            "Wipe the surface clean and dry.",
            "Keep the item out of standing water where possible.",
            "Touch up any chipped paint.",
        ),
        2: (
            "Clean each rust spot by hand with a wire brush or abrasive paper until the loose rust is gone (hand tool cleaning, SSPC-SP 2).",
            "Wipe off the dust and let the surface dry.",
            "Apply a rust-inhibiting primer to the cleaned spots, then a matching enamel.",
        ),
        3: (
            "Remove all rust and loose paint in each affected area with a power wire brush or sanding disc (power tool cleaning, SSPC-SP 3).",
            "Feather the edges of the sound paint around each area.",
            "Prime the cleaned metal with a rust-inhibiting primer on the same day.",
            "Finish with a coating suited to the item: heat-resistant paint for grills, exterior enamel for gates and railings.",
        ),
        4: (
            "Clean every rusted area to sound metal with a power wire brush or sanding disc (power tool cleaning, SSPC-SP 3).",
            "Wash and lightly abrade the rest of the surface so new paint bonds to it.",
            "Prime the cleaned metal with a rust-inhibiting primer on the same day.",
            "Recoat the whole item with a coating suited to it: heat-resistant paint for grills, exterior enamel for gates and railings.",
        ),
        5: (
            "Strip the whole surface to bare metal with power tools or abrasive blasting (commercial blast, SSPC-SP 6 / ISO 8501-1 Sa 2).",
            "Check for pitting and holes, especially at joints, feet and welds.",
            "Apply a full primer and topcoat system suited to the item on the same day.",
            "Replace items that hold weight, gas or water (ladders, cylinders, tanks) if the metal is pitted or thin.",
        ),
        6: (
            "Stop using the item if it holds weight, gas or water (ladders, railings, cylinders, tanks) until it has been checked.",
            "Have it inspected for pitting, holes and loss of thickness.",
            "Replace it if the metal is thinned, perforated or cracked.",
            "If it is found sound, strip it to bare metal and apply a complete coating system.",
        ),
    },
    "Metal Walls": {
        1: (
            "Clear leaves and dirt from the sheet, laps and gutters so water drains away.",
            "Check fasteners and cut edges, where rust usually starts.",
            "Leave the existing coating as it is.",
        ),
        2: (
            "Wire-brush the rust spots, especially at fasteners, laps and cut edges (hand tool cleaning, SSPC-SP 2).",
            "Wash off the dust and let the sheet dry.",
            "Apply a zinc-rich primer to the cleaned spots, then roofing paint to match.",
        ),
        3: (
            "Clean each rusted area to sound metal with a power wire brush (power tool cleaning, SSPC-SP 3).",
            "Replace rusted fasteners and seal their holes.",
            "Prime the cleaned areas with a zinc-rich primer on the same day.",
            "Finish with roofing paint over the repaired areas.",
        ),
        4: (
            "Wire-brush every rust spot across the sheet to sound metal (power tool cleaning, SSPC-SP 3).",
            "Wash the whole sheet and let it dry.",
            "Prime the cleaned metal with a zinc-rich primer on the same day.",
            "Recoat the whole sheet with roofing paint, and replace rusted fasteners.",
        ),
        5: (
            "Remove all rust and failed coating from the sheet with power tools, or by abrasive blasting where that is possible (commercial blast, SSPC-SP 6 / ISO 8501-1 Sa 2).",
            "Check for holes and thin metal, especially at laps and fasteners, and replace sheets that are perforated.",
            "Prime the whole sheet with a zinc-rich primer on the same day.",
            "Apply a full roofing paint system and replace rusted fasteners.",
        ),
        6: (
            "Do not walk on or load the sheet. Heavily rusted roofing can give way.",
            "Have the sheets and their supports inspected for holes and loss of thickness.",
            "Replace sheets that are perforated or thin. Painting over them does not restore strength.",
            "Strip, prime and recoat the sheets that are found sound.",
        ),
    },
}

IF_DELAYED = {
    1: "No repair is needed now. At the assumed rate the rust is projected to pass 1% in {time}, when maintenance becomes due.",
    2: "In {time} the rust is projected to pass 1%. Touch-up is then no longer enough: the rusted areas need cleaning to sound metal and priming.",
    3: "In {time} the rust is projected to pass 10%, where removing and replacing the whole coating is preferred over spot repair. That takes more work and material.",
    4: "In {time} the rust is projected to pass 10%, where removing and replacing the whole coating is preferred. That takes more work and material.",
    5: "In {time} the rust is projected to reach 33%, the critical level, where the item has to be assessed for replacement.",
    6: "Rust this extensive can hide loss of metal. Using the item without a check risks the part failing.",
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


def describe_days(days: int) -> str:
    """A day count in words people plan with: days, then months, then years."""
    if days < 60:
        return f"about {days} day{'' if days == 1 else 's'}"
    if days < 730:
        return f"about {round(days / 30.4)} months"
    return f"about {days / 365:.1f} years"


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
    asset_category: Optional[str],
    days_to_critical: int,
    active_slope: float,
    priority_tier: str,
    lighting_status: Optional[str] = None,
    quality_warnings: Optional[list[str]] = None,
) -> dict:
    """The maintenance answer for one scan: what to do, how, by when, why and how sure.

    `asset_category` is None for scans saved before a category was recorded; the generic
    steps are used for them.
    """
    level = action_level(rust_percentage, distribution_type)
    headline, rule, source_keys = ACTION_LEVELS[level]
    methods = CATEGORY_METHODS.get(asset_category or GENERIC, CATEGORY_METHODS[GENERIC])

    # --- By when ---------------------------------------------------------------------
    threshold = _next_threshold(level)
    if threshold is None or active_slope <= 0:
        days_to_next: Optional[int] = None
    elif level == 5:
        # Same figure the result already shows as "days to critical".
        days_to_next = int(days_to_critical)
    else:
        days_to_next = int(max(0.0, (threshold - rust_percentage) / active_slope))

    # Level 1 needs no repair, so it has a date to look again but nothing to act on.
    act_within_days = days_to_next if 2 <= level <= 5 else None
    rescan_in_days = (
        None
        if days_to_next is None
        else int(min(RESCAN_MAX_DAYS, max(RESCAN_MIN_DAYS, days_to_next // 2)))
    )

    if level == 6:
        summary = "Act now, before the item is used again."
    elif level == 1:
        summary = f"Scan it again in {describe_days(rescan_in_days)}."
    elif act_within_days == 0:
        summary = "Do this now: the rust is at the edge of the next level."
    else:
        summary = (
            f"Do this within {describe_days(act_within_days)}, and scan again in "
            f"{describe_days(rescan_in_days)} to confirm the repair is holding."
        )

    if days_to_next is None:
        if_delayed = IF_DELAYED[6]
    elif days_to_next == 0:
        if_delayed = IF_DELAYED[level].format(time="less than a day")
    else:
        if_delayed = IF_DELAYED[level].format(time=describe_days(days_to_next))

    # --- Why -------------------------------------------------------------------------
    reasons = [
        f"{rust_percentage:g}% of the detected metal surface is rusted, which is ASTM D610 "
        f"grade {astm_grade} ({_grade_band(astm_grade)})."
    ]
    if distribution_type in DISTRIBUTION_REASONS:
        reasons.append(DISTRIBUTION_REASONS[distribution_type])
    reasons.append(rule)
    if level < 6:
        rate_owner = (
            f"The {asset_category} category"
            if asset_category
            else "No asset category was recorded, so the Hardware category"
        )
        adjusted = " after the spread adjustment" if distribution_type else ""
        reasons.append(
            f"{rate_owner} gives a projected rate of {active_slope:.3f}% of the surface "
            f"per day{adjusted}, which reaches the 33% critical level in "
            f"{describe_days(int(days_to_critical))}. Priority: {priority_tier}."
        )

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
        "pitting depth or lost metal thickness, so load-bearing and safety parts still "
        "need a physical inspection."
    )
    if level < 6:
        limits.append(
            "The timing uses the asset category's assumed starting rate, not a rate "
            "measured on this object."
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
        "summary": summary,
        "steps": list(methods[level]),
        "act_within_days": act_within_days,
        "rescan_in_days": rescan_in_days,
        "reasons": reasons,
        "if_delayed": if_delayed,
        "limits": limits,
        "confidence": "reduced" if photo_flags else "normal",
        "sources": [SOURCES[key] for key in source_keys],
    }
