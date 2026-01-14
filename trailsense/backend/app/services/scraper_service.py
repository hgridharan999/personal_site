import httpx
from bs4 import BeautifulSoup
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm_service import parse_trip_report
from app.models.condition import TrailCondition


async def scrape_alltrails_reports(trail_name: str, limit: int = 5) -> list[str]:
    """
    Scrape recent trip reports from AllTrails.
    Returns list of report texts.

    Note: For MVP, this is a placeholder. AllTrails may block scraping.
    Consider using manual data entry or alternative sources.
    """
    return []


async def process_and_store_reports(
    trail_id: str,
    reports: list[str],
    db_session: AsyncSession,
    groq_api_key: str
) -> int:
    """Parse reports with LLM and store in database"""
    stored_count = 0

    for report_text in reports:
        parsed = await parse_trip_report(report_text, groq_api_key)

        if parsed and parsed.get("confidence", 0) >= 0.5:
            condition = TrailCondition(
                trail_id=trail_id,
                report_date=parsed.get("report_date"),
                snow_level_ft=parsed.get("snow_level_ft"),
                trail_status=parsed.get("trail_status"),
                mud_level=parsed.get("mud_level"),
                water_crossing_status=parsed.get("water_crossing_status"),
                hazards=parsed.get("hazards", []),
                required_gear=parsed.get("required_gear", []),
                difficulty_sentiment=parsed.get("difficulty_sentiment"),
                overall_sentiment=parsed.get("overall_sentiment"),
                raw_text=report_text,
                confidence=parsed.get("confidence"),
                source="alltrails"
            )
            db_session.add(condition)
            stored_count += 1

    await db_session.commit()
    return stored_count
