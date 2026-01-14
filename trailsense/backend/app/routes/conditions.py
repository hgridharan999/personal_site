from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import date

from app.database import get_db
from app.models.user import User
from app.models.condition import TrailCondition
from app.services.auth_service import get_current_user


router = APIRouter(prefix="/api/trails", tags=["conditions"])


class CreateConditionRequest(BaseModel):
    report_date: str
    trail_status: Optional[str] = None
    snow_level_ft: Optional[int] = None
    required_gear: list[str] = []
    notes: Optional[str] = None


@router.get("/{trail_id}/conditions")
async def get_trail_conditions(
    trail_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all conditions for a trail"""
    query = select(TrailCondition).where(
        TrailCondition.trail_id == trail_id
    ).order_by(TrailCondition.report_date.desc())

    result = await db.execute(query)
    conditions = result.scalars().all()

    latest = None
    if conditions:
        latest_cond = conditions[0]
        latest = {
            "id": str(latest_cond.id),
            "report_date": str(latest_cond.report_date),
            "trail_status": latest_cond.trail_status,
            "snow_level_ft": latest_cond.snow_level_ft,
            "mud_level": latest_cond.mud_level,
            "required_gear": latest_cond.required_gear or [],
            "overall_sentiment": latest_cond.overall_sentiment
        }

    return {
        "conditions": [
            {
                "id": str(c.id),
                "report_date": str(c.report_date),
                "trail_status": c.trail_status,
                "snow_level_ft": c.snow_level_ft,
                "mud_level": c.mud_level,
                "required_gear": c.required_gear or [],
                "overall_sentiment": c.overall_sentiment,
                "source": c.source
            }
            for c in conditions
        ],
        "latest": latest
    }


@router.post("/{trail_id}/conditions")
async def create_condition(
    trail_id: str,
    request: CreateConditionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Manually add a trail condition report"""
    condition = TrailCondition(
        trail_id=trail_id,
        report_date=date.fromisoformat(request.report_date),
        trail_status=request.trail_status,
        snow_level_ft=request.snow_level_ft,
        required_gear=request.required_gear,
        raw_text=request.notes,
        source="manual",
        confidence=1.0
    )

    db.add(condition)
    await db.commit()
    await db.refresh(condition)

    return {
        "id": str(condition.id),
        "trail_id": str(condition.trail_id),
        "report_date": str(condition.report_date),
        "trail_status": condition.trail_status,
        "snow_level_ft": condition.snow_level_ft,
        "required_gear": condition.required_gear or []
    }
