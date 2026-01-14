from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.models.user import User
from app.models.trail import Trail
from app.models.assessment import Assessment
from app.models.condition import TrailCondition
from app.services.auth_service import get_current_user
from app.services.decision_engine import apply_hard_rules, generate_breakdown, get_recommendation, calculate_naismith_time
from app.services.recommendation_service import get_latest_weather, get_latest_conditions


router = APIRouter(prefix="/api/assessments", tags=["assessments"])


class CreateAssessmentRequest(BaseModel):
    trail_id: str
    date: str
    gear: list[str]


class AssessmentResponse(BaseModel):
    assessment_id: str
    confidence_score: float
    recommendation: str
    breakdown: dict
    concerns: list[str]
    estimated_time_hours: float
    weather_summary: Optional[dict]
    recent_reports: list[dict]


@router.post("", response_model=AssessmentResponse)
async def create_assessment(
    request: CreateAssessmentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a trail assessment for a specific date"""
    query = select(Trail).where(Trail.id == request.trail_id)
    result = await db.execute(query)
    trail = result.scalar_one_or_none()

    if not trail:
        raise HTTPException(status_code=404, detail="Trail not found")

    forecast_date = date.fromisoformat(request.date)

    weather = await get_latest_weather(request.trail_id, forecast_date, db)
    conditions = await get_latest_conditions(request.trail_id, db)

    trail_dict = {
        "distance_miles": float(trail.distance_miles),
        "elevation_gain_ft": trail.elevation_gain_ft,
        "exposure_level": trail.exposure_level,
        "technical_class": trail.technical_class,
        "required_gear": trail.required_gear or []
    }

    confidence, concerns = apply_hard_rules(
        trail_dict,
        current_user.profile,
        weather,
        conditions,
        request.gear
    )

    breakdown = generate_breakdown(
        trail_dict,
        current_user.profile,
        weather,
        conditions,
        request.gear,
        confidence,
        concerns
    )

    recommendation = get_recommendation(confidence)
    estimated_time = calculate_naismith_time(trail_dict, current_user.profile)

    assessment = Assessment(
        user_id=current_user.id,
        trail_id=trail.id,
        assessment_date=forecast_date,
        confidence_score=Decimal(str(confidence)),
        recommendation=recommendation,
        breakdown=breakdown,
        concerns=concerns
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    conditions_query = select(TrailCondition).where(
        TrailCondition.trail_id == request.trail_id
    ).order_by(TrailCondition.report_date.desc()).limit(5)
    conditions_result = await db.execute(conditions_query)
    recent_conditions = conditions_result.scalars().all()

    recent_reports = [
        {
            "report_date": str(c.report_date),
            "trail_status": c.trail_status,
            "overall_sentiment": c.overall_sentiment,
            "raw_text": c.raw_text[:200] + "..." if c.raw_text and len(c.raw_text) > 200 else c.raw_text
        }
        for c in recent_conditions
    ]

    return AssessmentResponse(
        assessment_id=str(assessment.id),
        confidence_score=float(confidence),
        recommendation=recommendation,
        breakdown=breakdown,
        concerns=concerns,
        estimated_time_hours=estimated_time,
        weather_summary=weather,
        recent_reports=recent_reports
    )


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific assessment by ID"""
    query = select(Assessment).where(
        Assessment.id == assessment_id,
        Assessment.user_id == current_user.id
    )
    result = await db.execute(query)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return {
        "id": str(assessment.id),
        "trail_id": str(assessment.trail_id),
        "assessment_date": str(assessment.assessment_date),
        "confidence_score": float(assessment.confidence_score),
        "recommendation": assessment.recommendation,
        "breakdown": assessment.breakdown,
        "concerns": assessment.concerns,
        "created_at": assessment.created_at
    }


@router.get("")
async def list_assessments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all assessments for current user"""
    query = select(Assessment).where(
        Assessment.user_id == current_user.id
    ).order_by(Assessment.created_at.desc())
    result = await db.execute(query)
    assessments = result.scalars().all()

    return {
        "assessments": [
            {
                "id": str(a.id),
                "trail_id": str(a.trail_id),
                "assessment_date": str(a.assessment_date),
                "confidence_score": float(a.confidence_score),
                "recommendation": a.recommendation,
                "created_at": a.created_at
            }
            for a in assessments
        ]
    }
