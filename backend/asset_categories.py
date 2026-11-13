"""Asset categories: the one place their corrosion rates and supporting evidence live.

The prediction engine, the upload validation and the category picker in the frontend
all read from ASSET_CATEGORIES, so a rate is never typed in more than one place.

WHAT THE PUBLISHED EVIDENCE DOES AND DOES NOT GIVE (checked 2026-11-13)
- No standard or paper found gives a rust-area growth rate ("% of surface per day") by
  type of object. The baseline rates below are therefore project assumptions.
- What the literature does give, and what each category's notes draw on:
  * ISO 9223 classifies atmospheres by first-year corrosion of standard specimens. Zinc
    loses <0.1 um/yr in C1, 0.1-0.7 in C2, 0.7-2.1 in C3 (urban, 1-30 km from the
    ocean), 2.1-4.2 in C4, 4.2-8.4 in C5 and 8.4-25 in CX. These are thickness-loss
    rates by environment, not area rates by object.            [AGA_ISO9223]
  * A zinc coating's "time to first maintenance" is the time until 5% of the surface
    shows red rust, and it is proportional to the coating thickness.   [AGA_TFM]
  * Typical zinc thickness: about 21 um per side on G90 / Z275 galvanized sheet
    [GALVINFO]; 50-60 g/m2 per side (roughly 7-8.5 um) on exposed automotive panels,
    6-10 um per side for automotive zinc and zinc-iron coatings.   [ARCELOR, TATA]
  * ISO 12944 rates paint-system durability as low (up to 7 years), medium (7-15),
    high (15-25) and very high (over 25) to first major maintenance.   [ISO12944]
- These facts support the ORDER of the categories (thin or absent coatings rust first;
  thicker coatings and milder exposure last longer). They do not validate the absolute
  rates. The rates are replaced by measured ones when the same object is scanned
  repeatedly (per-asset regression).
"""

from dataclasses import dataclass

# Rust coverage at which a surface is treated as critical (start of ASTM D610 grade 1).
CRITICAL_RUST_PERCENTAGE = 33.0

# Fallback rate for the "Unmapped Category" option and for any category with no
# configured slope. Set faster than every category so an unknown object is flagged early.
UNMAPPED_RATE_PER_DAY = 0.09

SOURCES = {
    "AGA_ISO9223": "American Galvanizers Association, 'HDG Corrosion Rates for ISO Categories C1-C5/X' (ISO 9223 Table 2 zinc rates). https://galvanizeit.org/knowledgebase/article/hdg-corrosion-rates-for-iso-categories-c1-c5-x",
    "AGA_TFM": "American Galvanizers Association, 'The Zinc Coating Life Predictor' (time to first maintenance = 5% red rust). https://galvanizeit.org/knowledgebase/article/the-zinc-coating-life-predictor",
    "GALVINFO": "GalvInfo Center, GalvInfoNote 1.1 'Metallic-Coated Products and Specifications' (G90 is about 21 um of zinc per side). https://www.galvinfo.com/wp-content/uploads/sites/8/2021/01/GalvInfoNote-1-1-Rev-4-0.pdf",
    "ARCELOR": "ArcelorMittal, Extragal data sheet (50 and 60 g/m2 per side for exposed automotive panels). https://northamerica.arcelormittal.com/media/wzucg03h/arcelormittal_data-sheet_extragal_2024_x1a.pdf",
    "TATA": "Tata Steel, automotive metallic coated steel (zinc and zinc-iron coatings, 6-10 um per side). https://www.tatasteeleurope.com/automotive/products/metallic-coated/forming",
    "ISO12944": "ISO 12944 durability ranges as summarised by Hempel, 'How to specify for corrosion protection'. https://www.hempel.com/-/media/Hempel/Files/Brochures-and-Leaflets/Segments/Energy-and-Infra/How-to-specify-for-corrosion-protection_EN.pdf",
}


@dataclass(frozen=True)
class AssetCategory:
    name: str
    description: str  # Shown under the option in the picker.
    examples: str  # Shown in the picker so the right category is chosen.
    rate_per_day: float  # Baseline rust growth, % of the metal surface per day.
    basis: str  # Where the rate comes from. Every rate here is a project assumption.
    evidence: str  # Published facts that bear on the category's place in the order.
    sources: tuple[str, ...]  # Keys into SOURCES.

    @property
    def years_new_to_critical(self) -> float:
        """Years for a rust-free surface to reach the critical threshold at this rate."""
        return round(CRITICAL_RUST_PERCENTAGE / self.rate_per_day / 365, 1)


ASSET_CATEGORIES: tuple[AssetCategory, ...] = (
    AssetCategory(
        name="Hardware",
        description="Small tools, fasteners and fittings with thin or no protective coating.",
        examples="Wrenches, scissors, bolts, nuts, hinges, chains, hand tools",
        rate_per_day=0.045,
        basis="Project assumption: a rust-free item reaches 33% rust in about 2 years.",
        evidence=(
            "Hand tools and fasteners are commonly bare or thinly plated steel, and a "
            "zinc coating's life to 5% rust is proportional to its thickness, so this "
            "category is set fastest. The coating thickness for this category was not "
            "verified against a standard."
        ),
        sources=("AGA_TFM",),
    ),
    AssetCategory(
        name="Vehicles",
        description="Painted, galvanized body panels and frames of road vehicles.",
        examples="Cars, trucks, motorcycles, bicycles, trailers",
        rate_per_day=0.018,
        basis="Project assumption: a rust-free panel reaches 33% rust in about 5 years.",
        evidence=(
            "Exposed automotive panels carry about 7 to 10 um of zinc per side, roughly "
            "a third to a half of the 21 um on galvanized building sheet, so this "
            "category is set about 3 times faster than Metal Walls."
        ),
        sources=("ARCELOR", "TATA", "GALVINFO", "AGA_TFM"),
    ),
    AssetCategory(
        name="Household",
        description="Coated metal items kept in and around the home.",
        examples="Appliances, furniture, gates, grills, railings, water tanks",
        rate_per_day=0.009,
        basis="Project assumption: a rust-free item reaches 33% rust in about 10 years.",
        evidence=(
            "Indoor and sheltered atmospheres fall in the lower ISO 9223 corrosivity "
            "categories (zinc loses 0.1-0.7 um/yr in C2 against 0.7-2.1 in C3), so "
            "household items are set slower than vehicles. The rate is kept above "
            "Metal Walls because household items are wetted and handled in use; that "
            "ordering is an assumption."
        ),
        sources=("AGA_ISO9223",),
    ),
    AssetCategory(
        name="Metal Walls",
        description="Galvanized or pre-painted sheet used on buildings.",
        examples="Roofing sheets, wall cladding, corrugated panels, fences, sheds",
        rate_per_day=0.006,
        basis="Project assumption: a rust-free sheet reaches 33% rust in about 15 years.",
        evidence=(
            "G90 / Z275 building sheet carries about 21 um of zinc per side. In an urban "
            "C3 atmosphere zinc loses 0.7 to 2.1 um per year, which gives roughly 10 to "
            "30 years until 5% of the surface shows rust, so this category is set slowest."
        ),
        sources=("GALVINFO", "AGA_ISO9223", "AGA_TFM"),
    ),
    # Kept last in the picker: chosen when the object fits none of the categories above.
    AssetCategory(
        name="Unmapped Category",
        description="Fallback rate used when a category has no configured slope.",
        examples="Objects that fit none of the categories above",
        rate_per_day=UNMAPPED_RATE_PER_DAY,
        basis="Project assumption: a rust-free item reaches 33% rust in about 1 year.",
        evidence=(
            "No published source covers an unclassified object, so the fallback is set "
            "faster than every configured category. Predicting early is the cautious "
            "choice when the type of object is unknown."
        ),
        sources=(),
    ),
)

CATEGORY_NAMES: tuple[str, ...] = tuple(category.name for category in ASSET_CATEGORIES)
CATEGORY_RATES: dict[str, float] = {
    category.name: category.rate_per_day for category in ASSET_CATEGORIES
}
# Used only for scans saved before a category was recorded.
LEGACY_CATEGORY = "Hardware"


def category_payload() -> list[dict]:
    """The categories as the frontend picker needs them."""
    return [
        {
            "name": category.name,
            "description": category.description,
            "examples": category.examples,
            "rate_per_day": category.rate_per_day,
            "years_new_to_critical": category.years_new_to_critical,
            "basis": category.basis,
            "evidence": category.evidence,
            "sources": [SOURCES[key] for key in category.sources],
        }
        for category in ASSET_CATEGORIES
    ]
