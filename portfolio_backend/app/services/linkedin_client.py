from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.config import get_settings


settings = get_settings()


class LinkedInClient:
    auth_base_url = 'https://www.linkedin.com/oauth/v2/authorization'
    token_url = 'https://www.linkedin.com/oauth/v2/accessToken'
    userinfo_url = 'https://api.linkedin.com/v2/userinfo'
    posts_url = 'https://api.linkedin.com/v2/ugcPosts'

    def build_authorization_url(self, state: str) -> str:
        params = {
            'response_type': 'code',
            'client_id': settings.linkedin_client_id,
            'redirect_uri': settings.linkedin_redirect_uri,
            'state': state,
            'scope': settings.linkedin_scopes,
        }
        return f'{self.auth_base_url}?{urlencode(params)}'

    async def exchange_code_for_tokens(self, code: str) -> dict:
        payload = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': settings.linkedin_redirect_uri,
            'client_id': settings.linkedin_client_id,
            'client_secret': settings.linkedin_client_secret,
        }

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(self.token_url, data=payload)
            response.raise_for_status()
            data = response.json()

        expires_in = int(data.get('expires_in', 3600))
        data['expires_at'] = datetime.now(UTC) + timedelta(seconds=expires_in)
        return data

    async def fetch_profile(self, access_token: str) -> dict:
        headers = {'Authorization': f'Bearer {access_token}'}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(self.userinfo_url, headers=headers)
            response.raise_for_status()
            return response.json()

    async def fetch_posts(self, access_token: str, member_urn: str, count: int = 25) -> list[dict]:
        headers = {'Authorization': f'Bearer {access_token}', 'X-Restli-Protocol-Version': '2.0.0'}
        params = {
            'q': 'authors',
            'authors': f'List({member_urn})',
            'sortBy': 'LAST_MODIFIED',
            'count': count,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(self.posts_url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            return data.get('elements', [])
