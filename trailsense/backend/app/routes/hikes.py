from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.models.user import User
from app.models.hike_log import HikeLog
from app.models.trail import Trail
from app.services.auth_service import get_current_user


router = APIRouter(prefix="/api/hikes", tags=["hikes"])


class CreateHikeRequest(BaseModel):
    trail_id: Optional[str] = None
    trail_name: Optional[str] = None
    hike_date: str
    completed: bool
    difficulty_rating: Optional[int] = None
    time_taken_hours: Optional[float] = None
    notes: Optional[str] = None


class UpdateHikeRequest(BaseModel):
    completed: Optional[bool] = None
    difficulty_rating: Optional[int] = None
    time_taken_hours: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
async def list_hikes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all hikes for current user"""
    query = select(HikeLog).where(
        HikeLog.user_id == current_user.id
    ).order_by(HikeLog.hike_date.desc())

    result = await db.execute(query)
    hikes = result.scalars().all()

    return {
        "hikes": [
            {
                "id": str(h.id),
                "trail_id": str(h.trail_id) if h.trail_id else None,
                "trail_name": h.trail_name,
                "hike_date": str(h.hike_date),
                "completed": h.completed,
                "difficulty_rating": h.difficulty_rating,
                "time_taken_hours": float(h.time_taken_hours) if h.time_taken_hours else None,
                "notes": h.notes,
                "created_at": h.created_at
            }
            for h in hikes
        ]
    }


@router.post("")
async def create_hike(
    request: CreateHikeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Log a completed hike"""
    trail_name = request.trail_name

    if request.trail_id:
        query = select(Trail).where(Trail.id == request.trail_id)
        result = await db.execute(query)
        trail = result.scalar_one_or_none()
        if trail:
            trail_name = trail.name

    hike = HikeLog(
        user_id=current_user.id,
        trail_id=request.trail_id,
        trail_name=trail_name,
        hike_date=date.fromisoformat(request.hike_date),
        completed=request.completed,
        difficulty_rating=request.difficulty_rating,
        time_taken_hours=Decimal(str(request.time_taken_hours)) if request.time_taken_hours else None,
        notes=request.notes
    )

    db.add(hike)
    await db.commit()
    await db.refresh(hike)

    return {
        "hike": {
            "id": str(hike.id),
            "trail_id": str(hike.trail_id) if hike.trail_id else None,
            "trail_name": hike.trail_name,
            "hike_date": str(hike.hike_date),
            "completed": hike.completed,
            "difficulty_rating": hike.difficulty_rating,
            "time_taken_hours": float(hike.time_taken_hours) if hike.time_taken_hours else None,
            "notes": hike.notes
        }
    }


@router.put("/{hike_id}")
async def update_hike(
    hike_id: str,
    request: UpdateHikeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a hike log"""
    query = select(HikeLog).where(
        HikeLog.id == hike_id,
        HikeLog.user_id == current_user.id
    )
    result = await db.execute(query)
    hike = result.scalar_one_or_none()

    if not hike:
        raise HTTPException(status_code=404, detail="Hike not found")

    if request.completed is not None:
        hike.completed = request.completed
    if request.difficulty_rating is not None:
        hike.difficulty_rating = request.difficulty_rating
    if request.time_taken_hours is not None:
        hike.time_taken_hours = Decimal(str(request.time_taken_hours))
    if request.notes is not None:
        hike.notes = request.notes

    await db.commit()
    await db.refresh(hike)

    return {
        "id": str(hike.id),
        "trail_id": str(hike.trail_id) if hike.trail_id else None,
        "trail_name": hike.trail_name,
        "hike_date": str(hike.hike_date),
        "completed": hike.completed,
        "difficulty_rating": hike.difficulty_rating,
        "time_taken_hours": float(hike.time_taken_hours) if hike.time_taken_hours else None,
        "notes": hike.notes
    }


@router.delete("/{hike_id}")
async def delete_hike(
    hike_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a hike log"""
    query = select(HikeLog).where(
        HikeLog.id == hike_id,
        HikeLog.user_id == current_user.id
    )
    result = await db.execute(query)
    hike = result.scalar_one_or_none()

    if not hike:
        raise HTTPException(status_code=404, detail="Hike not found")

    await db.delete(hike)
    await db.commit()

    return {"success": True}
