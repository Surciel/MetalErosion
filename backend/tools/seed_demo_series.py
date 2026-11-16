"""Seed a demo site with dated inspection series, so trends can be shown without waiting months.

Real deterioration takes months to observe. For a demonstration this tool runs a series
of photos through the REAL analysis pipeline (same photo checks, models, measurement and
grading as the app) and saves each result with a date you choose, as if the same element
had been inspected at intervals.

THE SITE IT CREATES IS MARKED AS DEMO DATA (sites.is_demo = true), and the app shows
that label wherever the site appears. The dates are simulated; the rust % of each photo
is a real measurement of that photo. Say so in any report that uses these series.

Folder layout: one sub-folder per asset, photos in the order they should be dated.

    demo_series/
        R-1 Roof sheet bay 1/
            01.jpg  02.jpg  03.jpg  04.jpg  05.jpg
        T-3 Roof truss/
            01.jpg  02.jpg  03.jpg

The sub-folder name is "<tag> <description>". Photos that fail the app's checks (not
metal, too dark, too blurry) are skipped and reported.

Usage (from the backend folder, with the virtual environment's Python):

    venv\\Scripts\\python.exe tools\\seed_demo_series.py demo_series ^
        --owner-email you@example.com --site "Demo plant" --environment C4 ^
        --element "Roofing and cladding sheet" --start 2026-01-15 --interval-days 45

Run it with --dry-run first: it analyses the photos and prints what it would save,
without writing anything.
"""

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="Folder with one sub-folder of photos per asset")
    parser.add_argument("--owner-email", required=True, help="Email of the account that will own the demo site and scans")
    parser.add_argument("--site", default="Demo site", help="Name of the demo site to create")
    parser.add_argument("--environment", default="C3", help="Exposure environment of the site: C2, C3, C4 or C5")
    parser.add_argument("--element", default="Structural member", help="Element type given to every asset")
    parser.add_argument("--area", type=float, default=None, help="Coated area in m2 given to every asset (optional)")
    parser.add_argument("--start", required=True, help="Date of the first inspection, YYYY-MM-DD")
    parser.add_argument("--interval-days", type=int, default=30, help="Days between inspections")
    parser.add_argument("--dry-run", action="store_true", help="Analyse and print, but save nothing")
    args = parser.parse_args()

    if not args.folder.is_dir():
        parser.error(f"{args.folder} is not a folder")
    start = datetime.strptime(args.start, "%Y-%m-%d").replace(hour=9, tzinfo=timezone.utc)
    if start + timedelta(days=1) > datetime.now(timezone.utc) + timedelta(days=3650):
        parser.error("--start is too far in the future")

    # Importing main loads the models and connects to Supabase with the backend's settings.
    import cv2
    import numpy as np

    import main as app
    from asset_profile import ELEMENT_NAMES, ENVIRONMENT_CODES
    from image_quality import detect_image_format
    from spread_analysis import classify_distribution

    if args.environment not in ENVIRONMENT_CODES:
        parser.error(f"--environment must be one of {', '.join(ENVIRONMENT_CODES)}")
    if args.element not in ELEMENT_NAMES:
        parser.error("--element must be one of: " + "; ".join(ELEMENT_NAMES))

    db = app.supabase
    owner = db.table("profiles").select("id,username,email").eq("email", args.owner_email).maybe_single().execute()
    owner = getattr(owner, "data", None)
    if not owner:
        parser.error(f"No account with the email {args.owner_email}. Sign up in the app first.")
    user = {"id": owner["id"], "email": owner.get("email"), "username": owner.get("username")}

    series = sorted(path for path in args.folder.iterdir() if path.is_dir())
    if not series:
        parser.error("The folder has no sub-folders. Put each asset's photos in its own sub-folder.")

    site_id = None
    if not args.dry_run:
        site = db.table("sites").insert(
            {"name": args.site, "environment": args.environment, "is_demo": True, "created_by": user["id"],
             "location": "Simulated inspection dates"}
        ).execute().data[0]
        site_id = site["id"]
        print(f"Created demo site '{args.site}' ({args.environment})")

    saved = skipped = 0
    for folder in series:
        tag, _, description = folder.name.partition(" ")
        photos = sorted(path for path in folder.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)
        if not photos:
            print(f"  {folder.name}: no photos, skipped")
            continue
        asset_id = None
        if not args.dry_run:
            asset = db.table("assets").insert(
                {"site_id": site_id, "tag": tag, "name": description or None, "element_type": args.element,
                 "surface_area_m2": args.area, "created_by": user["id"], "notes": "Demo data: simulated inspection dates."}
            ).execute().data[0]
            asset_id = asset["id"]
        print(f"  Asset {tag} ({description or 'no description'}): {len(photos)} photos")

        for index, photo in enumerate(photos):
            when = start + timedelta(days=index * args.interval_days)
            contents = photo.read_bytes()
            image_format = detect_image_format(contents)
            image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR) if image_format else None
            if image is None:
                print(f"    {photo.name}: not a JPEG, PNG or WebP image, skipped")
                skipped += 1
                continue
            lighting = app.assess_lighting(image)
            sharpness = app.assess_sharpness(image)
            if not lighting.is_usable or not sharpness.is_usable or not app.passes_metal_classifier(image):
                print(f"    {photo.name}: failed the photo checks (lighting {lighting.status}, sharpness {sharpness.status}), skipped")
                skipped += 1
                continue
            segmentation = app._segment_surface(image)
            if not segmentation.is_metal_surface:
                print(f"    {photo.name}: no steel surface found, skipped")
                skipped += 1
                continue
            rust = segmentation.rust_percentage
            distribution = classify_distribution(segmentation.measured_rust_mask, segmentation.surface_mask)
            report = app.prediction_engine.analyze_scan(
                rust, args.environment, distribution["type"], distribution["coverage_ratio"]
            )
            print(f"    {photo.name}: {when.date()}  rust {rust}%  ASTM {report['astm_rating']}")
            if args.dry_run:
                continue

            extension, content_type = image_format
            storage_path = f"scans/{user['id']}/{uuid4()}{extension}"
            storage = db.storage.from_(app.SUPABASE_STORAGE_BUCKET)
            storage.upload(storage_path, contents, {"content-type": content_type, "upsert": "false"})
            signed_url = storage.create_signed_url(storage_path, app.SUPABASE_SIGNED_URL_TTL)["signedURL"]
            warnings = ["slightly_blurry"] if sharpness.status == "slightly_blurry" else []
            db.table("scans").insert(
                {
                    "user_id": user["id"],
                    "image_url": signed_url,
                    "title": f"{tag} inspection {index + 1} (demo)",
                    "rust_percentage": rust,
                    "box_coordinates": segmentation.rust_boxes,
                    "distribution_type": distribution["type"],
                    "lighting_status": lighting.status,
                    "days_to_critical": report["days_to_critical"],
                    "spread_coverage": report["spread_coverage"],
                    "quality_warnings": warnings,
                    "element_type": args.element,
                    "environment": args.environment,
                    "asset_id": asset_id,
                    "rust_method": app.RUST_MEASUREMENT,
                    "inspector_name": f"{user.get('username') or 'Demo'} (demo data)",
                    "created_at": when.isoformat(),
                }
            ).execute()
            saved += 1

    print()
    if args.dry_run:
        print(f"Dry run: nothing was saved. {skipped} photo(s) would be skipped.")
    else:
        print(f"Saved {saved} inspection(s); skipped {skipped}. Open the site '{args.site}' in the app.")
        print("The site is labelled 'Demo data'. Delete it from its page when the demonstration is over.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
