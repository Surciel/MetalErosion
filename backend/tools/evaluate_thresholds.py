"""Measure the metal check and the rust % settings on a labelled test set.

Usage (from the backend folder, with the venv active):

    python tools/evaluate_thresholds.py --data <dataset folder> --out <results folder>
        [--split test] [--model <other .pt>] [--negatives <folder of non-metal photos>]
        [--brightness 0.45] [--skip-rust]

<dataset folder> is in YOLO segmentation format: `images/test` + `labels/test`,
`test/images` + `test/labels`, or plain `images/` + `labels/`. A `rust.yaml` or
`data.yaml` next to it gives the class order; without one the model's order is used.

Part A, metal check: for each confidence threshold, the share of metal photos wrongly
rejected and of non-metal photos wrongly accepted. A photo is "metal" when its label
file has at least one outline, and "non-metal" when the label file is empty or missing
or the photo comes from --negatives. Each threshold is scored as if METAL_CONFIDENCE
and VALIDATION_CONFIDENCE were both set to it.

Part B, rust %: RUST_MEASUREMENT=color against mask (at rust confidence 0.25 and 0.12),
compared with the labelled rust share: rust outline area / (metal + rust outline area).

The script imports the backend (`main.py`), so it uses the same model, image sizing and
rules as the API and needs `backend/.env`.
"""

import argparse
import csv
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

import main  # noqa: E402

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
THRESHOLDS = [round(0.10 + 0.05 * step, 2) for step in range(11)]  # 0.10 .. 0.60
DETECTION_FLOOR = 0.05
CURRENT_THRESHOLD = 0.5
# (name, RUST_MEASUREMENT, RUST_CONFIDENCE or None to keep the backend setting)
RUST_CONFIGS = [("color", "color", None), ("mask@0.25", "mask", 0.25), ("mask@0.12", "mask", 0.12)]
# A labelled rust share between these bounds counts as "partly rusted".
PARTIAL_RANGE = (5.0, 95.0)


def find_split(data: Path, split: str) -> tuple[Path, Path]:
    candidates = [
        (data / "images" / split, data / "labels" / split),  # images/test + labels/test
        (data / split / "images", data / split / "labels"),  # test/images + test/labels
        (data / "images", data / "labels"),  # images + labels
    ]
    for images, labels in candidates:
        if images.is_dir() and any(
            p.suffix.lower() in IMAGE_EXTENSIONS for p in images.iterdir()
        ):
            return images, labels
    raise SystemExit(f"No '{split}' images found in {data}.")


class CachedModel:
    """Runs one prediction per image at DETECTION_FLOOR and replays it to the backend.

    main._segment_surface filters detections by its own thresholds, so replaying the
    low-confidence prediction gives the same result as predicting again at each setting.
    """

    def __init__(self, model) -> None:
        self._model = model
        self.names = model.names
        self.task = model.task
        self._results = None

    def run(self, work: np.ndarray):
        self._results = self._model.predict(
            source=work,
            conf=DETECTION_FLOOR,
            iou=main.MODEL_IOU,
            imgsz=main.MODEL_IMAGE_SIZE,
            retina_masks=True,
            verbose=False,
        )
        return self._results[0]

    def predict(self, **_kwargs):
        return self._results


def label_class_names(data: Path) -> dict[int, str]:
    import yaml

    for folder in (data, data.parent):
        for path in sorted(folder.glob("*.yaml")):
            names = (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("names")
            if isinstance(names, list):
                names = dict(enumerate(names))
            if isinstance(names, dict):
                print(f"Class order from {path}: {names}")
                return {int(key): str(value).lower() for key, value in names.items()}
    print(f"No dataset yaml found; using the model's class order: {main.model.names}")
    return {int(key): str(value).lower() for key, value in main.model.names.items()}


def list_images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS)


def load_image(path: Path) -> np.ndarray | None:
    # np.fromfile + imdecode handles Windows paths with non-ASCII characters.
    return cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_COLOR)


def work_image(image: np.ndarray) -> np.ndarray:
    """The same downscale the backend applies before inference."""
    height, width = image.shape[:2]
    scale = min(1.0, main.INFERENCE_MAX_SIDE / max(height, width))
    if scale >= 1.0:
        return image
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA)


def read_labels(
    path: Path, names: dict[int, str], shape: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray, int]:
    """Rasterise a YOLO label file. Returns (metal mask, rust mask, number of outlines)."""
    height, width = shape
    masks = {"metal": np.zeros(shape, np.uint8), "rust": np.zeros(shape, np.uint8)}
    count = 0
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            name = names.get(int(float(parts[0])), "")
            values = np.array(parts[1:], dtype=float)
            if len(values) == 4:  # Box format: centre x, centre y, width, height.
                cx, cy, bw, bh = values
                points = np.array(
                    [[cx - bw / 2, cy - bh / 2], [cx + bw / 2, cy - bh / 2],
                     [cx + bw / 2, cy + bh / 2], [cx - bw / 2, cy + bh / 2]]
                )
            else:
                points = values[: len(values) // 2 * 2].reshape(-1, 2)
            count += 1
            if name in masks:
                pixels = np.round(points * [width, height]).astype(np.int32)
                cv2.fillPoly(masks[name], [pixels], 1)
    return masks["metal"].astype(bool), masks["rust"].astype(bool), count


def detect(work: np.ndarray) -> list[tuple[str, float, np.ndarray]]:
    result = main.model.run(work)  # main.model is a CachedModel while run() is active
    if result.masks is None or result.boxes is None or len(result.boxes) == 0:
        return []
    shape = work.shape[:2]
    detections = []
    for class_id, confidence, mask in zip(
        result.boxes.cls.tolist(), result.boxes.conf.tolist(), result.masks.data.cpu().numpy() > 0.5
    ):
        if mask.shape != shape:
            mask = cv2.resize(
                mask.astype(np.uint8), (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST
            ).astype(bool)
        detections.append((str(main.model.names[int(class_id)]).lower(), float(confidence), mask))
    return detections


def gate_shares(
    detections: list[tuple[str, float, np.ndarray]], shape: tuple[int, int]
) -> list[tuple[float, float]]:
    """Per threshold: (metal share, rust share) of the photo that counts for the metal check.

    Mirrors main._segment_surface with METAL_CONFIDENCE = VALIDATION_CONFIDENCE = threshold,
    including the metal-overlap rule for rust below MODEL_CONFIDENCE.
    """
    edge = max(3, round(max(shape) * 0.01))
    kernel = np.ones((edge, edge), np.uint8)
    shares = []
    for threshold in THRESHOLDS:
        metal = np.zeros(shape, dtype=bool)
        for name, confidence, mask in detections:
            if name == "metal" and confidence >= threshold:
                metal |= mask
        metal_zone = cv2.dilate(metal.astype(np.uint8), kernel).astype(bool)
        rust = np.zeros(shape, dtype=bool)
        for name, confidence, mask in detections:
            if name != "rust" or confidence < max(threshold, main.RUST_CONFIDENCE):
                continue
            if confidence < main.MODEL_CONFIDENCE:
                pixels = int(mask.sum())
                if not pixels or (mask & metal_zone).sum() / pixels < main.RUST_MIN_METAL_OVERLAP:
                    continue
            rust |= mask
        shares.append((float(metal.mean()), float(rust.mean())))
    return shares


def measure_rust(image: np.ndarray) -> dict[str, float]:
    saved = (main.RUST_MEASUREMENT, main.RUST_CONFIDENCE)
    results = {}
    try:
        for name, mode, rust_confidence in RUST_CONFIGS:
            main.RUST_MEASUREMENT = mode
            main.RUST_CONFIDENCE = saved[1] if rust_confidence is None else rust_confidence
            results[name] = main._segment_surface(image).rust_percentage
    finally:
        main.RUST_MEASUREMENT, main.RUST_CONFIDENCE = saved
    return results


def contact_sheet(rows: list[dict], title: str, path: Path, limit: int = 24) -> None:
    if not rows:
        return
    tiles = []
    for row in rows[:limit]:
        image = load_image(Path(row["path"]))
        if image is None:
            continue
        scale = 260 / max(image.shape[:2])
        image = cv2.resize(image, (max(1, round(image.shape[1] * scale)), max(1, round(image.shape[0] * scale))))
        tile = np.full((300, 260, 3), 30, np.uint8)
        tile[40 : 40 + image.shape[0], : image.shape[1]] = image
        cv2.putText(tile, row["file"][:28], (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        caption = f"metal {row['max_metal_conf']:.2f}  rust {row['max_rust_conf']:.2f}"
        cv2.putText(tile, caption, (4, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (160, 220, 255), 1)
        tiles.append(tile)
    if not tiles:
        return
    columns = 6
    while len(tiles) % columns:
        tiles.append(np.full((300, 260, 3), 30, np.uint8))
    sheet = np.vstack([np.hstack(tiles[i : i + columns]) for i in range(0, len(tiles), columns)])
    header = np.full((36, sheet.shape[1], 3), 0, np.uint8)
    cv2.putText(header, f"{title} ({len(rows)})", (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.imwrite(str(path), np.vstack([header, sheet]))


def percent(part: int, whole: int) -> str:
    return f"{part / whole * 100:.1f}% ({part}/{whole})" if whole else "n/a"


def markdown_table(header: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines)


def run(args: argparse.Namespace) -> None:
    data = Path(args.data)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    images_dir, labels_dir = find_split(data, args.split)
    names = label_class_names(data)
    if not {"metal", "rust"} <= set(names.values()):
        raise SystemExit(f"The label classes must include 'metal' and 'rust'; found {names}.")

    items = [(path, labels_dir / f"{path.stem}.txt", "test set") for path in list_images(images_dir)]
    if args.negatives:
        items += [(path, None, "negatives") for path in list_images(Path(args.negatives))]
    print(f"{len(items)} images to process.")

    base_model = main.model
    if args.model:
        from ultralytics import YOLO

        base_model = YOLO(args.model)
        if base_model.task != "segment":
            raise SystemExit(f"{args.model} is a '{base_model.task}' model, not a segmentation model.")
    saved = (main.model, main.METAL_CLASS_ID, main.RUST_CLASS_ID)
    main.model = CachedModel(base_model)
    try:
        main.METAL_CLASS_ID = main._class_id("metal")
        main.RUST_CLASS_ID = main._class_id("rust")
        rows = score_images(items, names, args)
    finally:
        main.model, main.METAL_CLASS_ID, main.RUST_CLASS_ID = saved

    model_name = args.model or main.MODEL_PATH
    report = [
        f"# Threshold evaluation\n\nModel: `{model_name}`  \nData: `{data}` ({args.split})  \n"
        f"Brightness factor: {args.brightness}  \nImages scored: {len(rows)}\n"
    ]
    report += gate_report(rows, out)
    if not args.skip_rust:
        report += rust_report(rows, out)
    (out / "report.md").write_text("\n".join(report), encoding="utf-8")
    print(f"\nResults written to {out}")
    return rows


def score_images(items: list, names: dict[int, str], args: argparse.Namespace) -> list[dict]:
    rows = []
    for index, (path, label_path, source) in enumerate(items, 1):
        image = load_image(path)
        if image is None:
            print(f"  skipped unreadable image: {path.name}")
            continue
        if args.brightness != 1.0:
            # Linear brightness change (values clip at 255) to test lighting robustness.
            image = cv2.convertScaleAbs(image, alpha=args.brightness, beta=0)
        work = work_image(image)
        shape = work.shape[:2]
        metal_gt, rust_gt, outlines = (
            read_labels(label_path, names, shape) if label_path else (None, None, 0)
        )
        detections = detect(work)
        row = {
            "file": path.name,
            "path": str(path),
            "source": source,
            "truth": "metal" if outlines else "non-metal",
            "max_metal_conf": max((c for n, c, _ in detections if n == "metal"), default=0.0),
            "max_rust_conf": max((c for n, c, _ in detections if n == "rust"), default=0.0),
            "shares": gate_shares(detections, shape),
        }
        if outlines and not args.skip_rust:
            surface_gt = metal_gt | rust_gt
            surface_pixels = int(surface_gt.sum())
            if surface_pixels:
                row["gt_rust"] = round(int(rust_gt.sum()) / surface_pixels * 100, 2)
                row["has_metal_label"] = bool(metal_gt.any())
                row["has_rust_label"] = bool(rust_gt.any())
                row.update(measure_rust(image))
        rows.append(row)
        if index % 10 == 0 or index == len(items):
            print(f"  {index}/{len(items)} done", flush=True)
    return rows


def gate_report(rows: list[dict], out: Path) -> list[str]:
    metal_rows = [row for row in rows if row["truth"] == "metal"]
    other_rows = [row for row in rows if row["truth"] == "non-metal"]
    area = main.MIN_SURFACE_AREA_RATIO

    def accepted(row: dict, index: int, rule: str) -> bool:
        metal_share, rust_share = row["shares"][index]
        return metal_share >= area or (rule == "metal or rust" and rust_share >= area)

    table, csv_rows, errors = [], [], {}
    for index, threshold in enumerate(THRESHOLDS):
        line = [f"{threshold:.2f}" + (" (current)" if threshold == CURRENT_THRESHOLD else "")]
        for rule in ("metal or rust", "metal only"):
            rejected = sum(not accepted(row, index, rule) for row in metal_rows)
            let_in = sum(accepted(row, index, rule) for row in other_rows)
            line += [percent(rejected, len(metal_rows)), percent(let_in, len(other_rows))]
            csv_rows.append([threshold, rule, len(metal_rows), rejected, len(other_rows), let_in])
            if rule == "metal or rust" and metal_rows and other_rows:
                errors[index] = (rejected / len(metal_rows) + let_in / len(other_rows)) / 2
        table.append(line)

    # Several thresholds often tie; take the middle one so there is margin on both sides.
    best = None
    if errors:
        lowest = min(errors.values())
        tied = [index for index, error in errors.items() if error == lowest]
        best = (lowest, tied[len(tied) // 2], tied)

    with open(out / "gate_sweep.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["threshold", "rule", "metal_photos", "metal_rejected", "non_metal_photos", "non_metal_accepted"])
        writer.writerows(csv_rows)
    with open(out / "gate_images.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["file", "source", "truth", "max_metal_conf", "max_rust_conf"])
        for row in rows:
            writer.writerow([row["file"], row["source"], row["truth"], f"{row['max_metal_conf']:.3f}", f"{row['max_rust_conf']:.3f}"])

    header = ["Threshold", "Metal rejected (metal or rust)", "Non-metal accepted (metal or rust)",
              "Metal rejected (metal only)", "Non-metal accepted (metal only)"]
    text = markdown_table(header, table)
    lines = [
        "## Part A: metal check\n",
        f"{len(metal_rows)} metal photos, {len(other_rows)} non-metal photos. "
        f"A photo passes when detections at or above the threshold cover at least {area:.0%} of it.\n",
        text,
    ]
    print("\n" + "\n".join(lines[1:]))

    current = THRESHOLDS.index(CURRENT_THRESHOLD)
    sheets = [(current, f"at {CURRENT_THRESHOLD:.2f}")]
    if best is not None:
        best_threshold = THRESHOLDS[best[1]]
        tied = best[2]
        span = (
            f" (thresholds {THRESHOLDS[tied[0]]:.2f} to {THRESHOLDS[tied[-1]]:.2f} score the same)"
            if len(tied) > 1
            else ""
        )
        summary = (
            f"\nBest balance of the two error rates (metal or rust rule): "
            f"**{best_threshold:.2f}**{span}."
        )
        lines.append(summary)
        print(summary)
        if best[1] != current:
            sheets.append((best[1], f"at {best_threshold:.2f}"))
    else:
        note = "\nNo best threshold: the set needs both metal and non-metal photos."
        lines.append(note)
        print(note)
    for index, label in sheets:
        tag = label.replace(" ", "_").replace(".", "")
        contact_sheet([r for r in metal_rows if not accepted(r, index, "metal or rust")],
                      f"Metal wrongly rejected {label}", out / f"wrongly_rejected_{tag}.jpg")
        contact_sheet([r for r in other_rows if accepted(r, index, "metal or rust")],
                      f"Non-metal wrongly accepted {label}", out / f"wrongly_accepted_{tag}.jpg")
    return lines


def rust_report(rows: list[dict], out: Path) -> list[str]:
    scored = [row for row in rows if "gt_rust" in row]
    lines = ["\n## Part B: rust %\n"]
    if not scored:
        lines.append("No labelled metal photos to score.")
        print("\n" + lines[-1])
        return lines

    config_names = [name for name, _, _ in RUST_CONFIGS]
    with open(out / "rust_comparison.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["file", "labelled_rust", "has_metal_label", "has_rust_label", *config_names])
        for row in scored:
            writer.writerow([row["file"], row["gt_rust"], row["has_metal_label"], row["has_rust_label"],
                             *[row[name] for name in config_names]])

    rusted = [row for row in scored if row["has_rust_label"]]
    low, high = PARTIAL_RANGE
    partial = [row for row in rusted if low < row["gt_rust"] < high]
    whole = [row for row in rusted if row["gt_rust"] >= high]
    label_check = (
        f"Label check: {len(scored)} labelled metal photos, {len(rusted)} with a rust outline. "
        f"Labelled rust share is {high:.0f}% or more on {len(whole)} of them and between "
        f"{low:.0f}% and {high:.0f}% on {len(partial)}."
    )
    lines.append(label_check)
    usable = len(partial) >= max(5, round(0.1 * len(rusted)))
    if not usable:
        lines.append(
            "\n**The labels cannot score rust %.** Almost every rust outline covers the whole "
            "labelled surface, so the labelled share says \"rusted or not\", not how much. "
            "The table below is shown for completeness only."
        )

    def grade(value: float) -> int:
        return main.prediction_engine.astm_grade(value)[0]

    def scores(subset: list[dict]) -> list[list[str]]:
        table = []
        for name in config_names:
            errors = [abs(row[name] - row["gt_rust"]) for row in subset]
            same = sum(grade(row[name]) == grade(row["gt_rust"]) for row in subset)
            near = sum(abs(grade(row[name]) - grade(row["gt_rust"])) <= 1 for row in subset)
            table.append([name, f"{np.mean(errors):.1f} points", percent(same, len(subset)), percent(near, len(subset))])
        return table

    header = ["Setting", "Average error", "Same ASTM grade", "Within one grade"]
    for title, subset in (("All labelled metal photos", scored), ("Partly rusted photos only", partial)):
        if subset:
            lines += [f"\n**{title} ({len(subset)})**\n", markdown_table(header, scores(subset))]
    print("\n".join(lines))
    return lines


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, help="Test split folder (images/ and labels/).")
    parser.add_argument("--out", required=True, help="Folder for the report, CSV files and contact sheets.")
    parser.add_argument("--split", default="test", help="Dataset split to score (default: test).")
    parser.add_argument("--model", help="Model file to evaluate instead of the backend's MODEL_PATH.")
    parser.add_argument("--negatives", help="Folder of extra non-metal photos.")
    parser.add_argument("--brightness", type=float, default=1.0,
                        help="Multiply image brightness (e.g. 0.45 dark, 1.6 bright) to test lighting.")
    parser.add_argument("--skip-rust", action="store_true", help="Only run the metal check sweep.")
    run(parser.parse_args())
