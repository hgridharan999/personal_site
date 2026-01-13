from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

from app.database import get_db
from app.services import trail_service
from app.utils.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/trails", tags=["trails"])


class TrailResponse(BaseModel):
    id: str
    name: str
    region: Optional[str] = None
    trailhead_lat: float
    trailhead_lon: float
    trailhead_elevation: Optional[int] = None
    highest_point_elevation: Optional[int] = None
    distance_miles: float
    elevation_gain_ft: int
    trail_type: Optional[str] = None
    difficulty: Optional[str] = None
    technical_class: int
    exposure_level: int
    terrain_types: list[str]
    features: list[str]
    typical_crowd_level: int
    dogs_allowed: bool
    fee_required: bool
    best_months: list[int]
    estimated_time_hours: Optional[float] = None
    route_description: Optional[str] = None
    required_gear: list[str]
    photos: list[str]

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=str(obj.id),
            name=obj.name,
            region=obj.region,
            trailhead_lat=float(obj.trailhead_lat),
            trailhead_lon=float(obj.trailhead_lon),
            trailhead_elevation=obj.trailhead_elevation,
            highest_point_elevation=obj.highest_point_elevation,
            distance_miles=float(obj.distance_miles),
            elevation_gain_ft=obj.elevation_gain_ft,
            trail_type=obj.trail_type,
            difficulty=obj.difficulty,
            technical_class=obj.technical_class,
            exposure_level=obj.exposure_level,
            terrain_types=obj.terrain_types or [],
            features=obj.features or [],
            typical_crowd_level=obj.typical_crowd_level,
            dogs_allowed=obj.dogs_allowed,
            fee_required=obj.fee_required,
            best_months=obj.best_months or [],
            estimated_time_hours=float(obj.estimated_time_hours) if obj.estimated_time_hours else None,
            route_description=obj.route_description,
            required_gear=obj.required_gear or [],
            photos=obj.photos or []
        )


class TrailsListResponse(BaseModel):
    trails: list[TrailResponse]
    count: int


class CreateTrailRequest(BaseModel):
    name: str
    region: Optional[str] = None
    trailhead_lat: float
    trailhead_lon: float
    trailhead_elevation: Optional[int] = None
    highest_point_elevation: Optional[int] = None
    distance_miles: float
    elevation_gain_ft: int
    trail_type: Optional[str] = None
    difficulty: Optional[str] = None
    technical_class: int = 1
    exposure_level: int = 1
    terrain_types: list[str] = []
    features: list[str] = []
    typical_crowd_level: int = 3
    dogs_allowed: bool = True
    fee_required: bool = False
    best_months: list[int] = []
    estimated_time_hours: Optional[float] = None
    route_description: Optional[str] = None
    required_gear: list[str] = []
    photos: list[str] = []


@router.get("", response_model=TrailsListResponse)
async def list_trails(
    search: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    max_distance: Optional[float] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trails, count = await trail_service.get_trails(
        db, search=search, difficulty=difficulty, max_distance=max_distance,
        limit=limit, offset=offset
    )

    return TrailsListResponse(
        trails=[TrailResponse.from_orm(trail) for trail in trails],
        count=count
    )


@router.get("/{trail_id}", response_model=TrailResponse)
async def get_trail(
    trail_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trail = await trail_service.get_trail_by_id(db, trail_id)
    if not trail:
        raise HTTPException(status_code=404, detail="Trail not found")

    return TrailResponse.from_orm(trail)


@router.post("", response_model=TrailResponse)
async def create_trail(
    request: CreateTrailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trail_data = request.model_dump()
    trail = await trail_service.create_trail(db, trail_data)

    return TrailResponse.from_orm(trail)
