from datetime import UTC

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.linkedin_post import LinkedInPost
from app.schemas.feed import FeedItem


async def list_feed_items(db: AsyncSession, limit: int = 50) -> list[FeedItem]:
    result = await db.execute(
        select(LinkedInPost).order_by(desc(LinkedInPost.published_at)).limit(limit)
    )
    posts = result.scalars().all()

    items: list[FeedItem] = []
    for post in posts:
        published = post.published_at.astimezone(UTC)
        items.append(
            FeedItem(
                id=f'linkedin:{post.provider_post_id}',
                source='linkedin',
                sourceLabel='LinkedIn',
                title=post.title,
                excerpt=post.excerpt,
                publishedAt=published.isoformat(),
                displayDate=published.strftime('%Y-%m-%d'),
                externalUrl=post.external_url,
            )
        )

    return items
