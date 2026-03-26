from datetime import UTC, datetime
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.linkedin_post import LinkedInPost
from app.models.oauth_account import OAuthAccount
from app.services.linkedin_client import LinkedInClient
from app.utils.crypto_service import decrypt_value


class LinkedInIngestionService:
    def __init__(self) -> None:
        self.client = LinkedInClient()

    async def sync(self, db: AsyncSession, count: int = 25) -> int:
        account = await self._get_account(db)
        if account is None:
            return 0
        if not account.linkedin_member_urn:
            return 0

        access_token = decrypt_value(account.encrypted_access_token)
        posts = await self.client.fetch_posts(access_token, account.linkedin_member_urn, count=count)

        upserted = 0
        for post in posts:
            provider_post_id = post.get('id')
            if not provider_post_id:
                continue

            text = self._extract_text(post)
            title = text[:90] if text else 'LinkedIn post'
            external_url = f'https://www.linkedin.com/feed/update/{provider_post_id}/'
            published_at = self._extract_published_at(post)

            existing = await db.scalar(
                select(LinkedInPost).where(LinkedInPost.provider_post_id == provider_post_id)
            )

            if existing:
                existing.title = title
                existing.excerpt = text or 'No text content'
                existing.external_url = external_url
                existing.raw_payload = json.dumps(post)
                existing.published_at = published_at
            else:
                db.add(
                    LinkedInPost(
                        provider_post_id=provider_post_id,
                        title=title,
                        excerpt=text or 'No text content',
                        external_url=external_url,
                        raw_payload=json.dumps(post),
                        published_at=published_at,
                    )
                )

            upserted += 1

        await db.commit()
        return upserted

    async def _get_account(self, db: AsyncSession) -> OAuthAccount | None:
        result = await db.execute(
            select(OAuthAccount).where(OAuthAccount.provider == 'linkedin').limit(1)
        )
        return result.scalar_one_or_none()

    def _extract_text(self, payload: dict) -> str:
        commentary = payload.get('specificContent', {}).get(
            'com.linkedin.ugc.ShareContent', {}
        ).get('shareCommentary', {})
        text = commentary.get('text', '')
        return text.strip()

    def _extract_published_at(self, payload: dict) -> datetime:
        created = payload.get('created', {}).get('time')
        if created:
            return datetime.fromtimestamp(created / 1000, tz=UTC)
        return datetime.now(UTC)
