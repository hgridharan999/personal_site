from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.recommendation_service import get_recommendations


router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


class RecommendationConstraints(BaseModel):
    date: str
    max_distance: float = 30
    max_elevation_gain: int = 8000
    max_drive_time_minutes: int = 120
    terrain_preferences: list[str] = []
    desired_features: list[str] = []
    avoid: list[str] = []
    difficulty: Optional[str] = None


@router.post("")
async def get_trail_recommendations(
    constraints: RecommendationConstraints,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get personalized trail recommendations based on constraints"""

    recommendations = await get_recommendations(
        current_user.profile,
        constraints.model_dump(),
        db
    )

    results = []
    for rec in recommendations:
        trail = rec["trail"]
        results.append({
            "trail": {
                "id": str(trail.id),
                "name": trail.name,
                "region": trail.region,
                "distance_miles": float(trail.distance_miles),
                "elevation_gain_ft": trail.elevation_gain_ft,
                "difficulty": trail.difficulty,
                "terrain_types": trail.terrain_types or [],
                "features": trail.features or [],
                "photos": trail.photos or []
            },
            "confidence_score": rec["confidence_score"],
            "drive_time_minutes": rec["drive_time_minutes"],
            "why_recommended": rec["why_recommended"],
            "concerns": rec["concerns"],
            "weather_summary": rec["weather"]
        })

    message = None
    if len(results) < 5:
        message = f"Found {len(results)} trail{'s' if len(results) != 1 else ''} matching your criteria. Try relaxing distance or drive time constraints for more options."

    return {
        "recommendations": results,
        "message": message
    }
