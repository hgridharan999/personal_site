from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/profile", tags=["profile"])


class FitnessProfile(BaseModel):
    max_hours: int
    max_elevation_gain: int
    pace: str
    experience_years: int


class TechnicalProfile(BaseModel):
    scrambling_comfort: bool
    exposure_comfort: int
    navigation_skill: str


class PersonalProfile(BaseModel):
    home_elevation: int
    cold_tolerance: int
    risk_tolerance: str


class LocationProfile(BaseModel):
    city: str
    state: str
    lat: float
    lon: float


class OnboardingRequest(BaseModel):
    fitness: FitnessProfile
    technical: TechnicalProfile
    personal: PersonalProfile
    location: LocationProfile


class ProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    profile: dict
    gear_inventory: list[str]
    current_fatigue: float

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    profile: Optional[dict] = None


class GearUpdateRequest(BaseModel):
    gear_inventory: list[str]


@router.get("", response_model=ProfileResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    return ProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        profile=current_user.profile,
        gear_inventory=current_user.gear_inventory or [],
        current_fatigue=float(current_user.current_fatigue or 0.0)
    )


@router.put("", response_model=ProfileResponse)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if request.name is not None:
        current_user.name = request.name
    if request.profile is not None:
        current_user.profile = request.profile

    await db.commit()
    await db.refresh(current_user)

    return ProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        profile=current_user.profile,
        gear_inventory=current_user.gear_inventory or [],
        current_fatigue=float(current_user.current_fatigue or 0.0)
    )


@router.post("/onboard", response_model=ProfileResponse)
async def onboard(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    current_user.profile = {
        "fitness": request.fitness.model_dump(),
        "technical": request.technical.model_dump(),
        "personal": request.personal.model_dump(),
        "location": request.location.model_dump()
    }

    await db.commit()
    await db.refresh(current_user)

    return ProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        profile=current_user.profile,
        gear_inventory=current_user.gear_inventory or [],
        current_fatigue=float(current_user.current_fatigue or 0.0)
    )


@router.put("/gear", response_model=dict)
async def update_gear(
    request: GearUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    current_user.gear_inventory = request.gear_inventory

    await db.commit()
    await db.refresh(current_user)

    return {"gear_inventory": current_user.gear_inventory or []}
