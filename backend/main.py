import os
import logging
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote
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
from asset_profile import (
    ELEMENT_NAMES,
    ENVIRONMENT_CODES,
    LEGACY_CATEGORY_RATES,
    LEGACY_DEFAULT_CATEGORY,
    scan_options_payload,
)
import inventory
from decision_support import build_decision_support
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
# The scan endpoint runs in a worker thread so the server keeps answering other requests
# during a scan. The models are not safe to run from two threads at once, so scans take
# turns at the inference steps.
_inference_lock = threading.Lock()


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

# Detection confidence of the segmentation model, for metal and rust alike. The tested
# configuration sets MODEL_CONFIDENCE=0.15 in .env so more scattered rust is picked up.
MODEL_CONFIDENCE = float(os.getenv("MODEL_CONFIDENCE", "0.25"))
# Optional overrides. Both default to MODEL_CONFIDENCE, which is the tested behaviour;
# the published test results do not hold if they are set to anything else.
# - METAL_CONFIDENCE: minimum confidence for a metal detection to count as surface.
# - RUST_CONFIDENCE: rust detections between it and MODEL_CONFIDENCE are kept only where
#   at least RUST_MIN_METAL_OVERLAP of the outline lies on detected metal.
METAL_CONFIDENCE = float(os.getenv("METAL_CONFIDENCE", str(MODEL_CONFIDENCE)))
RUST_CONFIDENCE = float(os.getenv("RUST_CONFIDENCE", str(MODEL_CONFIDENCE)))
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
# - "mask": the model's own rust masks.
# - "hybrid": rust-coloured pixels, counted only in or near areas the model marked as rust.
#   On the unseen test set this agreed best with the hand labels (ASTM grade exact 73%,
#   within one grade 88%) and stopped rust-coloured clean metal being counted as rust.
RUST_MEASUREMENT = os.getenv("RUST_MEASUREMENT", "color").strip().lower()
if RUST_MEASUREMENT not in ("color", "mask", "hybrid"):
    raise RuntimeError("RUST_MEASUREMENT must be 'color', 'mask' or 'hybrid'.")
# Hybrid mode: how far outside a model rust area a rust-coloured pixel may sit, as a
# share of the image's longer side. 0.02 is the tested value.
HYBRID_REACH = float(os.getenv("HYBRID_REACH", "0.02"))
# Optional second segmentation pass on a close-up of the detected metal, to find rust
# that is too small to detect when the whole photo is scaled down. Off by default: it is
# not part of the tested configuration, and it doubles the model time on most photos.
RESCAN_METAL_CROP = os.getenv("RESCAN_METAL_CROP", "false").strip().lower() in ("1", "true", "yes")
RESCAN_PADDING = 0.05  # Margin kept around the metal, as a share of the image's longer side.
RESCAN_MAX_CROP_SHARE = float(os.getenv("RESCAN_MAX_CROP_SHARE", "0.7"))  # Skip when the metal fills more of the frame than this.
MAX_IMAGE_BYTES = 15 * 1024 * 1024
# Below this share of the photo, the metal is analysed but flagged as small in the frame.
SMALL_SURFACE_RATIO = 0.15

# Stage 1 of the classification hierarchy (optional): a whole-image classifier that
# answers "metal or not" before the segmentation model runs. It is used only if the
# model file exists; without it the segmentation-based metal check still applies.
configured_classifier_path = Path(os.getenv("METAL_CLASSIFIER_PATH", "models/metal_cls.pt"))
METAL_CLASSIFIER_PATH = (
    configured_classifier_path
    if configured_classifier_path.is_absolute()
    else BASE_DIR / configured_classifier_path
)
METAL_CLASSIFIER_THRESHOLD = float(os.getenv("METAL_CLASSIFIER_THRESHOLD", "0.5"))
metal_classifier = None
METAL_CLASSIFIER_METAL_ID = None
if METAL_CLASSIFIER_PATH.exists():
    metal_classifier = YOLO(str(METAL_CLASSIFIER_PATH))
    if metal_classifier.task != "classify":
        raise RuntimeError(f"{METAL_CLASSIFIER_PATH} is not a classification model.")
    for _classifier_id, _classifier_name in metal_classifier.names.items():
        if str(_classifier_name).lower() == "metal":
            METAL_CLASSIFIER_METAL_ID = int(_classifier_id)
    if METAL_CLASSIFIER_METAL_ID is None:
        raise RuntimeError(
            f"{METAL_CLASSIFIER_PATH} has no 'metal' class "
            f"(found {list(metal_classifier.names.values())})."
        )


def metal_probability(image: np.ndarray) -> Optional[float]:
    """Probability that the photo shows metal, or None when no classifier is installed."""
    if metal_classifier is None:
        return None
    result = metal_classifier.predict(source=image, imgsz=224, verbose=False)[0]
    return float(result.probs.data[METAL_CLASSIFIER_METAL_ID])


def passes_metal_classifier(image: np.ndarray) -> bool:
    probability = metal_probability(image)
    return probability is None or probability >= METAL_CLASSIFIER_THRESHOLD


class MaintenanceRequest(BaseModel):
    rust_percentage: float = Field(ge=0, le=100)
    environment: str


class AccountUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=1)
    email: Optional[str] = Field(default=None, min_length=3)
    role: Optional[str] = None


class RecoveryUpdate(BaseModel):
    status: str = Field(pattern="^(verified|completed|failed)$")


class ScanUpdate(BaseModel):
    """Fields of a saved scan the owner may change. At least one must be given."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    element_type: Optional[str] = None
    environment: Optional[str] = None


def _scan_details_error(message: str) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={"code": "scan_details_required", "message": message},
    )


def _checked_element_type(value: str) -> str:
    """The element type exactly as defined; anything else is refused."""
    value = value.strip()
    if value not in ELEMENT_NAMES:
        raise _scan_details_error(
            "Choose the type of steel element: " + ", ".join(ELEMENT_NAMES) + "."
        )
    return value


def _checked_environment(value: str) -> str:
    """The exposure environment code exactly as defined; anything else is refused."""
    value = value.strip()
    if value not in ENVIRONMENT_CODES:
        raise _scan_details_error(
            "Choose the exposure environment: " + ", ".join(ENVIRONMENT_CODES) + "."
        )
    return value


def _scan_profile(scan: dict[str, Any]) -> tuple[Optional[str], Optional[str], Optional[str], str]:
    """(element type, environment, legacy category, rate key) of a stored scan.

    Scans saved before element types and environments existed carry an object
    category, or nothing; they keep the rate they were analysed with.
    """
    stored_element = scan.get("element_type")
    stored_environment = scan.get("environment")
    stored_category = scan.get("asset_category")
    element_type = stored_element if stored_element in ELEMENT_NAMES else None
    environment = stored_environment if stored_environment in ENVIRONMENT_CODES else None
    legacy_category = stored_category if stored_category in LEGACY_CATEGORY_RATES else None
    rate_key = environment or legacy_category or LEGACY_DEFAULT_CATEGORY
    return element_type, environment, legacy_category, rate_key


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
    profile = _ensure_profile(user)
    # Roles: "user" (an inspector), "engineer" and "admin". The stored name "user" is
    # kept so that existing accounts and the sign-up trigger need no change.
    return {
        **user,
        "role": profile.get("role") or "user",
        "username": profile.get("username"),
    }


def _profile(user_id: str) -> dict[str, Any]:
    response = (
        supabase.table("profiles")
        .select("id,role,email,username,created_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return getattr(response, "data", None) or {}


def _ensure_profile(user: dict[str, Any]) -> dict[str, Any]:
    """The user's profile, created on first sight."""
    profile = _profile(user["id"])
    if profile:
        return profile

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
    return {"id": user["id"], "role": "user", "email": email, "username": username}


def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access is required.")
    return user


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
    element_type: Optional[str] = None,
    environment: Optional[str] = None,
    legacy_category: Optional[str] = None,
    asset: Optional[dict[str, Any]] = None,
    review: Optional[dict[str, Any]] = None,
    inspector_name: Optional[str] = None,
) -> dict[str, Any]:
    # The maintenance answer is built from the scan's own values every time, so scans
    # saved before this existed get it too and nothing extra is stored.
    decision = build_decision_support(
        rust_percentage=rust_percentage,
        astm_grade=report["astm_grade"],
        distribution_type=report["distribution_type"],
        element_type=element_type,
        environment=environment,
        legacy_category=legacy_category,
        days_to_critical=report["days_to_critical"],
        active_slope=report["active_slope_exact"],
        priority_tier=report["priority_tier"],
        lighting_status=lighting_status,
        quality_warnings=quality_warnings,
    )
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
        # Both are None for scans saved before they were recorded; such a scan may
        # carry the object category it was analysed with instead.
        "element_type": element_type,
        "environment": environment,
        "legacy_category": legacy_category,
        "baseline_rate": report["base_regression_slope"],
        "priority_level": report["priority_tier"],
        # One-line form of the answer, for the alert pop-up, the info page and search.
        "recommendation": f"{decision['headline']} {decision['summary']}",
        "decision_support": decision,
        "lighting_status": lighting_status,
        "quality_warnings": list(quality_warnings or []),
        "box_coordinates": box_coordinates,
        # The steel element this scan belongs to; None for a scan with no asset.
        "asset": asset,
        # An engineer's confirmation or correction; None while unreviewed. When a scan
        # was corrected, rust_percentage above is the engineer's value and the
        # review carries what the AI measured.
        "review": review,
        "inspector_name": inspector_name,
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


def _rescan_metal_crop(
    image: np.ndarray, metal_mask: np.ndarray, scale: float
) -> Optional[np.ndarray]:
    """Run the segmentation model again on a close-up of the detected metal.

    The first pass sees the whole photo scaled to INFERENCE_MAX_SIDE, so rust on a
    small object covers few pixels. Cropping to the metal from the full-resolution photo
    shows the model the same rust larger. Returns a rust mask at the first pass's
    (work image) size, or None when there is no metal or it already fills the frame.
    """
    rows, cols = np.nonzero(metal_mask)
    if rows.size == 0:
        return None
    work_height, work_width = metal_mask.shape
    pad = round(RESCAN_PADDING * max(work_height, work_width))
    top, bottom = max(0, int(rows.min()) - pad), min(work_height, int(rows.max()) + 1 + pad)
    left, right = max(0, int(cols.min()) - pad), min(work_width, int(cols.max()) + 1 + pad)
    if (bottom - top) * (right - left) > RESCAN_MAX_CROP_SHARE * work_height * work_width:
        return None  # The metal already fills the frame; a close-up would show the same view.

    # Cut the close-up from the original photo, where it has the most detail.
    height, width = image.shape[:2]
    crop = image[
        round(top / scale) : min(height, round(bottom / scale)),
        round(left / scale) : min(width, round(right / scale)),
    ]
    if crop.size == 0:
        return None
    crop_scale = min(1.0, INFERENCE_MAX_SIDE / max(crop.shape[:2]))
    if crop_scale < 1.0:
        crop = cv2.resize(
            crop,
            (max(1, round(crop.shape[1] * crop_scale)), max(1, round(crop.shape[0] * crop_scale))),
            interpolation=cv2.INTER_AREA,
        )

    result = model.predict(
        source=crop,
        conf=MODEL_CONFIDENCE,
        iou=MODEL_IOU,
        imgsz=MODEL_IMAGE_SIZE,
        retina_masks=True,
        verbose=False,
    )[0]
    if result.masks is None or result.boxes is None or len(result.boxes) == 0:
        return None

    crop_rust = np.zeros(crop.shape[:2], dtype=np.uint8)
    for class_id, mask in zip(
        result.boxes.cls.cpu().numpy().astype(int), result.masks.data.cpu().numpy() > 0.5
    ):
        if class_id != RUST_CLASS_ID:
            continue
        if mask.shape != crop_rust.shape:
            mask = cv2.resize(
                mask.astype(np.uint8),
                (crop_rust.shape[1], crop_rust.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            ).astype(bool)
        crop_rust[mask] = 1
    if not crop_rust.any():
        return None

    # Place the close-up's rust back where the crop came from in the first pass's frame.
    closeup_rust = np.zeros(metal_mask.shape, dtype=bool)
    closeup_rust[top:bottom, left:right] = cv2.resize(
        crop_rust, (right - left, bottom - top), interpolation=cv2.INTER_NEAREST
    ).astype(bool)
    return closeup_rust


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

    # Optional second look: scan the metal on its own, enlarged, and add any rust found
    # there. Only rust on the metal located by the first pass is added.
    if RESCAN_METAL_CROP:
        closeup_rust = _rescan_metal_crop(image, metal_mask, scale)
        if closeup_rust is not None:
            rust_mask |= closeup_rust & metal_zone

    surface_mask = metal_mask | rust_mask
    if RUST_MEASUREMENT in ("color", "hybrid"):
        # The model locates the metal; rust-coloured pixels inside it are counted.
        measured_rust_mask = colour_rust_mask(work_image, surface_mask)
        if RUST_MEASUREMENT == "hybrid":
            # Keep only rust-coloured pixels in or near areas the model marked as rust.
            kernel_size = max(5, int(HYBRID_REACH * max(work_height, work_width))) | 1
            near_model_rust = cv2.dilate(
                rust_mask.astype(np.uint8),
                np.ones((kernel_size, kernel_size), np.uint8),
            ).astype(bool)
            measured_rust_mask = measured_rust_mask & near_model_rust
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


def _scan_review(scan: dict[str, Any]) -> Optional[dict[str, Any]]:
    """The engineer's review of a stored scan, or None while it is unreviewed."""
    status = scan.get("review_status")
    if status not in ("confirmed", "corrected"):
        return None
    ai_rust = float(scan["rust_percentage"])
    return {
        "status": status,
        "by": scan.get("reviewed_by"),
        "by_name": scan.get("reviewed_by_name"),
        "at": scan.get("reviewed_at"),
        "note": scan.get("review_note"),
        "ai_rust_percentage": ai_rust,
        "ai_distribution_type": scan.get("distribution_type"),
        "ai_astm_grade": prediction_engine.astm_grade(ai_rust)[0],
    }


def _history_scan_response(scan: dict[str, Any]) -> dict[str, Any]:
    # An engineer's correction replaces the AI's values everywhere a result is shown
    # or counted; the AI's own values stay in the row and in the review.
    rust_percentage = inventory.effective_rust(scan)
    corrected = scan.get("reviewed_rust_percentage") is not None
    distribution_type = scan.get("distribution_type")
    if corrected:
        distribution_type = scan.get("reviewed_distribution") or distribution_type
        if rust_percentage <= 0:
            distribution_type = None
    # Scans saved before migrations 002/003 have no distribution, lighting or spread
    # columns; a missing spread keeps the category slope unchanged.
    spread_coverage = scan.get("spread_coverage")
    element_type, environment, legacy_category, rate_key = _scan_profile(scan)
    report = prediction_engine.analyze_scan(
        rust_percentage,
        rate_key,
        distribution_type,
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
        element_type=element_type,
        environment=environment,
        legacy_category=legacy_category,
        asset=scan.get("_asset"),
        review=_scan_review(scan),
        inspector_name=scan.get("inspector_name"),
    )


def _attach_assets(scans: list[dict[str, Any]]) -> None:
    """Give each stored scan the short reference of the asset it belongs to, in place."""
    references = inventory.asset_refs(supabase, [scan.get("asset_id") for scan in scans])
    for scan in scans:
        scan["_asset"] = references.get(scan.get("asset_id"))


def _stored_scan(scan_id: UUID) -> dict[str, Any]:
    existing = (
        supabase.table("scans")
        .select("*")  # "*" also returns the optional migration columns when present
        .eq("id", str(scan_id))
        .maybe_single()
        .execute()
    )
    scan = getattr(existing, "data", None)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan history was not found.")
    return scan


def _editable_scan(scan_id: UUID, user: dict[str, Any]) -> dict[str, Any]:
    """A scan this user may change: their own, or any scan for an engineer or admin."""
    scan = _stored_scan(scan_id)
    if scan.get("user_id") != user["id"] and not inventory.is_manager(user):
        raise HTTPException(status_code=404, detail="Scan history was not found.")
    return scan


_SIGNED_OBJECT_PATH = re.compile(r"/object/sign/([^/?]+)/([^?]+)")


def _storage_path(image_url: Any) -> Optional[str]:
    """The image's path inside the scan bucket, read from a stored signed URL."""
    match = _SIGNED_OBJECT_PATH.search(str(image_url or ""))
    if not match or match.group(1) != SUPABASE_STORAGE_BUCKET:
        return None
    return unquote(match.group(2))


def _refresh_image_urls(scans: list[dict[str, Any]]) -> None:
    """Give each scan a fresh image link, in place.

    The link saved with a scan is a signed URL that stops working after
    SUPABASE_SIGNED_URL_TTL seconds, so saved scans would lose their image. The path
    inside the link stays valid, so new links are signed for all scans in one request.
    A failure leaves the stored links as they are.
    """
    paths = sorted({path for scan in scans if (path := _storage_path(scan.get("image_url")))})
    if not paths:
        return
    try:
        signed = supabase.storage.from_(SUPABASE_STORAGE_BUCKET).create_signed_urls(
            paths, SUPABASE_SIGNED_URL_TTL
        )
    except Exception:
        logger.warning("Scan image links could not be refreshed; using the stored links.")
        return
    fresh = {
        item.get("path"): item.get("signedURL")
        for item in signed
        if item.get("signedURL") and not item.get("error")
    }
    for scan in scans:
        url = fresh.get(_storage_path(scan.get("image_url")))
        if url:
            scan["image_url"] = url


# Columns added by migrations 002 (distribution, lighting), 003 (analytics fields) and
# 006 (element type and exposure environment).
SCAN_ANALYSIS_COLUMNS = (
    "distribution_type",
    "lighting_status",
    "days_to_critical",
    "spread_coverage",
    "quality_warnings",
    "element_type",
    "environment",
    "asset_id",
    "rust_method",
    "inspector_name",
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
                "Run the SQL files in backend/migrations (002, 003 and 004).",
                ", ".join(missing),
            )
            for column in missing:
                payload.pop(column)
    raise RuntimeError("The scan could not be saved after removing optional columns.")


@dataclass
class ScreenedImage:
    """A photo that passed every check before rust is measured."""

    image_format: tuple[str, str]  # (file extension, content type)
    lighting: Any
    sharpness: Any
    segmentation: "SurfaceSegmentation"
    quality_warnings: list[str]


def _read_upload(file: UploadFile) -> bytes:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    # Read one byte past the limit at most, so an oversized upload is not held in memory.
    contents = file.file.read(MAX_IMAGE_BYTES + 1)
    if not contents or len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image is empty or too large.")
    return contents


def _screen_image(contents: bytes, user: dict[str, Any]) -> ScreenedImage:
    """Run every photo check: format, size, lighting, sharpness and the metal checks.

    Shared by /check-image (run when the photo is chosen, before a category can be
    picked) and /analyze-corrosion (run again on the scan itself, so a skipped
    pre-check never lets a non-metal photo through).
    """
    # The real format comes from the file's bytes, not the browser's content-type header.
    image_format = detect_image_format(contents)
    if image_format is None:
        raise _reject_scan(
            user, "unsupported_format", "Use a JPEG, PNG or WebP image.", status_code=400
        )

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

    # Stage 1: whole-image metal check (skipped when no classifier is installed).
    with _inference_lock:
        is_metal = passes_metal_classifier(image)
    if not is_metal:
        raise _reject_scan(
            user,
            "not_metal",
            "No metal surface was detected in this image. "
            "Upload a photo where the metal surface fills most of the frame.",
            reason="not_metal_classifier",
        )

    # Stage 2: locate the metal and the rust on it.
    try:
        with _inference_lock:
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

    return ScreenedImage(
        image_format=image_format,
        lighting=lighting,
        sharpness=sharpness,
        segmentation=segmentation,
        quality_warnings=quality_warnings,
    )


@app.post("/check-image")
def check_image(
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Check a photo before a scan is set up: the asset category can only be chosen
    once the photo passes. Nothing is stored; a rejected photo is logged like a
    rejected scan."""
    screened = _screen_image(_read_upload(file), user)
    return {"ok": True, "quality_warnings": screened.quality_warnings}


@app.post("/analyze-asset")
@app.post("/analyze-corrosion")
def analyze_corrosion(
    file: UploadFile = File(...),
    element_type: str = Form(""),
    environment: str = Form(""),
    asset_id: str = Form(""),
    title: str = Form(""),
    submitted_user_id: Optional[str] = Form(default=None),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    contents = _read_upload(file)
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
    # The environment sets the baseline corrosion rate and the element type sets the
    # checks in the answer, so both must be chosen explicitly: there is no default,
    # and anything outside the defined lists is refused.
    # A scan of an asset takes the element type from the asset and the environment
    # from its site, so they are entered once and cannot drift between inspections.
    asset_reference = None
    asset_id = asset_id.strip()
    if asset_id:
        try:
            UUID(asset_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="The asset could not be identified.") from exc
        asset_row, site_row = inventory.find_asset(supabase, asset_id)
        element_type = asset_row.get("element_type") or ""
        environment = site_row.get("environment") or ""
        asset_reference = inventory.asset_reference(asset_row, site_row.get("name"))
    element_type = _checked_element_type(element_type)
    environment = _checked_environment(environment)

    # The photo checks run again here, so a skipped pre-check never lets a
    # non-metal photo through.
    screened = _screen_image(contents, user)
    file_extension, content_type = screened.image_format
    lighting = screened.lighting
    sharpness = screened.sharpness
    segmentation = screened.segmentation
    quality_warnings = screened.quality_warnings

    # Rust coverage is measured against the detected metal surface, not the whole photo
    # (see RUST_MEASUREMENT for how rust pixels inside the surface are counted).
    rust_percentage = segmentation.rust_percentage
    flat_boxes = segmentation.rust_boxes
    distribution = classify_distribution(
        segmentation.measured_rust_mask, segmentation.surface_mask
    )
    report = prediction_engine.analyze_scan(
        rust_percentage, environment, distribution["type"], distribution["coverage_ratio"]
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
        "element_type": element_type,
        "environment": environment,
        # Recorded so that a trend is only fitted across scans measured the same way.
        "rust_method": RUST_MEASUREMENT,
        "inspector_name": user.get("username") or user.get("email"),
    }
    if asset_id:
        supabase_payload["asset_id"] = asset_id
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
        element_type=element_type,
        environment=environment,
        asset=asset_reference,
        inspector_name=supabase_payload["inspector_name"],
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
    scans = list(response.data or [])
    _refresh_image_urls(scans)
    _attach_assets(scans)
    return [_history_scan_response(scan) for scan in scans]


@app.patch("/history/{scan_id}")
def update_history_scan(
    scan_id: UUID,
    changes: ScanUpdate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if changes.title is not None:
        title = changes.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="A scan title is required.")
        updates["title"] = title
    if changes.element_type is not None:
        updates["element_type"] = _checked_element_type(changes.element_type)
    if changes.environment is not None:
        updates["environment"] = _checked_environment(changes.environment)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    scan = _editable_scan(scan_id, user)
    if scan.get("asset_id") and ("element_type" in updates or "environment" in updates):
        raise HTTPException(
            status_code=409,
            detail="This scan belongs to an asset. Its element type comes from the asset "
            "and its environment from the site; change them there.",
        )

    if "environment" in updates:
        # The environment changes the corrosion rate, so the stored prediction is redone.
        coverage = scan.get("spread_coverage")
        report = prediction_engine.analyze_scan(
            float(scan["rust_percentage"]),
            updates["environment"],
            scan.get("distribution_type"),
            float(coverage) if coverage is not None else None,
        )
        updates["days_to_critical"] = report["days_to_critical"]

    def _save(fields: dict[str, Any]) -> Any:
        return (
            supabase.table("scans")
            .update(fields)
            .eq("id", str(scan_id))
            .execute()
        )

    try:
        updated = _save(updates)
    except Exception as exc:
        message = str(exc)
        if any(column in updates and column in message for column in ("element_type", "environment")):
            raise HTTPException(
                status_code=409,
                detail="The element type and environment cannot be saved yet. Run "
                "backend/migrations/006_element_and_environment.sql in Supabase.",
            ) from exc
        if "days_to_critical" in updates and "days_to_critical" in message:
            # Migration 002 has not been run: save without the stored prediction.
            fields = {key: value for key, value in updates.items() if key != "days_to_critical"}
            try:
                updated = _save(fields)
            except Exception as retry_exc:
                logger.exception("Scan update failed")
                raise HTTPException(
                    status_code=502, detail="The scan could not be updated."
                ) from retry_exc
        else:
            logger.exception("Scan update failed")
            raise HTTPException(status_code=502, detail="The scan could not be updated.") from exc

    updated_scan = {**scan, **(updated.data[0] if updated.data else {}), **updates}
    _refresh_image_urls([updated_scan])
    _attach_assets([updated_scan])
    return _history_scan_response(updated_scan)


@app.get("/scan-options")
def scan_options(_user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """The element types and exposure environments, with rates and evidence, for the pickers."""
    return scan_options_payload()


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
    scan = _editable_scan(scan_id, user)

    try:
        supabase.table("scans").delete().eq("id", str(scan_id)).execute()
    except Exception as exc:
        logger.exception("Scan history deletion failed")
        raise HTTPException(
            status_code=502,
            detail="The scan history could not be deleted.",
        ) from exc

    # Remove the photo too, so a deleted scan leaves nothing behind in storage. Only
    # files inside the owner's own folder are removed; a failure here does not undo the
    # deletion of the record.
    storage_path = _storage_path(scan.get("image_url"))
    if storage_path and storage_path.startswith(f"scans/{scan.get('user_id')}/"):
        try:
            supabase.storage.from_(SUPABASE_STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("The image of deleted scan %s could not be removed.", scan_id)

    return {"status": "deleted", "scan_id": str(scan_id)}


@app.post("/predict-maintenance")
def predict_maintenance(
    request: MaintenanceRequest,
    _user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    return prediction_engine.analyze_scan(
        request.rust_percentage, _checked_environment(request.environment)
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
    if updates.get("role") not in (None, "user", "engineer", "admin"):
        raise HTTPException(status_code=400, detail="Role must be user (inspector), engineer or admin.")
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

    # The profiles table has no status column, so every account counts as active.
    accounts = supabase.table("profiles").select("id", count="exact").execute()
    metrics = {
        "total_accounts": int(accounts.count or 0),
        "active_accounts": int(accounts.count or 0),
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
    by_environment: dict[str, int] = {}
    by_element: dict[str, int] = {}
    for scan in scans:
        created = _parse_timestamp(scan.get("created_at"))
        if created is not None:
            day = created.astimezone(local).date().isoformat()
            if day in per_day:
                per_day[day] += 1
        coverage = scan.get("spread_coverage")
        element_type, environment, _legacy_category, rate_key = _scan_profile(scan)
        report = prediction_engine.analyze_scan(
            float(scan["rust_percentage"]),
            rate_key,
            scan.get("distribution_type"),
            float(coverage) if coverage is not None else None,
        )
        for counts, key in (
            (by_grade, str(report["astm_grade"])),
            (by_priority, report["priority_tier"]),
            (by_distribution, scan.get("distribution_type") or "none"),
            (by_lighting, scan.get("lighting_status") or "unknown"),
            # Scans saved before environments and element types existed are grouped.
            (by_environment, environment or "not_recorded"),
            (by_element, element_type or "not_recorded"),
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
        "by_environment": by_environment,
        "by_element": by_element,
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


REVIEW_MIGRATION_HINT = "Run backend/migrations/008_review_and_roles.sql in Supabase."


class ScanReview(BaseModel):
    """An engineer's verdict on a scan: confirm the AI's reading, or correct it."""

    action: str = Field(pattern="^(confirm|correct)$")
    rust_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    distribution_type: Optional[str] = Field(default=None, pattern="^(S|G|P|H)$")
    note: Optional[str] = Field(default=None, max_length=500)


def _require_engineer(user: dict[str, Any]) -> None:
    if not inventory.is_manager(user):
        raise HTTPException(
            status_code=403, detail="Only an engineer or an admin can review a scan."
        )


def _save_review(scan_id: UUID, scan: dict[str, Any], fields: dict[str, Any]) -> dict[str, Any]:
    try:
        updated = supabase.table("scans").update(fields).eq("id", str(scan_id)).execute()
    except Exception as exc:
        if "review" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="Reviews cannot be saved yet. " + REVIEW_MIGRATION_HINT,
            ) from exc
        logger.exception("Scan review failed")
        raise HTTPException(status_code=502, detail="The review could not be saved.") from exc
    merged = {**scan, **(updated.data[0] if updated.data else {}), **fields}
    _refresh_image_urls([merged])
    _attach_assets([merged])
    return _history_scan_response(merged)


@app.post("/history/{scan_id}/review")
def review_scan(
    scan_id: UUID,
    review: ScanReview,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """The AI proposes, the engineer decides. A correction replaces the AI's rust % (and
    distribution) wherever the result is shown or counted; the AI's values are kept."""
    _require_engineer(user)
    scan = _stored_scan(scan_id)
    correcting = review.action == "correct"
    note = (review.note or "").strip() or None
    if correcting and review.rust_percentage is None:
        raise HTTPException(status_code=400, detail="Enter the corrected rust percentage.")
    if correcting and not note:
        raise HTTPException(
            status_code=400, detail="Add a short note saying why the reading was corrected."
        )
    fields = {
        "review_status": "corrected" if correcting else "confirmed",
        "reviewed_rust_percentage": round(review.rust_percentage, 2) if correcting else None,
        "reviewed_distribution": review.distribution_type if correcting else None,
        "reviewed_by": user["id"],
        "reviewed_by_name": user.get("username") or user.get("email"),
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "review_note": note,
    }
    return _save_review(scan_id, scan, fields)


@app.delete("/history/{scan_id}/review")
def clear_scan_review(
    scan_id: UUID,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Withdraw a review; the scan goes back to the AI's values and counts as unreviewed."""
    _require_engineer(user)
    scan = _stored_scan(scan_id)
    fields = {
        "review_status": None,
        "reviewed_rust_percentage": None,
        "reviewed_distribution": None,
        "reviewed_by": None,
        "reviewed_by_name": None,
        "reviewed_at": None,
        "review_note": None,
    }
    return _save_review(scan_id, scan, fields)


@app.get("/review-agreement")
def review_agreement(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """How often the AI's ASTM grade matched the engineer's, over every reviewed scan.

    A confirmed scan counts as the same grade. This is the system's own running record
    of expert agreement, separate from the test-set figures in the paper.
    """
    _require_engineer(user)
    try:
        rows = (
            supabase.table("scans")
            .select("rust_percentage,reviewed_rust_percentage,review_status")
            .in_("review_status", ["confirmed", "corrected"])
            .limit(5000)
            .execute()
        ).data or []
    except Exception:
        return {"available": False, "reviewed": 0, "exact": 0, "within_one": 0, "pairs": []}
    pairs: dict[tuple[int, int], int] = {}
    exact = within_one = 0
    for row in rows:
        ai_grade = prediction_engine.astm_grade(float(row["rust_percentage"]))[0]
        engineer_grade = prediction_engine.astm_grade(inventory.effective_rust(row))[0]
        pairs[(ai_grade, engineer_grade)] = pairs.get((ai_grade, engineer_grade), 0) + 1
        exact += ai_grade == engineer_grade
        within_one += abs(ai_grade - engineer_grade) <= 1
    return {
        "available": True,
        "reviewed": len(rows),
        "confirmed": sum(1 for row in rows if row.get("review_status") == "confirmed"),
        "corrected": sum(1 for row in rows if row.get("review_status") == "corrected"),
        "exact": exact,
        "within_one": within_one,
        "pairs": [
            {"ai_grade": ai, "engineer_grade": engineer, "count": count}
            for (ai, engineer), count in sorted(pairs.items(), reverse=True)
        ],
    }


inventory.register(
    app,
    db=lambda: supabase,
    current_user=current_user,
    history_response=_history_scan_response,
    refresh_image_urls=_refresh_image_urls,
)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)