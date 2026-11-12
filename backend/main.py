import os
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import UUID, uuid4

import cv2
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client
from supabase_auth.errors import AuthError
from ultralytics import YOLO

from image_quality import (
    MIN_IMAGE_SIDE,
    assess_lighting,
    assess_sharpness,
    detect_image_format,
)
from predictive_engine import ISOPredictiveEngine
from rust_measurement import colour_rust_mask, rust_patch_boxes
from spread_analysis import classify_distribution

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "metal-scans")
SUPABASE_SIGNED_URL_TTL = int(os.getenv("SUPABASE_SIGNED_URL_TTL", "3600"))
configured_model_path = Path(os.getenv("MODEL_PATH", "models/best.pt"))
MODEL_PATH = str(
    configured_model_path
    if configured_model_path.is_absolute()
    else BASE_DIR / configured_model_path
)
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:8443,http://127.0.0.1:8443,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be configured.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
app = FastAPI(title="MetalErosion API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

prediction_engine = ISOPredictiveEngine()
model = YOLO(MODEL_PATH)


def _class_id(name: str) -> int:
    for class_id, class_name in model.names.items():
        if str(class_name).lower() == name:
            return int(class_id)
    raise RuntimeError(
        f"The model at {MODEL_PATH} has no '{name}' class "
        f"(found {list(model.names.values())}). "
        "A metal/rust segmentation model is required."
    )


if model.task != "segment":
    raise RuntimeError(
        f"The model at {MODEL_PATH} is a '{model.task}' model; "
        "a metal/rust segmentation model is required."
    )
METAL_CLASS_ID = _class_id("metal")
RUST_CLASS_ID = _class_id("rust")

MODEL_CONFIDENCE = 0.25
# Minimum confidence for a metal detection to count as surface. The metal check also
# needs VALIDATION_CONFIDENCE, so to accept weaker metal lower both settings.
METAL_CONFIDENCE = float(os.getenv("METAL_CONFIDENCE", "0.25"))
# Rust detections between RUST_CONFIDENCE and MODEL_CONFIDENCE are kept only where at
# least RUST_MIN_METAL_OVERLAP of the outline lies on detected metal. This recovers rust
# the model is unsure about without accepting "rust" on wood, walls or skin.
# Set RUST_CONFIDENCE to MODEL_CONFIDENCE (0.25) or higher to turn this off.
RUST_CONFIDENCE = float(os.getenv("RUST_CONFIDENCE", "0.12"))
RUST_MIN_METAL_OVERLAP = float(os.getenv("RUST_MIN_METAL_OVERLAP", "0.5"))
MODEL_IOU = 0.45
MODEL_IMAGE_SIZE = 1024  # Matches the training imgsz of the segmentation model.
INFERENCE_MAX_SIDE = 1024  # Large photos are downscaled first to bound mask memory.
# Input validation ("error dropping"). Metal is checked first: the photo must contain a
# confidently detected metal surface covering a minimum share of the image. Fully
# corroded objects (no metal visible, only rust) pass only through a confident rust
# detection of the same minimum size.
VALIDATION_CONFIDENCE = float(os.getenv("VALIDATION_CONFIDENCE", "0.5"))
MIN_SURFACE_AREA_RATIO = float(os.getenv("MIN_SURFACE_AREA_RATIO", "0.05"))
# How rust % is measured inside the AI-detected metal surface:
# - "color" (default): rust-coloured pixels inside the metal surface (rust_measurement.py).
#   Needed while the model's rust masks cover whole objects instead of rust patches.
# - "mask": the model's own rust masks. Switch to this only after retraining with tight
#   rust-patch labels.
RUST_MEASUREMENT = os.getenv("RUST_MEASUREMENT", "color").strip().lower()
if RUST_MEASUREMENT not in ("color", "mask"):
    raise RuntimeError("RUST_MEASUREMENT must be 'color' or 'mask'.")
MAX_IMAGE_BYTES = 15 * 1024 * 1024
# Below this share of the photo, the metal is analysed but flagged as small in the frame.
SMALL_SURFACE_RATIO = 0.15


class MaintenanceRequest(BaseModel):
    rust_percentage: float = Field(ge=0, le=100)
    asset_category: str = "Hardware"


class AccountUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=1)
    email: Optional[str] = Field(default=None, min_length=3)
    role: Optional[str] = None


class RecoveryUpdate(BaseModel):
    status: str = Field(pattern="^(verified|completed|failed)$")


class ScanTitleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


def _authorization_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization is required.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="A bearer token is required.")
    return token.strip()


def _get_user(authorization: Optional[str]) -> dict[str, Any]:
    token = _authorization_token(authorization)
    try:
        response = supabase.auth.get_user(token)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc

    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return {"id": str(user_id), "email": getattr(user, "email", None)}


def current_user(
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    user = _get_user(authorization)
    _ensure_profile(user)
    return user


def _profile(user_id: str) -> dict[str, Any]:
    response = (
        supabase.table("profiles")
        .select("id,role,email,username,created_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return getattr(response, "data", None) or {}


def _ensure_profile(user: dict[str, Any]) -> None:
    if _profile(user["id"]):
        return

    email = user.get("email") or ""
    username = email.split("@", 1)[0].strip() or f"user-{user['id'][:8]}"
    try:
        supabase.table("profiles").insert(
            {
                "id": user["id"],
                "email": email,
                "username": username,
                "role": "user",
            }
        ).execute()
    except Exception as exc:
        logger.exception("Authenticated user profile bootstrap failed")
        raise HTTPException(
            status_code=502,
            detail="The authenticated user profile could not be initialized.",
        ) from exc


def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    profile = _profile(user["id"])
    if profile.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access is required.")
    return {**user, "profile": profile}


def _scan_response(
    *,
    scan_id: Any,
    created_at: Any,
    filename: str,
    image_url: str,
    rust_percentage: float,
    report: dict[str, Any],
    box_coordinates: list[int],
    user_id: Optional[str] = None,
    signed_url: Optional[str] = None,
    title: Optional[str] = None,
    lighting_status: Optional[str] = None,
    quality_warnings: Optional[list[str]] = None,
) -> dict[str, Any]:
    response = {
        "status": "success",
        "filename": filename,
        "title": title or filename,
        "image_url": image_url,
        "rust_percentage": rust_percentage,
        "astm_grade": report["astm_grade"],
        "astm_rating": report["astm_rating"],
        "distribution_type": report["distribution_type"],
        "days_to_critical": report["days_to_critical"],
        "spread_coverage": report["spread_coverage"],
        "spread_factor": report["spread_factor"],
        "regression_slope": report["active_regression_slope"],
        "priority_level": report["priority_tier"],
        "recommendation": report["remediation_protocol"],
        "lighting_status": lighting_status,
        "quality_warnings": list(quality_warnings or []),
        "box_coordinates": box_coordinates,
        "scan_id": str(scan_id) if scan_id is not None else None,
        "created_at": created_at,
        "user_id": user_id,
    }
    if signed_url is not None:
        response["signed_url"] = signed_url
    return response


@dataclass
class SurfaceSegmentation:
    metal_mask: np.ndarray  # bool, inference resolution: model "metal" masks
    rust_mask: np.ndarray  # bool, inference resolution: model "rust" masks
    rust_boxes: list[int]  # flattened x1,y1,x2,y2 in original image pixels
    confident_metal_mask: np.ndarray  # bool, metal detections >= VALIDATION_CONFIDENCE
    confident_rust_mask: np.ndarray  # bool, rust detections >= VALIDATION_CONFIDENCE
    # Rust pixels actually counted for rust % (see RUST_MEASUREMENT), within the surface.
    measured_rust_mask: np.ndarray
    # Low-confidence rust detections (RUST_CONFIDENCE..MODEL_CONFIDENCE) kept / dropped
    # by the metal-overlap filter. Logged per scan for threshold tuning.
    low_conf_rust_kept: int = 0
    low_conf_rust_dropped: int = 0

    @property
    def surface_mask(self) -> np.ndarray:
        return self.metal_mask | self.rust_mask

    @property
    def confident_metal_ratio(self) -> float:
        return float(self.confident_metal_mask.mean()) if self.confident_metal_mask.size else 0.0

    @property
    def confident_rust_ratio(self) -> float:
        return float(self.confident_rust_mask.mean()) if self.confident_rust_mask.size else 0.0

    @property
    def is_metal_surface(self) -> bool:
        """Metal first; a fully corroded object may pass on confident rust alone."""
        return (
            self.confident_metal_ratio >= MIN_SURFACE_AREA_RATIO
            or self.confident_rust_ratio >= MIN_SURFACE_AREA_RATIO
        )

    @property
    def rust_percentage(self) -> float:
        surface = self.surface_mask
        surface_pixels = int(surface.sum())
        if surface_pixels == 0:
            return 0.0
        rust_pixels = int((self.measured_rust_mask & surface).sum())
        return round(rust_pixels / surface_pixels * 100, 2)


def _segment_surface(image: np.ndarray) -> SurfaceSegmentation:
    """Find the metal surface with the segmentation model, then measure rust inside it."""
    height, width = image.shape[:2]
    scale = min(1.0, INFERENCE_MAX_SIDE / max(height, width))
    if scale < 1.0:
        work_image = cv2.resize(
            image,
            (max(1, round(width * scale)), max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        work_image = image
    work_height, work_width = work_image.shape[:2]

    result = model.predict(
        source=work_image,
        conf=min(MODEL_CONFIDENCE, METAL_CONFIDENCE, RUST_CONFIDENCE),
        iou=MODEL_IOU,
        imgsz=MODEL_IMAGE_SIZE,
        retina_masks=True,
        verbose=False,
    )[0]

    shape = (work_height, work_width)
    metal_mask = np.zeros(shape, dtype=bool)
    rust_mask = np.zeros(shape, dtype=bool)
    confident_metal_mask = np.zeros(shape, dtype=bool)
    confident_rust_mask = np.zeros(shape, dtype=bool)
    model_rust_boxes: list[int] = []
    if result.masks is None or result.boxes is None or len(result.boxes) == 0:
        return SurfaceSegmentation(
            metal_mask,
            rust_mask,
            [],
            confident_metal_mask,
            confident_rust_mask,
            np.zeros(shape, dtype=bool),
        )

    classes = result.boxes.cls.cpu().numpy().astype(int)
    confidences = result.boxes.conf.cpu().numpy()
    boxes = result.boxes.xyxy.cpu().numpy()
    raw_masks = result.masks.data.cpu().numpy() > 0.5

    def _sized(mask: np.ndarray) -> np.ndarray:
        if mask.shape == shape:
            return mask
        return cv2.resize(
            mask.astype(np.uint8),
            (work_width, work_height),
            interpolation=cv2.INTER_NEAREST,
        ).astype(bool)

    # Pass 1: metal. Detections below METAL_CONFIDENCE are ignored (the prediction runs
    # at the lowest threshold in use, so they can appear here).
    for class_id, confidence, mask in zip(classes, confidences, raw_masks):
        if class_id != METAL_CLASS_ID or confidence < METAL_CONFIDENCE:
            continue
        mask = _sized(mask)
        metal_mask |= mask
        if confidence >= VALIDATION_CONFIDENCE:
            confident_metal_mask |= mask

    # Metal slightly grown so rust sitting on the metal's edge still counts as "on metal".
    edge = max(3, round(max(work_height, work_width) * 0.01))
    metal_zone = cv2.dilate(
        metal_mask.astype(np.uint8), np.ones((edge, edge), np.uint8)
    ).astype(bool)

    # Pass 2: rust.
    low_conf_rust_kept = 0
    low_conf_rust_dropped = 0
    for class_id, confidence, box, mask in zip(classes, confidences, boxes, raw_masks):
        if class_id != RUST_CLASS_ID or confidence < RUST_CONFIDENCE:
            continue
        mask = _sized(mask)
        if confidence < MODEL_CONFIDENCE:
            # Low-confidence rust: only where most of the outline lies on detected metal.
            mask_pixels = int(mask.sum())
            overlap = int((mask & metal_zone).sum()) / mask_pixels if mask_pixels else 0.0
            if overlap < RUST_MIN_METAL_OVERLAP:
                low_conf_rust_dropped += 1
                continue
            low_conf_rust_kept += 1
        rust_mask |= mask
        if confidence >= VALIDATION_CONFIDENCE:
            confident_rust_mask |= mask
        x1, y1, x2, y2 = (box / scale).tolist()
        model_rust_boxes.extend(
            [
                int(np.clip(round(x1), 0, width)),
                int(np.clip(round(y1), 0, height)),
                int(np.clip(round(x2), 0, width)),
                int(np.clip(round(y2), 0, height)),
            ]
        )

    surface_mask = metal_mask | rust_mask
    if RUST_MEASUREMENT == "color":
        # The model locates the metal; rust-coloured pixels inside it are counted.
        measured_rust_mask = colour_rust_mask(work_image, surface_mask)
        rust_boxes = rust_patch_boxes(
            measured_rust_mask, int(surface_mask.sum()), scale, width, height
        )
    else:
        measured_rust_mask = rust_mask
        rust_boxes = model_rust_boxes

    return SurfaceSegmentation(
        metal_mask,
        rust_mask,
        rust_boxes,
        confident_metal_mask,
        confident_rust_mask,
        measured_rust_mask,
        low_conf_rust_kept,
        low_conf_rust_dropped,
    )


def _history_scan_response(scan: dict[str, Any]) -> dict[str, Any]:
    rust_percentage = float(scan["rust_percentage"])
    # Scans saved before migrations 002/003 have no distribution, lighting or spread
    # columns; a missing spread keeps the category slope unchanged.
    spread_coverage = scan.get("spread_coverage")
    report = prediction_engine.analyze_scan(
        rust_percentage,
        "Hardware",
        scan.get("distribution_type"),
        float(spread_coverage) if spread_coverage is not None else None,
    )
    image_url = str(scan["image_url"])
    filename = image_url.rsplit("/", 1)[-1].split("?", 1)[0] or "image"
    return _scan_response(
        scan_id=scan["id"],
        created_at=scan.get("created_at"),
        filename=filename,
        image_url=image_url,
        rust_percentage=rust_percentage,
        report=report,
        box_coordinates=scan.get("box_coordinates") or [],
        user_id=scan.get("user_id"),
        title=scan.get("title") or filename,
        lighting_status=scan.get("lighting_status"),
        quality_warnings=scan.get("quality_warnings"),
    )


# Columns added by migrations/002_add_distribution_and_lighting.sql and
# migrations/003_analytics_fields.sql.
SCAN_ANALYSIS_COLUMNS = (
    "distribution_type",
    "lighting_status",
    "days_to_critical",
    "spread_coverage",
    "quality_warnings",
)


def _reject_scan(
    user: dict[str, Any],
    code: str,
    message: str,
    *,
    status_code: int = 422,
    reason: Optional[str] = None,
) -> HTTPException:
    """Record why a scan was rejected (for admin analytics) and build the error to raise.

    Logging is best effort: a missing scan_rejections table (migration 003 not run) or a
    database error never blocks the response.
    """
    try:
        supabase.table("scan_rejections").insert(
            {"user_id": user["id"], "reason": reason or code}
        ).execute()
    except Exception:
        logger.warning(
            "Scan rejection '%s' was not logged. Run backend/migrations/003_analytics_fields.sql.",
            reason or code,
        )
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _insert_scan(payload: dict[str, Any]) -> Any:
    """Insert a scan row; drop any optional column whose migration has not been run yet."""
    payload = dict(payload)
    for _attempt in range(len(SCAN_ANALYSIS_COLUMNS) + 1):
        try:
            return supabase.table("scans").insert(payload).execute()
        except Exception as exc:
            message = str(exc)
            missing = [
                column
                for column in SCAN_ANALYSIS_COLUMNS
                if column in payload and column in message
            ]
            if not missing:
                raise
            logger.warning(
                "scans table has no %s column; saving the scan without it. "
                "Run the SQL files in backend/migrations (002 and 003).",
                ", ".join(missing),
            )
            for column in missing:
                payload.pop(column)
    raise RuntimeError("The scan could not be saved after removing optional columns.")


@app.post("/analyze-asset")
@app.post("/analyze-corrosion")
async def analyze_corrosion(
    file: UploadFile = File(...),
    asset_category: str = Form("Hardware"),
    title: str = Form(""),
    submitted_user_id: Optional[str] = Form(default=None),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    contents = await file.read()
    if not contents or len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image is empty or too large.")
    if submitted_user_id and submitted_user_id != user["id"]:
        raise HTTPException(
            status_code=403,
            detail="The submitted user does not match the authenticated user.",
        )

    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="A scan title is required.")
    if len(normalized_title) > 120:
        raise HTTPException(status_code=400, detail="Scan titles must be 120 characters or fewer.")
    if asset_category not in prediction_engine.category_slopes:
        raise HTTPException(
            status_code=400,
            detail="Unknown asset category. Use one of: "
            + ", ".join(prediction_engine.category_slopes)
            + ".",
        )

    # The real format comes from the file's bytes, not the browser's content-type header.
    image_format = detect_image_format(contents)
    if image_format is None:
        raise _reject_scan(
            user, "unsupported_format", "Use a JPEG, PNG or WebP image.", status_code=400
        )
    file_extension, content_type = image_format

    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise _reject_scan(
            user, "invalid_image", "The uploaded file is not a valid image.", status_code=400
        )

    if min(image.shape[:2]) < MIN_IMAGE_SIDE:
        raise _reject_scan(
            user,
            "too_small",
            f"This photo is too small to analyze. Use a photo at least {MIN_IMAGE_SIDE} pixels "
            "on its shortest side.",
        )

    # Environmental lighting check: unusable exposures are rejected before inference,
    # borderline ones are analysed and flagged in the response.
    lighting = assess_lighting(image)
    if not lighting.is_usable:
        raise _reject_scan(
            user,
            "poor_lighting",
            "This photo is too dark to analyze reliably. Retake it in brighter, even light."
            if lighting.status == "too_dark"
            else "This photo is too bright or has too much glare to analyze reliably. "
            "Retake it without direct light or flash on the surface.",
            reason=lighting.status,
        )

    # Sharpness check: very blurry photos are rejected, slightly blurry ones are flagged.
    sharpness = assess_sharpness(image)
    if not sharpness.is_usable:
        raise _reject_scan(
            user,
            "too_blurry",
            "This photo is too blurry to analyze reliably. Hold the camera steady, "
            "tap to focus on the metal, and retake it.",
        )

    try:
        segmentation = _segment_surface(image)
    except Exception as exc:
        logger.exception("Corrosion model inference failed")
        raise HTTPException(
            status_code=503,
            detail="The corrosion model could not analyze this image.",
        ) from exc

    # Error dropping: reject images where no metal (or rusted metal) surface is found,
    # before anything is uploaded or saved.
    if not segmentation.is_metal_surface:
        raise _reject_scan(
            user,
            "not_metal",
            "No metal surface was detected in this image. "
            "Upload a photo where the metal surface fills most of the frame.",
        )

    # Usable but imperfect photos are analysed, with warnings shown beside the result.
    quality_warnings: list[str] = []
    if sharpness.status == "slightly_blurry":
        quality_warnings.append("slightly_blurry")
    if float(segmentation.surface_mask.mean()) < SMALL_SURFACE_RATIO:
        quality_warnings.append("small_surface")

    # Rust coverage is measured against the detected metal surface, not the whole photo
    # (see RUST_MEASUREMENT for how rust pixels inside the surface are counted).
    rust_percentage = segmentation.rust_percentage
    flat_boxes = segmentation.rust_boxes
    distribution = classify_distribution(
        segmentation.measured_rust_mask, segmentation.surface_mask
    )
    report = prediction_engine.analyze_scan(
        rust_percentage, asset_category, distribution["type"], distribution["coverage_ratio"]
    )
    logger.info(
        "Scan analysed: rust=%.2f%% rating=%s slope=%s (spread x%s) days=%s lighting=%s "
        "sharpness=%s warnings=%s low_conf_rust(kept=%d, dropped=%d) geometry=%s",
        rust_percentage,
        report["astm_rating"],
        report["active_regression_slope"],
        report["spread_factor"],
        report["days_to_critical"],
        lighting.status,
        sharpness.sharpness,
        quality_warnings,
        segmentation.low_conf_rust_kept,
        segmentation.low_conf_rust_dropped,
        distribution,
    )
    filename = file.filename or "image.jpg"
    storage_path = f"scans/{user['id']}/{uuid4()}{file_extension}"
    try:
        storage = supabase.storage.from_(SUPABASE_STORAGE_BUCKET)
        storage.upload(
            storage_path,
            contents,
            {"content-type": content_type, "upsert": "false"},
        )
        signed_url = storage.create_signed_url(storage_path, SUPABASE_SIGNED_URL_TTL)["signedURL"]
    except Exception as exc:
        logger.exception("Scan image storage failed")
        raise HTTPException(
            status_code=502,
            detail="The scan image could not be stored.",
        ) from exc

    supabase_payload = {
        "user_id": user["id"],
        "image_url": signed_url,
        "title": normalized_title,
        "rust_percentage": rust_percentage,
        "box_coordinates": flat_boxes,
        "distribution_type": distribution["type"],
        "lighting_status": lighting.status,
        "days_to_critical": report["days_to_critical"],
        "spread_coverage": report["spread_coverage"],
        "quality_warnings": quality_warnings,
    }
    try:
        inserted = _insert_scan(supabase_payload)
    except Exception as exc:
        try:
            supabase.storage.from_(SUPABASE_STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.exception("Failed to clean up scan storage after database failure")
        logger.exception("Scan database persistence failed")
        raise HTTPException(
            status_code=502,
            detail="The scan result could not be saved.",
        ) from exc
    if not inserted.data:
        raise HTTPException(status_code=502, detail="The scan could not be persisted.")

    scan = inserted.data[0]
    return _scan_response(
        scan_id=scan["id"],
        created_at=scan.get("created_at"),
        filename=filename,
        image_url=signed_url,
        rust_percentage=rust_percentage,
        report=report,
        box_coordinates=flat_boxes,
        user_id=user["id"],
        signed_url=signed_url,
        title=normalized_title,
        lighting_status=lighting.status,
        quality_warnings=quality_warnings,
    )

@app.get("/history")
def history(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    response = (
        supabase.table("scans")
        .select("*")  # "*" also returns the optional migration 002 columns when present
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return [_history_scan_response(scan) for scan in (response.data or [])]


@app.patch("/history/{scan_id}")
def update_history_scan(
    scan_id: UUID,
    changes: ScanTitleUpdate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    title = changes.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="A scan title is required.")

    existing = (
        supabase.table("scans")
        .select("*")  # "*" also returns the optional migration 002 columns when present
        .eq("id", str(scan_id))
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    scan = existing.data
    if not scan:
        raise HTTPException(status_code=404, detail="Scan history was not found.")

    try:
        updated = (
            supabase.table("scans")
            .update({"title": title})
            .eq("id", str(scan_id))
            .eq("user_id", user["id"])
            .execute()
        )
    except Exception as exc:
        logger.exception("Scan title update failed")
        raise HTTPException(
            status_code=502,
            detail="The scan title could not be updated.",
        ) from exc

    updated_scan = {**scan, **(updated.data[0] if updated.data else {}), "title": title}
    return _history_scan_response(updated_scan)


@app.get("/me")
def current_account(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    profile = _profile(user["id"])
    return {
        "id": user["id"],
        "username": profile.get("username") or (user.get("email") or "User").split("@")[0],
        "email": profile.get("email") or user.get("email") or "",
        "role": profile.get("role", "user"),
        "status": "active",
        "created_at": profile.get("created_at") or "",
        "last_active_at": profile.get("created_at") or "",
    }


@app.delete("/history/{scan_id}")
def delete_history_scan(
    scan_id: UUID,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    existing = (
        supabase.table("scans")
        .select("id")
        .eq("id", str(scan_id))
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    scan = existing.data
    if not scan:
        raise HTTPException(status_code=404, detail="Scan history was not found.")

    try:
        supabase.table("scans").delete().eq("id", str(scan_id)).eq(
            "user_id", user["id"]
        ).execute()
    except Exception as exc:
        logger.exception("Scan history deletion failed")
        raise HTTPException(
            status_code=502,
            detail="The scan history could not be deleted.",
        ) from exc

    return {"status": "deleted", "scan_id": str(scan_id)}


@app.post("/predict-maintenance")
def predict_maintenance(
    request: MaintenanceRequest,
    _user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    if request.asset_category not in prediction_engine.category_slopes:
        raise HTTPException(
            status_code=400,
            detail="Unknown asset category. Use one of: "
            + ", ".join(prediction_engine.category_slopes)
            + ".",
        )
    return prediction_engine.analyze_scan(
        request.rust_percentage, request.asset_category
    )


@app.get("/admin/accounts")
def admin_accounts(_admin: dict[str, Any] = Depends(admin_user)) -> list[dict[str, Any]]:
    response = (
        supabase.table("profiles")
        .select("id,username,email,role,created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return [
        {
            **account,
            "status": "active",
            "last_active_at": account.get("created_at"),
        }
        for account in (response.data or [])
    ]


@app.patch("/admin/accounts/{account_id}")
def update_admin_account(
    account_id: UUID,
    changes: AccountUpdate,
    _admin: dict[str, Any] = Depends(admin_user),
) -> dict[str, Any]:
    updates = changes.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="At least one account field is required.")
    if updates.get("role") not in (None, "user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be user or admin.")
    response = (
        supabase.table("profiles")
        .update(updates)
        .eq("id", str(account_id))
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Account not found.")
    return response.data[0]


@app.patch("/admin/accounts/{account_id}/status")
def update_account_status(
    account_id: UUID,
    _admin: dict[str, Any] = Depends(admin_user),
) -> None:
    raise HTTPException(
        status_code=409,
        detail="Account status is not available in the confirmed profiles schema.",
    )


@app.get("/admin/metrics")
def admin_metrics(
    range: str = Query("month", pattern="^(day|week|month)$"),
    _admin: dict[str, Any] = Depends(admin_user),
) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    start_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    start_week = (now - timedelta(days=7)).isoformat()
    start_month = (now - timedelta(days=30)).isoformat()

    def count_since(start: str) -> int:
        result = (
            supabase.table("scans")
            .select("id", count="exact")
            .gte("created_at", start)
            .execute()
        )
        return int(result.count or 0)

    accounts = supabase.table("profiles").select("id", count="exact").execute()
    active_accounts = supabase.table("profiles").select("id", count="exact").execute()
    metrics = {
        "total_accounts": int(accounts.count or 0),
        "active_accounts": int(active_accounts.count or 0),
        "scans_today": count_since(start_day),
        "scans_this_week": count_since(start_week),
        "scans_this_month": count_since(start_month),
    }
    metrics["selected_range_scans"] = metrics[
        {"day": "scans_today", "week": "scans_this_week", "month": "scans_this_month"}[range]
    ]
    return metrics


def _parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse a Supabase timestamp; fractional seconds are dropped (their length varies)."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(re.sub(r"\.\d+", "", value.replace("Z", "+00:00")))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@app.get("/admin/analytics")
def admin_analytics(
    days: int = Query(30, ge=1, le=365),
    tz_offset: int = Query(0, ge=-840, le=840),
    _admin: dict[str, Any] = Depends(admin_user),
) -> dict[str, Any]:
    """System-wide aggregates for the admin charts over the last `days` calendar days.

    tz_offset is the browser's offset from UTC in minutes (480 for UTC+8), so that
    "per day" follows the admin's own calendar days.
    """
    local = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(local).date()
    first_day = today - timedelta(days=days - 1)
    start = datetime.combine(first_day, datetime.min.time(), tzinfo=local).isoformat()

    scans = (
        supabase.table("scans")
        .select("*")  # "*" also returns the optional migration 002/003 columns when present
        .gte("created_at", start)
        .order("created_at")
        .limit(5000)
        .execute()
    ).data or []

    per_day = {(first_day + timedelta(days=offset)).isoformat(): 0 for offset in range(days)}
    by_grade: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_distribution: dict[str, int] = {}
    by_lighting: dict[str, int] = {}
    for scan in scans:
        created = _parse_timestamp(scan.get("created_at"))
        if created is not None:
            day = created.astimezone(local).date().isoformat()
            if day in per_day:
                per_day[day] += 1
        coverage = scan.get("spread_coverage")
        report = prediction_engine.analyze_scan(
            float(scan["rust_percentage"]),
            "Hardware",
            scan.get("distribution_type"),
            float(coverage) if coverage is not None else None,
        )
        for counts, key in (
            (by_grade, str(report["astm_grade"])),
            (by_priority, report["priority_tier"]),
            (by_distribution, scan.get("distribution_type") or "none"),
            (by_lighting, scan.get("lighting_status") or "unknown"),
        ):
            counts[key] = counts.get(key, 0) + 1

    # The rejection log exists only after migration 003.
    rejections: dict[str, int] = {}
    rejections_available = True
    try:
        rejected = (
            supabase.table("scan_rejections")
            .select("reason")
            .gte("created_at", start)
            .limit(5000)
            .execute()
        ).data or []
        for row in rejected:
            reason = row.get("reason") or "unknown"
            rejections[reason] = rejections.get(reason, 0) + 1
    except Exception:
        rejections_available = False

    return {
        "days": days,
        "total_scans": len(scans),
        "total_rejections": sum(rejections.values()),
        "scans_per_day": [{"date": day, "count": count} for day, count in per_day.items()],
        "by_grade": by_grade,
        "by_priority": by_priority,
        "by_distribution": by_distribution,
        "by_lighting": by_lighting,
        "rejections": rejections,
        "rejections_available": rejections_available,
    }


@app.get("/admin/recovery-requests")
def recovery_requests(_admin: dict[str, Any] = Depends(admin_user)) -> list[dict[str, Any]]:
    response = (
        supabase.table("password_reset_logs")
        .select("id, user_id, status, requested_at, profiles(username, email)")
        .order("requested_at", desc=True)
        .execute()
    )
    return [
        {
            "id": log["id"],
            "user_id": log["user_id"],
            "username": (log.get("profiles") or {}).get("username"),
            "email": (log.get("profiles") or {}).get("email"),
            "status": log["status"],
            "requested_at": log["requested_at"],
        }
        for log in (response.data or [])
    ]


@app.patch("/admin/recovery-requests/{request_id}")
def update_recovery_request(
    request_id: UUID,
    update: RecoveryUpdate,
    _admin: dict[str, Any] = Depends(admin_user),
) -> dict[str, Any]:
    response = (
        supabase.table("password_reset_logs")
        .update({"status": update.status})
        .eq("id", str(request_id))
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Recovery request not found.")
    return response.data[0]


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)