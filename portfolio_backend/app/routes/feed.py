from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.feed import FeedResponse
from app.services.feed_service import list_feed_items

router = APIRouter(prefix='/feed', tags=['feed'])


@router.get('', response_model=FeedResponse)
async def get_feed(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    items = await list_feed_items(db, limit=limit)
    return FeedResponse(items=items)
