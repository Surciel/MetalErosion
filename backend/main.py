import os
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

import cv2
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Query
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi import Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from pydantic import BaseModel, Field
from supabase import Client, create_client
from supabase_auth.errors import AuthError
from ultralytics import YOLO

from predictive_engine import ISOPredictiveEngine

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

LOWER_RUST1 = np.array([0, 40, 30])
UPPER_RUST1 = np.array([25, 255, 200])
LOWER_RUST2 = np.array([170, 40, 30])
UPPER_RUST2 = np.array([180, 255, 200])
PADDING = 30
MAX_IMAGE_BYTES = 15 * 1024 * 1024


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
    return _get_user(authorization)


def _profile(user_id: str) -> dict[str, Any]:
    response = (
        supabase.table("profiles")
        .select("id,role,email,username,created_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return response.data or {}


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
    astm_grade: int,
    priority_level: str,
    recommendation: str,
    box_coordinates: list[int],
    user_id: Optional[str] = None,
    signed_url: Optional[str] = None,
    title: Optional[str] = None,
) -> dict[str, Any]:
    response = {
        "status": "success",
        "filename": filename,
        "title": title or filename,
        "image_url": image_url,
        "rust_percentage": rust_percentage,
        "astm_grade": astm_grade,
        "priority_level": priority_level,
        "recommendation": recommendation,
        "box_coordinates": box_coordinates,
        "scan_id": str(scan_id) if scan_id is not None else None,
        "created_at": created_at,
        "user_id": user_id,
    }
    if signed_url is not None:
        response["signed_url"] = signed_url
    return response


def _history_scan_response(scan: dict[str, Any]) -> dict[str, Any]:
    rust_percentage = float(scan["rust_percentage"])
    report = prediction_engine.analyze_scan(rust_percentage, "Hardware")
    image_url = str(scan["image_url"])
    filename = image_url.rsplit("/", 1)[-1].split("?", 1)[0] or "image"
    return _scan_response(
        scan_id=scan["id"],
        created_at=scan.get("created_at"),
        filename=filename,
        image_url=image_url,
        rust_percentage=rust_percentage,
        astm_grade=report["astm_grade"],
        priority_level=report["priority_tier"],
        recommendation=report["remediation_protocol"],
        box_coordinates=scan.get("box_coordinates") or [],
        user_id=scan.get("user_id"),
        title=scan.get("title") or filename,
    )


@app.post("/analyze-asset")
@app.post("/analyze-corrosion")
async def analyze_corrosion(
    file: UploadFile = File(...),
    asset_category: str = Form("Hardware"),
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

    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image.")

    height, width = image.shape[:2]
    total_image_pixels = height * width
    try:
        results = model.predict(source=image, conf=0.20, iou=0.45)
    except Exception as exc:
        logger.exception("Corrosion model inference failed")
        raise HTTPException(
            status_code=503,
            detail="The corrosion model could not analyze this image.",
        ) from exc
    boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)

    rust_mask = np.zeros((height, width), dtype=np.uint8)
    for x1, y1, x2, y2 in boxes:
        pad_x1, pad_y1 = max(0, x1 - PADDING), max(0, y1 - PADDING)
        pad_x2, pad_y2 = min(width, x2 + PADDING), min(height, y2 + PADDING)
        roi = image[pad_y1:pad_y2, pad_x1:pad_x2]
        hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        mask = cv2.bitwise_or(
            cv2.inRange(hsv_roi, LOWER_RUST1, UPPER_RUST1),
            cv2.inRange(hsv_roi, LOWER_RUST2, UPPER_RUST2),
        )
        rust_mask[pad_y1:pad_y2, pad_x1:pad_x2] = cv2.bitwise_or(
            rust_mask[pad_y1:pad_y2, pad_x1:pad_x2], mask
        )

    rust_percentage = round(
        (cv2.countNonZero(rust_mask) / total_image_pixels) * 100, 2
    )
    flat_boxes = boxes.flatten().tolist()
    report = prediction_engine.analyze_scan(rust_percentage, asset_category)
    filename = file.filename or "image.jpg"
    storage_path = f"scans/{user['id']}/{filename}"
    try:
        storage = supabase.storage.from_(SUPABASE_STORAGE_BUCKET)
        storage.upload(
            storage_path,
            contents,
            {"content-type": file.content_type, "upsert": "false"},
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
        "storage_path": storage_path,
        "title": filename,
        "rust_percentage": rust_percentage,
        "box_coordinates": flat_boxes,
    }
    try:
        inserted = supabase.table("scans").insert(supabase_payload).execute()
    except Exception as exc:
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
        astm_grade=report["astm_grade"],
        priority_level=report["priority_tier"],
        recommendation=report["remediation_protocol"],
        box_coordinates=flat_boxes,
        user_id=user["id"],
        signed_url=signed_url,
        title=filename,
    )

@app.get("/history")
def history(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    response = (
        supabase.table("scans")
        .select("id,user_id,image_url,title,rust_percentage,box_coordinates,created_at")
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
        .select("id,user_id,image_url,title,rust_percentage,box_coordinates,created_at")
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

    updated_scan = {**scan, "title": title}
    if updated.data:
        updated_scan.update(updated.data[0])
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
        .select("id,storage_path")
        .eq("id", str(scan_id))
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    scan = existing.data
    if not scan:
        raise HTTPException(status_code=404, detail="Scan history was not found.")

    storage_path = scan.get("storage_path")
    try:
        if storage_path:
            supabase.storage.from_(SUPABASE_STORAGE_BUCKET).remove([storage_path])
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