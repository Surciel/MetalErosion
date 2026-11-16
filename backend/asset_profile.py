"""What an inspector records about a steel element: its type and its exposure environment.

This is the one place both lists live. The prediction engine, the upload validation, the
decision support wording and the pickers in the frontend all read from here.

TWO SEPARATE THINGS
- EXPOSURE ENVIRONMENT sets the baseline corrosion rate. It follows the atmospheric
  corrosivity categories of ISO 12944-2 / ISO 9223 (C2 to C5).
- ELEMENT TYPE sets what the inspector is told to check. It does not change the rate.

WHAT THE RATES REST ON (checked 2026-11-15)
- ISO 9223 and ISO 12944-2 give the first-year thickness loss of low-carbon steel in each
  corrosivity category: C2 over 1.3 to 25 um, C3 over 25 to 50 um, C4 over 50 to 80 um,
  C5 over 80 to 200 um.                                              [STEEL_INFO]
- Those are thickness-loss rates. No standard gives a rust-AREA growth rate ("% of a
  painted surface per day"), which is what this system projects.
- So the rates here are built in two parts:
    1. ANCHOR (project assumption): in a C3 urban atmosphere a rust-free painted surface
       reaches 33% rust in about 10 years, 0.009% of the surface per day.
    2. RATIOS (from the standard): the other categories are scaled from the anchor in
       proportion to the upper limit of their first-year steel loss (25 : 50 : 80 : 200).
- The anchor is replaced by a measured rate once the same element has been inspected
  repeatedly (per-asset trend).

Scans saved before this change carry one of the old object categories instead. Their rates
are kept in LEGACY_CATEGORY_RATES so that old results do not change.
"""

from dataclasses import dataclass

# Rust coverage at which a surface is treated as critical (start of ASTM D610 grade 1).
CRITICAL_RUST_PERCENTAGE = 33.0

SOURCES = {
    "STEEL_INFO": "SteelConstruction.info, 'Standard corrosion protection systems for buildings', atmospheric corrosivity categories and first-year low-carbon steel thickness loss from BS EN ISO 12944-2 (identical to BS EN ISO 9223). https://steelconstruction.info/topics/corrosion-protection/standard-corrosion-protection-systems-for-buildings",
    "ISO_9223": "ISO 9223:2012, Corrosion of metals and alloys: Corrosivity of atmospheres: Classification, determination and estimation. https://standards.iteh.ai/catalog/standards/iso/68645285-f78e-4245-9a7f-09bdb7c19dab/iso-9223-2012",
}

# The anchor: C3, rust-free to the critical level in about 10 years.
ANCHOR_ENVIRONMENT = "C3"
ANCHOR_RATE_PER_DAY = 0.009


@dataclass(frozen=True)
class Environment:
    code: str  # ISO 12944-2 corrosivity category
    name: str
    description: str  # Exterior and interior examples, shown under the option.
    steel_loss_um: tuple[float, float]  # First-year low-carbon steel loss, um (ISO 9223).
    note: str  # Shown with the maintenance answer.

    @property
    def rate_per_day(self) -> float:
        """Baseline rust growth, % of the surface per day (see the module docstring)."""
        anchor_loss = ENVIRONMENT_BY_CODE[ANCHOR_ENVIRONMENT].steel_loss_um[1]
        return round(ANCHOR_RATE_PER_DAY * self.steel_loss_um[1] / anchor_loss, 4)

    @property
    def years_new_to_critical(self) -> float:
        """Years for a rust-free surface to reach the critical level at this rate."""
        return round(CRITICAL_RUST_PERCENTAGE / self.rate_per_day / 365, 1)

    @property
    def basis(self) -> str:
        if self.code == ANCHOR_ENVIRONMENT:
            return (
                "Project assumption (the anchor): a rust-free painted surface reaches 33% "
                "rust in about 10 years in this environment."
            )
        ratio = self.steel_loss_um[1] / ENVIRONMENT_BY_CODE[ANCHOR_ENVIRONMENT].steel_loss_um[1]
        return (
            f"Scaled from the C3 anchor by {ratio:g}, the ratio of the upper first-year "
            "steel loss of the two categories in ISO 9223."
        )

    @property
    def evidence(self) -> str:
        low, high = self.steel_loss_um
        return (
            f"ISO 9223 / ISO 12944-2 category {self.code}: low-carbon steel loses over "
            f"{low:g} to {high:g} um in its first year of exposure. That is thickness "
            "loss, not rusted area, so it supports the ratio between environments and "
            "not the absolute rate."
        )


ENVIRONMENTS: tuple[Environment, ...] = (
    Environment(
        code="C2",
        name="Low: interior or rural",
        description=(
            "Outside: low pollution, mostly rural. Inside: unheated buildings where "
            "condensation can occur, such as depots and sports halls."
        ),
        steel_loss_um=(1.3, 25),
        note="Low corrosivity (C2). Keep to the scheduled inspection interval.",
    ),
    Environment(
        code="C3",
        name="Medium: urban",
        description=(
            "Outside: urban and industrial air with moderate pollution, or coast with "
            "low salinity. Inside: humid production rooms, such as laundries and "
            "food-processing plants."
        ),
        steel_loss_um=(25, 50),
        note="Medium corrosivity (C3). Wash off dirt and deposits before coating work.",
    ),
    Environment(
        code="C4",
        name="High: industrial or coastal",
        description=(
            "Outside: industrial areas and coast with moderate salinity. Inside: "
            "chemical plants, swimming pools, coastal ship and boatyards."
        ),
        steel_loss_um=(50, 80),
        note=(
            "High corrosivity (C4). Wash off salt and pollutant deposits before coating "
            "work, and specify a coating system rated for C4."
        ),
    ),
    Environment(
        code="C5",
        name="Very high: marine or aggressive industrial",
        description=(
            "Outside: coast with high salinity, or industrial areas with high humidity "
            "and an aggressive atmosphere. Inside: almost permanent condensation with "
            "high pollution."
        ),
        steel_loss_um=(80, 200),
        note=(
            "Very high corrosivity (C5). Wash off salt deposits before coating work, "
            "specify a coating system rated for C5, and shorten the inspection interval."
        ),
    ),
)
ENVIRONMENT_BY_CODE: dict[str, Environment] = {item.code: item for item in ENVIRONMENTS}
ENVIRONMENT_CODES: tuple[str, ...] = tuple(ENVIRONMENT_BY_CODE)


@dataclass(frozen=True)
class ElementType:
    name: str
    examples: str  # Shown in the picker so the right type is chosen.
    check: str  # What to look at on this kind of element; added to the maintenance steps.
    safety: str  # Added at action levels 5 and 6, where the element may be weakened.


ELEMENT_TYPES: tuple[ElementType, ...] = (
    ElementType(
        name="Structural member",
        examples="Beams, columns, trusses, purlins, bracing, base plates",
        check=(
            "Check connections, bolts, base plates and crevices where water collects; "
            "rust there matters more than rust on open faces."
        ),
        safety=(
            "Measure the remaining thickness where pitting is visible, and have the "
            "member assessed before it is relied on at full load."
        ),
    ),
    ElementType(
        name="Roofing and cladding sheet",
        examples="Roof sheets, wall cladding, flashings, gutters",
        check="Check laps, fasteners, cut edges and gutters, where rust usually starts.",
        safety=(
            "Do not walk on or load heavily rusted sheets. Replace sheets that are "
            "perforated or thin; coating does not restore strength."
        ),
    ),
    ElementType(
        name="Railing, stair and grating",
        examples="Handrails, guardrails, stairs, ladders, platforms, gratings",
        check="Check posts, base fixings, welds and treads; these are safety-critical.",
        safety=(
            "Restrict access if any post, tread or fixing is loose, thinned or "
            "perforated, until it is repaired or replaced."
        ),
    ),
    ElementType(
        name="Door, gate and fence",
        examples="Steel doors, frames, gates, grilles, fences",
        check="Check bottom rails, hinges, frames at floor level and ground contact points.",
        safety="Replace hinges, frames or posts that are thinned or perforated.",
    ),
    ElementType(
        name="Tank, pipe and duct",
        examples="Water tanks, pipes, pipe supports, ducts, vessels",
        check=(
            "Check supports, weld seams, flanges and areas under insulation or "
            "lagging, and look for leaks or staining."
        ),
        safety=(
            "Measure the wall thickness before recoating, and take the item out of "
            "service if it leaks or the wall is thinned."
        ),
    ),
    ElementType(
        name="Equipment housing and support",
        examples="Machine casings, frames, brackets, panels, base frames",
        check="Check anchor points, base frames and joints where water or debris collects.",
        safety=(
            "Isolate the equipment before work, and replace supports or anchors that "
            "are thinned or perforated."
        ),
    ),
)
ELEMENT_BY_NAME: dict[str, ElementType] = {item.name: item for item in ELEMENT_TYPES}
ELEMENT_NAMES: tuple[str, ...] = tuple(ELEMENT_BY_NAME)

# Object categories used before 2026-11-15. Read only for scans saved with one, so that
# their projected days stay what they were. New scans cannot choose them.
LEGACY_CATEGORY_RATES: dict[str, float] = {
    "Hardware": 0.045,
    "Vehicles": 0.018,
    "Household": 0.009,
    "Metal Walls": 0.006,
    "Unmapped Category": 0.09,
}
# Rate for scans saved with neither an environment nor a legacy category.
LEGACY_DEFAULT_CATEGORY = "Hardware"

# Every baseline rate the prediction engine can be asked for, by key.
BASELINE_RATES: dict[str, float] = {
    **{item.code: item.rate_per_day for item in ENVIRONMENTS},
    **LEGACY_CATEGORY_RATES,
}


def scan_options_payload() -> dict:
    """The two pickers as the frontend needs them."""
    return {
        "element_types": [
            {"name": item.name, "examples": item.examples, "check": item.check}
            for item in ELEMENT_TYPES
        ],
        "environments": [
            {
                "code": item.code,
                "name": item.name,
                "description": item.description,
                "rate_per_day": item.rate_per_day,
                "years_new_to_critical": item.years_new_to_critical,
                "basis": item.basis,
                "evidence": item.evidence,
                "sources": [SOURCES["STEEL_INFO"], SOURCES["ISO_9223"]],
            }
            for item in ENVIRONMENTS
        ],
    }
