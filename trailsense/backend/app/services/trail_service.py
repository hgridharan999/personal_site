from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.models.trail import Trail


async def get_trails(
    db: AsyncSession,
    search: Optional[str] = None,
    difficulty: Optional[str] = None,
    max_distance: Optional[float] = None,
    limit: int = 50,
    offset: int = 0
) -> tuple[list[Trail], int]:
    query = select(Trail)

    if search:
        query = query.where(Trail.name.ilike(f"%{search}%"))
    if difficulty:
        query = query.where(Trail.difficulty == difficulty)
    if max_distance:
        query = query.where(Trail.distance_miles <= max_distance)

    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total_count = count_result.scalar()

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    trails = result.scalars().all()

    return list(trails), total_count


async def get_trail_by_id(db: AsyncSession, trail_id: str) -> Optional[Trail]:
    result = await db.execute(select(Trail).where(Trail.id == trail_id))
    return result.scalars().first()


async def create_trail(db: AsyncSession, trail_data: dict) -> Trail:
    trail = Trail(**trail_data)
    db.add(trail)
    await db.commit()
    await db.refresh(trail)
    return trail
