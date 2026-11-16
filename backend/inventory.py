"""Inventory: sites, the steel assets on them, each asset's condition, and the register.

A SITE is a place with one exposure environment. An ASSET is one steel element on a
site. A scan may belong to an asset; its element type then comes from the asset and its
environment from the site, so they are entered once and not on every scan.

WHO SEES WHAT (one deployment serves one organisation)
- Everyone who is logged in sees every site and asset, and may add sites and assets and
  scan them. An inspector on site must be able to scan an element an engineer set up.
- Editing or deleting a site or an asset is for engineers and admins, or for the person
  who created it.

AN ASSET'S CONDITION is its latest inspection plus its trend (asset_trend.py):
- the rust %, ASTM rating and action level come from the latest inspection, using the
  engineer's reviewed values when a review exists;
- the rate is measured from the asset's inspections when there are enough of them, and
  is the assumed environment rate otherwise;
- "act within" is the time until the rust crosses into the next action level at that
  rate, counted from the latest inspection.

The routes are added to the app by register(), which main.py calls with the pieces they
need.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from asset_profile import CRITICAL_RUST_PERCENTAGE, ELEMENT_NAMES, ENVIRONMENT_CODES
from asset_trend import ASSUMED, MEASURED, NO_GROWTH, fit_trend
from decision_support import SPOT_REPAIR_MAX, STRATEGIES, TOUCH_UP_MAX

logger = logging.getLogger(__name__)

MIGRATION_HINT = "Run backend/migrations/007_sites_and_assets.sql in Supabase."
MANAGER_ROLES = ("engineer", "admin")


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    location: Optional[str] = Field(default=None, max_length=200)
    environment: str


class SiteUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    location: Optional[str] = Field(default=None, max_length=200)
    environment: Optional[str] = None


class AssetCreate(BaseModel):
    tag: str = Field(min_length=1, max_length=40)
    name: Optional[str] = Field(default=None, max_length=120)
    element_type: str
    surface_area_m2: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    coating_system: Optional[str] = Field(default=None, max_length=200)
    last_coated_on: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class AssetUpdate(BaseModel):
    tag: Optional[str] = Field(default=None, min_length=1, max_length=40)
    name: Optional[str] = Field(default=None, max_length=120)
    element_type: Optional[str] = None
    surface_area_m2: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    coating_system: Optional[str] = Field(default=None, max_length=200)
    last_coated_on: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


def _text(value: Optional[str]) -> Optional[str]:
    """Trimmed text, or None when nothing is left."""
    value = (value or "").strip()
    return value or None


def _required_text(value: str, what: str) -> str:
    cleaned = _text(value)
    if cleaned is None:
        raise _bad_request(f"{what} is required.")
    return cleaned


def _environment(value: str) -> str:
    value = value.strip()
    if value not in ENVIRONMENT_CODES:
        raise _bad_request("Choose the exposure environment: " + ", ".join(ENVIRONMENT_CODES) + ".")
    return value


def _element_type(value: str) -> str:
    value = value.strip()
    if value not in ELEMENT_NAMES:
        raise _bad_request("Choose the type of steel element: " + ", ".join(ELEMENT_NAMES) + ".")
    return value


def is_manager(user: dict[str, Any]) -> bool:
    return user.get("role") in MANAGER_ROLES


def _require_manage(user: dict[str, Any], row: dict[str, Any], what: str) -> None:
    """Engineers and admins may change any site or asset; others only their own."""
    if is_manager(user) or row.get("created_by") == user["id"]:
        return
    raise HTTPException(
        status_code=403,
        detail=f"Only an engineer, an admin or the person who created this {what} can change it.",
    )


def guarded(action: Callable[[], Any]) -> Any:
    """Run a database call on the inventory tables and turn failures into clear errors.

    A missing table or column means migration 007 has not been run; a duplicate key means
    the tag is already used on that site.
    """
    try:
        return action()
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        if "duplicate key" in message or "23505" in message:
            raise HTTPException(
                status_code=409, detail="An asset with this tag already exists on this site."
            ) from exc
        missing = "does not exist" in message or "schema cache" in message or "PGRST205" in message
        if missing and any(name in message for name in ("sites", "assets", "asset_id")):
            raise HTTPException(
                status_code=409,
                detail="The inventory tables are not set up yet. " + MIGRATION_HINT,
            ) from exc
        logger.exception("Inventory request failed")
        raise HTTPException(
            status_code=502, detail="The inventory request could not be completed."
        ) from exc


def find_site(db: Any, site_id: UUID | str) -> dict[str, Any]:
    site = guarded(
        lambda: db.table("sites").select("*").eq("id", str(site_id)).maybe_single().execute()
    )
    data = getattr(site, "data", None)
    if not data:
        raise HTTPException(status_code=404, detail="Site not found.")
    return data


def find_asset(db: Any, asset_id: UUID | str) -> tuple[dict[str, Any], dict[str, Any]]:
    """(asset, its site); 404 when either is missing."""
    asset = guarded(
        lambda: db.table("assets").select("*").eq("id", str(asset_id)).maybe_single().execute()
    )
    data = getattr(asset, "data", None)
    if not data:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return data, find_site(db, data["site_id"])


def asset_refs(db: Any, asset_ids: Iterable[str]) -> dict[str, dict[str, Any]]:
    """{asset id: the short reference shown on a scan}. Empty if the tables are missing."""
    ids = sorted({str(asset_id) for asset_id in asset_ids if asset_id})
    if not ids:
        return {}
    try:
        assets = db.table("assets").select("id,tag,name,site_id").in_("id", ids).execute().data or []
        site_ids = sorted({asset["site_id"] for asset in assets})
        sites = (
            db.table("sites").select("id,name").in_("id", site_ids).execute().data or []
            if site_ids
            else []
        )
    except Exception:
        logger.warning("Asset references could not be loaded. %s", MIGRATION_HINT)
        return {}
    site_names = {site["id"]: site.get("name") for site in sites}
    return {asset["id"]: asset_reference(asset, site_names.get(asset.get("site_id"))) for asset in assets}


def asset_reference(asset: dict[str, Any], site_name: Optional[str]) -> dict[str, Any]:
    return {
        "id": asset["id"],
        "tag": asset.get("tag"),
        "name": asset.get("name"),
        "site_id": asset.get("site_id"),
        "site_name": site_name,
    }


def site_payload(site: dict[str, Any], asset_count: int = 0) -> dict[str, Any]:
    return {
        "id": site["id"],
        "name": site.get("name"),
        "location": site.get("location"),
        "environment": site.get("environment"),
        "is_demo": bool(site.get("is_demo")),
        "created_by": site.get("created_by"),
        "created_at": site.get("created_at"),
        "asset_count": asset_count,
    }


def _parse_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str):
        return None
    text = value.replace("Z", "+00:00")
    # Supabase sends a varying number of fractional digits; Python wants 0, 3 or 6.
    if "." in text:
        head, _, tail = text.partition(".")
        digits = "".join(ch for ch in tail if ch.isdigit())
        rest = tail[len(digits):]
        text = f"{head}.{(digits + '000000')[:6]}{rest}"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def effective_rust(scan: dict[str, Any]) -> float:
    """The rust % that counts for a scan: the engineer's reviewed value when there is one."""
    reviewed = scan.get("reviewed_rust_percentage")
    return float(reviewed if reviewed is not None else scan["rust_percentage"])


def _next_threshold(rust: float) -> Optional[float]:
    """The rust % at which the action level next changes; None once critical."""
    if rust < TOUCH_UP_MAX:
        return TOUCH_UP_MAX
    if rust < SPOT_REPAIR_MAX:
        return SPOT_REPAIR_MAX
    if rust < CRITICAL_RUST_PERCENTAGE:
        return CRITICAL_RUST_PERCENTAGE
    return None


def asset_condition(
    asset: dict[str, Any],
    scans: list[dict[str, Any]],
    history_response: Callable[[dict[str, Any]], dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """The asset's current condition and projection; None if it has never been inspected.

    `scans` are the asset's stored scan rows, oldest first.
    """
    if not scans:
        return None
    latest = scans[-1]
    response = history_response(latest)
    decision = response.get("decision_support") or {}
    level = int(decision.get("level") or 1)
    rust = float(response["rust_percentage"])
    latest_time = _parse_time(latest.get("created_at")) or datetime.now(timezone.utc)

    # Which inspections belong to the trend: those made with the same measurement method
    # as the latest one (a change of method shifts rust % and would fake a trend), and
    # only those after the asset was last recoated (recoating restarts the clock).
    method = latest.get("rust_method")
    recoated = asset.get("last_coated_on")
    recoated_at = _parse_time(f"{recoated}T00:00:00+00:00") if recoated else None
    points = []
    for scan in scans:
        moment = _parse_time(scan.get("created_at"))
        if moment is None or scan.get("rust_method") != method:
            continue
        if recoated_at and moment < recoated_at:
            continue
        points.append((moment, effective_rust(scan)))

    assumed_rate = float(response.get("regression_slope") or 0.0)
    trend = fit_trend(points, assumed_rate)
    rate = float(trend["rate_used"])

    threshold = _next_threshold(rust)
    days_to_next: Optional[int] = None
    days_to_critical: Optional[int] = 0 if rust >= CRITICAL_RUST_PERCENTAGE else None
    if rate > 0:
        if threshold is not None:
            days_to_next = int(max(0.0, (threshold - rust) / rate))
        if rust < CRITICAL_RUST_PERCENTAGE:
            days_to_critical = int(max(0.0, (CRITICAL_RUST_PERCENTAGE - rust) / rate))

    # Level 1 needs no work and level 6 is "now", so only levels 2 to 5 carry a deadline.
    act_within_days = days_to_next if 2 <= level <= 5 else None
    due_date = (
        (latest_time + timedelta(days=act_within_days)).date().isoformat()
        if act_within_days is not None
        else None
    )

    area = asset.get("surface_area_m2")
    area = float(area) if area is not None else None
    rusted_area = round(area * rust / 100, 2) if area is not None else None
    # Levels 4 to 6 treat the whole surface; levels 2 and 3 treat the rusted areas only.
    # No allowance for feathering is added: that follows the project specification.
    if area is None or level == 1:
        work_area = None if area is None else 0.0
    elif level >= 4:
        work_area = round(area, 2)
    else:
        work_area = rusted_area

    strategy, surface_preparation = STRATEGIES[level]
    review = response.get("review")
    return {
        "scan_id": response.get("scan_id"),
        "date": response.get("created_at"),
        "rust_percentage": rust,
        "astm_grade": response.get("astm_grade"),
        "astm_rating": response.get("astm_rating"),
        "distribution_type": response.get("distribution_type"),
        "priority_level": response.get("priority_level"),
        "action_level": level,
        "strategy": strategy,
        "surface_preparation": surface_preparation,
        "headline": decision.get("headline"),
        "rate_source": trend["source"],
        "rate_per_day": rate,
        "trend": trend,
        "next_threshold": threshold,
        "days_to_next": days_to_next,
        "act_within_days": act_within_days,
        "due_date": due_date,
        "days_to_critical": days_to_critical,
        "rusted_area_m2": rusted_area,
        "work_area_m2": work_area,
        "review_status": review.get("status") if review else None,
        "confidence": decision.get("confidence"),
    }


def asset_payload(
    asset: dict[str, Any],
    *,
    scan_count: int = 0,
    condition: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    area = asset.get("surface_area_m2")
    return {
        "id": asset["id"],
        "site_id": asset.get("site_id"),
        "tag": asset.get("tag"),
        "name": asset.get("name"),
        "element_type": asset.get("element_type"),
        "surface_area_m2": float(area) if area is not None else None,
        "coating_system": asset.get("coating_system"),
        "last_coated_on": asset.get("last_coated_on"),
        "notes": asset.get("notes"),
        "created_by": asset.get("created_by"),
        "created_at": asset.get("created_at"),
        "scan_count": scan_count,
        "condition": condition,
    }


def urgency_key(asset: dict[str, Any]) -> tuple:
    """Sort key: most urgent first. Critical, then by action level, then by deadline."""
    condition = asset.get("condition")
    if not condition:
        return (1, 0, 0, asset.get("tag") or "")
    days = condition.get("days_to_next")
    return (
        0,
        -int(condition.get("action_level") or 1),
        days if days is not None else 10**9,
        asset.get("tag") or "",
    )


def register_totals(assets: list[dict[str, Any]]) -> dict[str, Any]:
    """Counts and areas across a list of asset payloads, for the register and its charts."""
    by_level = {str(level): 0 for level in range(1, 7)}
    by_grade = {str(grade): 0 for grade in range(10, -1, -1)}
    area_by_strategy: dict[str, float] = {}
    not_inspected = 0
    overdue = 0
    today = datetime.now(timezone.utc).date().isoformat()
    for asset in assets:
        condition = asset.get("condition")
        if not condition:
            not_inspected += 1
            continue
        level = int(condition["action_level"])
        by_level[str(level)] += 1
        grade = condition.get("astm_grade")
        if grade is not None:
            by_grade[str(grade)] = by_grade.get(str(grade), 0) + 1
        work = condition.get("work_area_m2")
        if work and level >= 2:
            area_by_strategy[condition["strategy"]] = round(
                area_by_strategy.get(condition["strategy"], 0.0) + work, 2
            )
        due = condition.get("due_date")
        if level == 6 or (due and due < today):
            overdue += 1
    inspected = len(assets) - not_inspected
    return {
        "assets": len(assets),
        "inspected": inspected,
        "not_inspected": not_inspected,
        "needing_action": sum(by_level[str(level)] for level in range(2, 7)),
        "critical": by_level["6"],
        "overdue": overdue,
        "by_level": by_level,
        "by_grade": by_grade,
        "area_by_strategy": area_by_strategy,
        "work_area_m2": round(sum(area_by_strategy.values()), 2),
    }


def register(
    app: FastAPI,
    *,
    db: Callable[[], Any],
    current_user: Callable[..., dict[str, Any]],
    history_response: Callable[[dict[str, Any]], dict[str, Any]],
    refresh_image_urls: Callable[[list[dict[str, Any]]], None],
) -> None:
    """Add the inventory routes to the app.

    `db` returns the Supabase client each time it is called, so tests can swap it.
    `history_response` turns a stored scan row into the response the app shows.
    """

    def _scans_by_asset(asset_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """{asset id: its scans, oldest first}."""
        grouped: dict[str, list[dict[str, Any]]] = {asset_id: [] for asset_id in asset_ids}
        if not asset_ids:
            return grouped
        rows = (
            guarded(
                lambda: db()
                .table("scans")
                .select("*")
                .in_("asset_id", asset_ids)
                .order("created_at")
                .execute()
            ).data
            or []
        )
        for row in rows:
            grouped.setdefault(row.get("asset_id"), []).append(row)
        return grouped

    def _with_conditions(
        assets: list[dict[str, Any]], scans: Optional[dict[str, list[dict[str, Any]]]] = None
    ) -> list[dict[str, Any]]:
        scans = scans if scans is not None else _scans_by_asset([asset["id"] for asset in assets])
        payloads = []
        for asset in assets:
            history = scans.get(asset["id"], [])
            payloads.append(
                asset_payload(
                    asset,
                    scan_count=len(history),
                    condition=asset_condition(asset, history, history_response),
                )
            )
        return payloads

    @app.get("/sites")
    def list_sites(_user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
        sites = guarded(lambda: db().table("sites").select("*").order("name").execute()).data or []
        counts: dict[str, int] = {}
        if sites:
            rows = (
                guarded(
                    lambda: db()
                    .table("assets")
                    .select("id,site_id")
                    .in_("site_id", [site["id"] for site in sites])
                    .execute()
                ).data
                or []
            )
            for row in rows:
                counts[row["site_id"]] = counts.get(row["site_id"], 0) + 1
        return [site_payload(site, counts.get(site["id"], 0)) for site in sites]

    @app.post("/sites")
    def create_site(
        site: SiteCreate, user: dict[str, Any] = Depends(current_user)
    ) -> dict[str, Any]:
        row = {
            "name": _required_text(site.name, "A site name"),
            "location": _text(site.location),
            "environment": _environment(site.environment),
            "created_by": user["id"],
        }
        created = guarded(lambda: db().table("sites").insert(row).execute()).data
        if not created:
            raise HTTPException(status_code=502, detail="The site could not be saved.")
        return site_payload(created[0])

    @app.get("/sites/{site_id}")
    def get_site(site_id: UUID, _user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        """The site with its priority register: every asset, most urgent first."""
        site = find_site(db(), site_id)
        assets = (
            guarded(
                lambda: db()
                .table("assets")
                .select("*")
                .eq("site_id", str(site_id))
                .order("tag")
                .execute()
            ).data
            or []
        )
        payloads = sorted(_with_conditions(assets), key=urgency_key)
        return {
            "site": site_payload(site, len(assets)),
            "assets": payloads,
            "totals": register_totals(payloads),
        }

    @app.patch("/sites/{site_id}")
    def update_site(
        site_id: UUID, changes: SiteUpdate, user: dict[str, Any] = Depends(current_user)
    ) -> dict[str, Any]:
        site = find_site(db(), site_id)
        _require_manage(user, site, "site")
        sent = changes.model_fields_set
        updates: dict[str, Any] = {}
        if "name" in sent and changes.name is not None:
            updates["name"] = _required_text(changes.name, "A site name")
        if "location" in sent:
            updates["location"] = _text(changes.location)
        if "environment" in sent and changes.environment is not None:
            updates["environment"] = _environment(changes.environment)
        if not updates:
            raise _bad_request("Nothing to update.")
        updated = guarded(
            lambda: db().table("sites").update(updates).eq("id", str(site_id)).execute()
        ).data
        return site_payload({**site, **(updated[0] if updated else {}), **updates})

    @app.delete("/sites/{site_id}")
    def delete_site(site_id: UUID, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        site = find_site(db(), site_id)
        _require_manage(user, site, "site")
        # The database removes the site's assets with it; their scans are kept and
        # become scans with no asset.
        guarded(lambda: db().table("sites").delete().eq("id", str(site_id)).execute())
        return {"status": "deleted", "site_id": str(site_id)}

    @app.post("/sites/{site_id}/assets")
    def create_asset(
        site_id: UUID, asset: AssetCreate, user: dict[str, Any] = Depends(current_user)
    ) -> dict[str, Any]:
        find_site(db(), site_id)
        row = {
            "site_id": str(site_id),
            "tag": _required_text(asset.tag, "An asset tag"),
            "name": _text(asset.name),
            "element_type": _element_type(asset.element_type),
            "surface_area_m2": asset.surface_area_m2,
            "coating_system": _text(asset.coating_system),
            "last_coated_on": asset.last_coated_on.isoformat() if asset.last_coated_on else None,
            "notes": _text(asset.notes),
            "created_by": user["id"],
        }
        created = guarded(lambda: db().table("assets").insert(row).execute()).data
        if not created:
            raise HTTPException(status_code=502, detail="The asset could not be saved.")
        return asset_payload(created[0])

    @app.get("/assets/{asset_id}")
    def get_asset(asset_id: UUID, _user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        """The asset with its condition, its trend and every inspection, newest first."""
        asset, site = find_asset(db(), asset_id)
        history = _scans_by_asset([asset["id"]]).get(asset["id"], [])
        reference = asset_reference(asset, site.get("name"))
        for scan in history:
            scan["_asset"] = reference
        condition = asset_condition(asset, history, history_response)
        refresh_image_urls(history)
        responses = [history_response(scan) for scan in history]
        return {
            "asset": asset_payload(asset, scan_count=len(responses), condition=condition),
            "site": site_payload(site),
            "scans": list(reversed(responses)),
        }

    @app.patch("/assets/{asset_id}")
    def update_asset(
        asset_id: UUID, changes: AssetUpdate, user: dict[str, Any] = Depends(current_user)
    ) -> dict[str, Any]:
        asset, _site = find_asset(db(), asset_id)
        _require_manage(user, asset, "asset")
        sent = changes.model_fields_set
        updates: dict[str, Any] = {}
        if "tag" in sent and changes.tag is not None:
            updates["tag"] = _required_text(changes.tag, "An asset tag")
        if "element_type" in sent and changes.element_type is not None:
            updates["element_type"] = _element_type(changes.element_type)
        # These may be cleared by sending null.
        if "name" in sent:
            updates["name"] = _text(changes.name)
        if "surface_area_m2" in sent:
            updates["surface_area_m2"] = changes.surface_area_m2
        if "coating_system" in sent:
            updates["coating_system"] = _text(changes.coating_system)
        if "last_coated_on" in sent:
            updates["last_coated_on"] = (
                changes.last_coated_on.isoformat() if changes.last_coated_on else None
            )
        if "notes" in sent:
            updates["notes"] = _text(changes.notes)
        if not updates:
            raise _bad_request("Nothing to update.")
        updated = guarded(
            lambda: db().table("assets").update(updates).eq("id", str(asset_id)).execute()
        ).data
        return asset_payload({**asset, **(updated[0] if updated else {}), **updates})

    @app.delete("/assets/{asset_id}")
    def delete_asset(asset_id: UUID, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        asset, _site = find_asset(db(), asset_id)
        _require_manage(user, asset, "asset")
        # The asset's scans are kept; the database clears their link to it.
        guarded(lambda: db().table("assets").delete().eq("id", str(asset_id)).execute())
        return {"status": "deleted", "asset_id": str(asset_id)}

    @app.get("/dashboard")
    def dashboard(_user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        """Everything the dashboard charts need, across all sites, in one call."""
        sites = guarded(lambda: db().table("sites").select("*").order("name").execute()).data or []
        assets = guarded(lambda: db().table("assets").select("*").order("tag").execute()).data or []
        scans = _scans_by_asset([asset["id"] for asset in assets])
        payloads = _with_conditions(assets, scans)
        site_names = {site["id"]: site.get("name") for site in sites}

        by_site = []
        for site in sites:
            own = [asset for asset in payloads if asset["site_id"] == site["id"]]
            totals = register_totals(own)
            by_site.append(
                {
                    "site_id": site["id"],
                    "site": site.get("name"),
                    "environment": site.get("environment"),
                    "is_demo": bool(site.get("is_demo")),
                    "assets": totals["assets"],
                    "not_inspected": totals["not_inspected"],
                    "by_level": totals["by_level"],
                    "work_area_m2": totals["work_area_m2"],
                }
            )

        by_element: dict[str, dict[str, int]] = {}
        for asset in payloads:
            condition = asset.get("condition")
            if not condition:
                continue
            counts = by_element.setdefault(
                asset.get("element_type") or "Not recorded", {str(level): 0 for level in range(1, 7)}
            )
            counts[str(condition["action_level"])] += 1

        # Deadlines by month for the next twelve months, plus those already past.
        today = datetime.now(timezone.utc).date()
        months = []
        cursor = today.replace(day=1)
        for _ in range(12):
            months.append(cursor.strftime("%Y-%m"))
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        due_by_month = {month: 0 for month in months}
        overdue = later = 0
        for asset in payloads:
            condition = asset.get("condition") or {}
            due = condition.get("due_date")
            if condition.get("action_level") == 6:
                overdue += 1
            elif due:
                if due < today.isoformat():
                    overdue += 1
                elif due[:7] in due_by_month:
                    due_by_month[due[:7]] += 1
                else:
                    later += 1

        urgent = [asset for asset in sorted(payloads, key=urgency_key) if asset.get("condition")]
        most_urgent = [
            {**asset, "site_name": site_names.get(asset["site_id"])}
            for asset in urgent
            if asset["condition"]["action_level"] >= 2
        ][:10]

        # Inspections per month and the average rust % found in them, last twelve months.
        past = []
        cursor = today.replace(day=1)
        for _ in range(12):
            past.append(cursor.strftime("%Y-%m"))
            cursor = (cursor - timedelta(days=1)).replace(day=1)
        past.reverse()
        monthly = {month: {"count": 0, "rust": 0.0} for month in past}
        reviewed = {"confirmed": 0, "corrected": 0, "unreviewed": 0}
        measured_assets = 0
        for asset in payloads:
            condition = asset.get("condition")
            if condition and condition["rate_source"] == MEASURED:
                measured_assets += 1
        for history in scans.values():
            for scan in history:
                status = scan.get("review_status")
                reviewed[status if status in ("confirmed", "corrected") else "unreviewed"] += 1
                moment = _parse_time(scan.get("created_at"))
                key = moment.strftime("%Y-%m") if moment else None
                if key in monthly:
                    monthly[key]["count"] += 1
                    monthly[key]["rust"] += effective_rust(scan)

        totals = register_totals(payloads)
        return {
            "totals": {
                **totals,
                "sites": len(sites),
                "inspections": sum(len(history) for history in scans.values()),
                "measured_rate_assets": measured_assets,
            },
            "by_site": by_site,
            "by_element": [
                {"element_type": name, "by_level": counts} for name, counts in sorted(by_element.items())
            ],
            "deadlines": {
                "overdue": overdue,
                "months": [{"month": month, "count": due_by_month[month]} for month in months],
                "later": later,
            },
            "most_urgent": most_urgent,
            "inspections_by_month": [
                {
                    "month": month,
                    "count": monthly[month]["count"],
                    "average_rust": round(monthly[month]["rust"] / monthly[month]["count"], 2)
                    if monthly[month]["count"]
                    else None,
                }
                for month in past
            ],
            "reviews": reviewed,
            "rate_sources": {
                MEASURED: measured_assets,
                NO_GROWTH: sum(
                    1 for a in payloads if a.get("condition") and a["condition"]["rate_source"] == NO_GROWTH
                ),
                ASSUMED: sum(
                    1 for a in payloads if a.get("condition") and a["condition"]["rate_source"] == ASSUMED
                ),
            },
        }
