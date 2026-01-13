import httpx
from datetime import datetime, date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.trail import Trail
from app.models.weather import WeatherForecast


async def fetch_nws_forecast(lat: float, lon: float) -> Optional[dict]:
    """Fetch weather forecast from National Weather Service API."""
    async with httpx.AsyncClient() as client:
        try:
            points_url = f"https://api.weather.gov/points/{lat},{lon}"
            points_response = await client.get(
                points_url,
                headers={"User-Agent": "TrailSense/1.0 (contact@example.com)"},
                timeout=10.0
            )

            if points_response.status_code != 200:
                return None

            points_data = points_response.json()
            forecast_hourly_url = points_data.get("properties", {}).get("forecastHourly")

            if not forecast_hourly_url:
                return None

            forecast_response = await client.get(
                forecast_hourly_url,
                headers={"User-Agent": "TrailSense/1.0 (contact@example.com)"},
                timeout=10.0
            )

            if forecast_response.status_code != 200:
                return None

            return forecast_response.json()
        except Exception as e:
            print(f"Error fetching NWS forecast: {e}")
            return None


def calculate_summit_weather(
    trailhead_temp: int,
    trailhead_elevation: int,
    summit_elevation: int,
    trailhead_wind: int
) -> tuple[int, int]:
    """Calculate summit temperature and wind based on elevation difference."""
    elevation_diff = summit_elevation - trailhead_elevation
    temp_lapse_rate = 3.5
    summit_temp = trailhead_temp - int((elevation_diff / 1000) * temp_lapse_rate)

    wind_multiplier = 1.3
    summit_wind = int(trailhead_wind * wind_multiplier)

    return summit_temp, summit_wind


async def fetch_and_store_weather(db: AsyncSession, trail_id: str) -> bool:
    """Fetch weather for a trail and store in database."""
    trail = await db.execute(select(Trail).where(Trail.id == trail_id))
    trail = trail.scalars().first()

    if not trail:
        return False

    forecast_data = await fetch_nws_forecast(
        float(trail.trailhead_lat),
        float(trail.trailhead_lon)
    )

    if not forecast_data:
        return False

    periods = forecast_data.get("properties", {}).get("periods", [])

    for period in periods[:168]:
        start_time = datetime.fromisoformat(period.get("startTime").replace("Z", "+00:00"))
        forecast_date = start_time.date()
        forecast_hour = start_time.hour

        temp_f = period.get("temperature")
        precip_prob = period.get("probabilityOfPrecipitation", {}).get("value") or 0
        wind_speed = period.get("windSpeed", "0 mph")

        try:
            wind_mph = int(wind_speed.split()[0]) if wind_speed else 0
        except (ValueError, IndexError):
            wind_mph = 0

        trailhead_forecast = WeatherForecast(
            trail_id=trail_id,
            location_type="trailhead",
            forecast_date=forecast_date,
            forecast_hour=forecast_hour,
            temperature_f=temp_f,
            precipitation_prob=precip_prob,
            wind_speed_mph=wind_mph,
            wind_gust_mph=int(wind_mph * 1.5),
            sky_cover=None,
            weather_summary=period.get("shortForecast")
        )
        db.add(trailhead_forecast)

        if trail.highest_point_elevation and trail.trailhead_elevation:
            summit_temp, summit_wind = calculate_summit_weather(
                temp_f,
                trail.trailhead_elevation,
                trail.highest_point_elevation,
                wind_mph
            )

            summit_forecast = WeatherForecast(
                trail_id=trail_id,
                location_type="summit",
                forecast_date=forecast_date,
                forecast_hour=forecast_hour,
                temperature_f=summit_temp,
                precipitation_prob=precip_prob,
                wind_speed_mph=summit_wind,
                wind_gust_mph=int(summit_wind * 1.5),
                sky_cover=None,
                weather_summary=period.get("shortForecast")
            )
            db.add(summit_forecast)

    await db.commit()
    return True


async def get_weather_for_trail(
    db: AsyncSession,
    trail_id: str,
    target_date: date
) -> dict:
    """Get weather forecasts for a trail on a specific date."""
    trailhead_query = select(WeatherForecast).where(
        WeatherForecast.trail_id == trail_id,
        WeatherForecast.location_type == "trailhead",
        WeatherForecast.forecast_date == target_date
    ).order_by(WeatherForecast.forecast_hour)

    summit_query = select(WeatherForecast).where(
        WeatherForecast.trail_id == trail_id,
        WeatherForecast.location_type == "summit",
        WeatherForecast.forecast_date == target_date
    ).order_by(WeatherForecast.forecast_hour)

    trailhead_result = await db.execute(trailhead_query)
    summit_result = await db.execute(summit_query)

    trailhead_forecasts = trailhead_result.scalars().all()
    summit_forecasts = summit_result.scalars().all()

    return {
        "trailhead": [
            {
                "hour": f.forecast_hour,
                "temperature_f": f.temperature_f,
                "precipitation_prob": f.precipitation_prob,
                "wind_speed_mph": f.wind_speed_mph,
                "weather_summary": f.weather_summary
            }
            for f in trailhead_forecasts
        ],
        "summit": [
            {
                "hour": f.forecast_hour,
                "temperature_f": f.temperature_f,
                "precipitation_prob": f.precipitation_prob,
                "wind_speed_mph": f.wind_speed_mph,
                "weather_summary": f.weather_summary
            }
            for f in summit_forecasts
        ]
    }
