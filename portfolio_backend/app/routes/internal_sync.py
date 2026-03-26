import hashlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.linkedin_post import LinkedInPost
from app.schemas.feed import PostCreate, PostCreated

settings = get_settings()
router = APIRouter(prefix='/internal', tags=['internal'])


def _require_secret(x_sync_secret: str | None = Header(default=None)) -> None:
    if x_sync_secret != settings.internal_sync_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid sync secret.')


@router.post('/posts', response_model=PostCreated, status_code=status.HTTP_201_CREATED)
async def create_post(
    body: PostCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_secret),
) -> PostCreated:
    published_at = body.published_at or datetime.now(UTC)
    title = body.title or body.text[:90]
    provider_post_id = hashlib.sha1(body.url.encode()).hexdigest()[:16]

    existing = await db.scalar(
        select(LinkedInPost).where(LinkedInPost.provider_post_id == provider_post_id)
    )
    if existing:
        existing.title = title
        existing.excerpt = body.text
        existing.external_url = body.url
        existing.published_at = published_at
        await db.commit()
        return PostCreated(id=existing.id, provider_post_id=provider_post_id, title=title)

    post = LinkedInPost(
        provider_post_id=provider_post_id,
        title=title,
        excerpt=body.text,
        external_url=body.url,
        raw_payload='{}',
        published_at=published_at,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return PostCreated(id=post.id, provider_post_id=provider_post_id, title=title)


@router.delete('/posts/{post_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_secret),
) -> None:
    post = await db.scalar(select(LinkedInPost).where(LinkedInPost.id == post_id))
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Post not found.')
    await db.delete(post)
    await db.commit()
