"""
Run the whole backend analysis on a folder of test images and write one CSV for Orange.

It calls the same functions the /analyze-corrosion endpoint uses (lighting check, metal
validation, rust %, distribution, ASTM grade, priority), but it does NOT log in, upload
images or save scans, so your history and storage stay clean.

PUT THIS FILE IN THE backend FOLDER and run it with the backend's virtual environment:

  cd backend
  .\\venv\\Scripts\\Activate.ps1
  python evaluate_system.py --eval "C:\\Users\\Administrator\\Desktop\\eval" --out results.csv

Folder layout:
  eval/metal/       test photos of metal (put each photo's .json next to it if you have one)
  eval/not_metal/   look-alike photos (no .json needed)

It also makes the confusion matrices and other Chapter 4 charts (needs make_figures.py in the
same folder), in a folder named after the CSV, for example results_figures.

Optional:
  --figures "folder"   where to put the charts      --no-figures   skip them
  --dataset "C:\\...\\rust_project\\dataset"   flags eval images the model was trained on
"""

import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np

import main as backend  # loads the model and settings exactly as the server does
from image_quality import assess_lighting
from spread_analysis import classify_distribution

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
LABEL_MAP = {"metal": "metal", "rust": "rust", "rusted surface": "rust"}


def hand_masks(json_path, shape):
    """Metal and rust masks from an X-AnyLabeling JSON, at the image's own size."""
    data = json.loads(json_path.read_text(encoding="utf-8"))
    h, w = shape
    sx, sy = w / data.get("imageWidth", w), h / data.get("imageHeight", h)
    masks = {"metal": np.zeros((h, w), np.uint8), "rust": np.zeros((h, w), np.uint8)}
    for sh in data.get("shapes", []):
        label = LABEL_MAP.get(" ".join(str(sh.get("label", "")).lower().replace("_", " ").split()))
        pts = sh.get("points") or []
        if sh.get("shape_type") == "rectangle" and len(pts) >= 2:
            (x1, y1), (x2, y2) = pts[0], (pts[-1] if len(pts) == 2 else pts[2])
            pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
        if label is None or len(pts) < 3:
            continue
        poly = np.round(np.array(pts, dtype=np.float64) * [sx, sy]).astype(np.int32)
        cv2.fillPoly(masks[label], [poly], 1)
    return masks["metal"].astype(bool), masks["rust"].astype(bool)


def analyse(image):
    """Same steps as the endpoint, without storage. Returns a dict of results."""
    lighting = assess_lighting(image)
    out = {"lighting": lighting.status}
    if not lighting.is_usable:
        return {**out, "gate": "rejected", "reject_reason": "poor_lighting"}
    prob = backend.metal_probability(image) if hasattr(backend, "metal_probability") else None
    out["metal_probability"] = "" if prob is None else round(prob, 3)
    if prob is not None and prob < backend.METAL_CLASSIFIER_THRESHOLD:
        return {**out, "gate": "rejected", "reject_reason": "not_metal_classifier"}
    seg = backend._segment_surface(image)
    out["metal_area_pct"] = round(seg.confident_metal_ratio * 100, 1)
    if not seg.is_metal_surface:
        return {**out, "gate": "rejected", "reject_reason": "not_metal"}
    rust_pct = seg.rust_percentage
    dist = classify_distribution(seg.measured_rust_mask, seg.surface_mask)
    report = backend.prediction_engine.analyze_scan(rust_pct, "Hardware", dist["type"])
    return {
        **out,
        "gate": "accepted",
        "reject_reason": "",
        "rust_pct": rust_pct,
        "astm_grade": report["astm_grade"],
        "distribution": dist["type"] or "none",
        "priority": report["priority_tier"],
        "days_to_critical": report["days_to_critical"],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eval", required=True, help="folder with metal/ and not_metal/ subfolders")
    ap.add_argument("--out", default="results.csv")
    ap.add_argument("--dataset", help="training dataset folder, to flag images used in training")
    ap.add_argument("--figures", help="folder for the charts (default: <out name>_figures)")
    ap.add_argument("--no-figures", action="store_true", help="only write the CSV")
    args = ap.parse_args()

    trained = set()
    if args.dataset:
        for split in ("train", "val"):
            d = Path(args.dataset) / "images" / split
            if d.is_dir():
                trained |= {p.name for p in d.iterdir()}

    fields = ["image", "actual_class", "gate", "reject_reason", "lighting", "metal_probability", "metal_area_pct",
              "rust_pct", "astm_grade", "distribution", "priority", "days_to_critical",
              "label_rust_pct", "label_astm_grade", "label_distribution",
              "professional_grade", "professional_distribution", "used_in_training"]
    rows = []
    for actual in ("metal", "not_metal"):
        folder = Path(args.eval) / actual
        if not folder.is_dir():
            print(f"Missing folder: {folder}")
            continue
        for img_path in sorted(p for p in folder.iterdir() if p.suffix.lower() in IMG_EXT):
            image = cv2.imdecode(np.fromfile(str(img_path), np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                print(f"Could not read {img_path.name}, skipped")
                continue
            row = {f: "" for f in fields}
            row.update(image=img_path.name, actual_class=actual, **analyse(image))
            row["used_in_training"] = "yes" if img_path.name in trained else ("no" if args.dataset else "")

            js = img_path.with_suffix(".json")
            if actual == "metal" and js.exists():
                metal, rust = hand_masks(js, image.shape[:2])
                surface = metal | rust
                if surface.any():
                    pct = round(float((rust & surface).sum()) / float(surface.sum()) * 100, 2)
                    dist = classify_distribution(rust, surface)
                    rep = backend.prediction_engine.analyze_scan(pct, "Hardware", dist["type"])
                    row["label_rust_pct"] = pct
                    row["label_astm_grade"] = rep["astm_grade"]
                    row["label_distribution"] = dist["type"] or "none"
            rows.append(row)
            print(f"{actual:9s} {row['gate']:8s} {img_path.name[:50]}")

    with open(args.out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    # ---- summary ----
    clf = "on" if getattr(backend, "metal_classifier", None) is not None else "off"
    print(f"\nRust measurement mode: {backend.RUST_MEASUREMENT} | validation confidence: {backend.VALIDATION_CONFIDENCE}"
          f" | rust detection confidence: {backend.MODEL_CONFIDENCE}"
          f" | hybrid reach: {getattr(backend, 'HYBRID_REACH', 0.02)} | metal classifier: {clf}")
    m = [r for r in rows if r["actual_class"] == "metal"]
    n = [r for r in rows if r["actual_class"] == "not_metal"]
    tp = sum(r["gate"] == "accepted" for r in m)
    fp = sum(r["gate"] == "accepted" for r in n)
    print("\nMETAL GATE (rows = actual, columns = system)")
    print(f"                accepted  rejected")
    print(f"  metal        {tp:8d}  {len(m) - tp:8d}")
    print(f"  not_metal    {fp:8d}  {len(n) - fp:8d}")
    if rows:
        print(f"  accuracy {(tp + len(n) - fp) / len(rows):.1%}"
              + (f" | metal accepted {tp / len(m):.1%}" if m else "")
              + (f" | look-alikes rejected {(len(n) - fp) / len(n):.1%}" if n else ""))
    lighting_rejects = sum(r["reject_reason"] == "poor_lighting" for r in rows)
    if lighting_rejects:
        print(f"  ({lighting_rejects} rejected for lighting, not for 'not metal')")

    both = [r for r in m if r["gate"] == "accepted" and r["label_astm_grade"] != ""]
    if both:
        err = [abs(float(r["rust_pct"]) - float(r["label_rust_pct"])) for r in both]
        gd = [abs(int(r["astm_grade"]) - int(r["label_astm_grade"])) for r in both]
        dd = sum(r["distribution"] == r["label_distribution"] for r in both)
        print(f"\nSYSTEM vs YOUR HAND LABELS ({len(both)} accepted metal images with a .json)")
        print(f"  rust % error: mean {np.mean(err):.1f} points, median {np.median(err):.1f} points")
        print(f"  ASTM grade: exact {np.mean(np.array(gd) == 0):.1%}, within one grade {np.mean(np.array(gd) <= 1):.1%}")
        print(f"  distribution type agreement: {dd / len(both):.1%}")
    if trained:
        used = sum(r["used_in_training"] == "yes" for r in rows)
        if used:
            print(f"\nWARNING: {used} of {len(rows)} eval images were used to train the model. "
                  "Replace them with unseen images, or the results will look better than they are.")
    print(f"\nSaved {len(rows)} rows to {args.out}")

    if not args.no_figures:
        try:
            import make_figures
            make_figures.run(args.out, args.figures or str(Path(args.out).with_suffix("")) + "_figures")
        except ImportError:
            print("Charts skipped: put make_figures.py in this folder (it needs matplotlib).")
        except Exception as exc:  # the CSV is already saved, so never fail the run over a chart
            print(f"Charts skipped: {exc}")


if __name__ == "__main__":
    main()
