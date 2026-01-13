from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date

from app.database import get_db
from app.services import weather_service
from app.utils.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/trails", tags=["weather"])


@router.get("/{trail_id}/weather")
async def get_trail_weather(
    trail_id: str,
    date_param: date = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    weather_data = await weather_service.get_weather_for_trail(db, trail_id, date_param)

    if not weather_data["trailhead"] and not weather_data["summit"]:
        raise HTTPException(
            status_code=404,
            detail="No weather forecast available for this trail and date"
        )

    return weather_data
