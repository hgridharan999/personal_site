from math import radians, sin, cos, sqrt, atan2
from typing import Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.trail import Trail
from app.models.weather import WeatherForecast
from app.models.condition import TrailCondition
from app.services.decision_engine import apply_hard_rules, generate_breakdown


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in miles between two coordinates"""
    R = 3959

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c


async def get_latest_weather(
    trail_id: str,
    forecast_date: date,
    db_session: AsyncSession
) -> Optional[dict]:
    """Get latest weather forecast for trail on given date"""
    query = select(WeatherForecast).where(
        WeatherForecast.trail_id == trail_id,
        WeatherForecast.forecast_date == forecast_date,
        WeatherForecast.location_type == "summit"
    ).order_by(WeatherForecast.forecast_hour).limit(1)

    result = await db_session.execute(query)
    weather = result.scalar_one_or_none()

    if weather:
        return {
            "temperature_f": weather.temperature_f,
            "precipitation_prob": weather.precipitation_prob,
            "precipitation_type": weather.precipitation_type,
            "wind_speed_mph": weather.wind_speed_mph,
            "wind_gust_mph": weather.wind_gust_mph,
            "sky_cover": weather.sky_cover,
            "weather_summary": weather.weather_summary
        }
    return None


async def get_latest_conditions(trail_id: str, db_session: AsyncSession) -> Optional[dict]:
    """Get most recent trail condition report"""
    query = select(TrailCondition).where(
        TrailCondition.trail_id == trail_id
    ).order_by(TrailCondition.report_date.desc()).limit(1)

    result = await db_session.execute(query)
    condition = result.scalar_one_or_none()

    if condition:
        return {
            "trail_status": condition.trail_status,
            "snow_level_ft": condition.snow_level_ft,
            "mud_level": condition.mud_level,
            "water_crossing_status": condition.water_crossing_status,
            "hazards": condition.hazards or [],
            "required_gear": condition.required_gear or [],
            "difficulty_sentiment": condition.difficulty_sentiment,
            "overall_sentiment": condition.overall_sentiment,
            "report_date": condition.report_date
        }
    return None


def generate_why(trail: Trail, constraints: dict, confidence: float) -> str:
    """Generate human-readable reason for recommendation"""
    reasons = []

    if confidence >= 80:
        reasons.append("Great match for your fitness level")

    feature_prefs = set(constraints.get("desired_features", []))
    trail_features = set(trail.features or [])
    feature_matches = feature_prefs & trail_features
    if feature_matches:
        reasons.append(f"Has {', '.join(feature_matches)}")

    if trail.typical_crowd_level <= 2:
        reasons.append("Usually uncrowded")

    return ". ".join(reasons) if reasons else "Solid option based on your preferences"


async def get_recommendations(
    user_profile: dict,
    constraints: dict,
    db_session: AsyncSession
) -> list[dict]:
    """
    Get top 5 trail recommendations based on user constraints.

    constraints = {
        "date": "2026-01-18",
        "max_distance": 15,
        "max_elevation_gain": 3500,
        "max_drive_time_minutes": 120,
        "terrain_preferences": ["alpine", "lake"],
        "desired_features": ["lake", "summit"],
        "avoid": ["crowds", "fees"],
        "difficulty": "moderate"
    }
    """

    query = select(Trail).where(
        Trail.distance_miles <= constraints.get("max_distance", 30),
        Trail.elevation_gain_ft <= constraints.get("max_elevation_gain", 8000)
    )

    if constraints.get("difficulty"):
        query = query.where(Trail.difficulty == constraints["difficulty"])

    result = await db_session.execute(query)
    trails = result.scalars().all()

    user_lat = user_profile.get("location", {}).get("lat", 39.7392)
    user_lon = user_profile.get("location", {}).get("lon", -104.9903)
    max_radius = (constraints.get("max_drive_time_minutes", 120) / 60) * 45

    filtered_trails = []
    for trail in trails:
        distance = haversine_distance(user_lat, user_lon, float(trail.trailhead_lat), float(trail.trailhead_lon))
        if distance <= max_radius:
            filtered_trails.append((trail, distance))

    scored = []
    forecast_date = date.fromisoformat(constraints["date"])

    for trail, drive_distance in filtered_trails:
        weather = await get_latest_weather(str(trail.id), forecast_date, db_session)
        conditions = await get_latest_conditions(str(trail.id), db_session)

        trail_dict = {
            "distance_miles": float(trail.distance_miles),
            "elevation_gain_ft": trail.elevation_gain_ft,
            "exposure_level": trail.exposure_level,
            "technical_class": trail.technical_class,
            "required_gear": trail.required_gear or []
        }

        confidence, concerns = apply_hard_rules(
            trail_dict,
            user_profile,
            weather,
            conditions,
            user_profile.get("gear_inventory", [])
        )

        if confidence < 50:
            continue

        score = confidence

        terrain_prefs = set(constraints.get("terrain_preferences", []))
        trail_terrain = set(trail.terrain_types or [])
        if terrain_prefs and terrain_prefs.issubset(trail_terrain):
            score += 10

        feature_prefs = set(constraints.get("desired_features", []))
        trail_features = set(trail.features or [])
        score += len(feature_prefs & trail_features) * 5

        avoids = constraints.get("avoid", [])
        if "crowds" in avoids and trail.typical_crowd_level >= 4:
            score -= 15
        if "fees" in avoids and trail.fee_required:
            score -= 15

        scored.append({
            "trail": trail,
            "confidence_score": confidence,
            "composite_score": score,
            "drive_distance": drive_distance,
            "drive_time_minutes": int(drive_distance / 45 * 60),
            "concerns": concerns,
            "weather": weather,
            "why_recommended": generate_why(trail, constraints, confidence)
        })

    scored.sort(key=lambda x: x["composite_score"], reverse=True)

    results = scored[:5]
    if len(results) >= 3:
        if results[0]["trail"].terrain_types == results[1]["trail"].terrain_types:
            for i in range(2, len(scored)):
                if scored[i]["trail"].terrain_types != results[0]["trail"].terrain_types:
                    results[2] = scored[i]
                    break

    return results[:5]
