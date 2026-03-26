from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.oauth_account import OAuthAccount
from app.schemas.auth import (
    LinkedInAuthUrlResponse,
    LinkedInCallbackResponse,
    LinkedInDisconnectResponse,
)
from app.services.linkedin_client import LinkedInClient
from app.services.linkedin_ingestion_service import LinkedInIngestionService
from app.utils.crypto_service import encrypt_value
from app.utils.state_token import create_state_token, verify_state_token

settings = get_settings()
router = APIRouter(prefix='/auth/linkedin', tags=['auth'])
client = LinkedInClient()
ingestion_service = LinkedInIngestionService()


@router.get('/start', response_model=LinkedInAuthUrlResponse)
async def start_linkedin_auth() -> LinkedInAuthUrlResponse:
    if not settings.linkedin_client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='LinkedIn client ID is not configured.',
        )

    state = create_state_token()
    authorization_url = client.build_authorization_url(state)
    return LinkedInAuthUrlResponse(authorization_url=authorization_url)


@router.get('/callback', response_model=LinkedInCallbackResponse)
async def linkedin_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> LinkedInCallbackResponse:
    verify_state_token(state)

    token_data = await client.exchange_code_for_tokens(code)
    access_token = token_data.get('access_token')
    refresh_token = token_data.get('refresh_token')
    if not access_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='No access token returned by LinkedIn.')

    profile = await client.fetch_profile(access_token)
    provider_user_id = profile.get('sub')
    email = profile.get('email')
    display_name = profile.get('name')

    account = await db.scalar(select(OAuthAccount).where(OAuthAccount.provider == 'linkedin').limit(1))

    if account is None:
        account = OAuthAccount(
            provider='linkedin',
            provider_user_id=provider_user_id,
            provider_email=email,
            provider_display_name=display_name,
            linkedin_member_urn=f"urn:li:person:{provider_user_id}" if provider_user_id else None,
            encrypted_access_token=encrypt_value(access_token),
            encrypted_refresh_token=encrypt_value(refresh_token) if refresh_token else None,
            scope=token_data.get('scope', settings.linkedin_scopes),
            expires_at=token_data.get('expires_at'),
        )
        db.add(account)
    else:
        account.provider_user_id = provider_user_id
        account.provider_email = email
        account.provider_display_name = display_name
        account.linkedin_member_urn = f"urn:li:person:{provider_user_id}" if provider_user_id else account.linkedin_member_urn
        account.encrypted_access_token = encrypt_value(access_token)
        account.encrypted_refresh_token = encrypt_value(refresh_token) if refresh_token else account.encrypted_refresh_token
        account.scope = token_data.get('scope', settings.linkedin_scopes)
        account.expires_at = token_data.get('expires_at')
        account.updated_at = datetime.now(UTC)

    await db.commit()
    await ingestion_service.sync(db)

    return LinkedInCallbackResponse(connected=True, message='LinkedIn account connected successfully.')


@router.post('/disconnect', response_model=LinkedInDisconnectResponse)
async def disconnect_linkedin(db: AsyncSession = Depends(get_db)) -> LinkedInDisconnectResponse:
    account = await db.scalar(select(OAuthAccount).where(OAuthAccount.provider == 'linkedin').limit(1))
    if account is None:
        return LinkedInDisconnectResponse(disconnected=True, message='LinkedIn already disconnected.')

    await db.delete(account)
    await db.commit()
    return LinkedInDisconnectResponse(disconnected=True, message='LinkedIn account disconnected.')
