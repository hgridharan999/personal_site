from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'Portfolio Backend'
    environment: str = 'development'
    api_prefix: str = '/api/v1'

    database_url: str = 'sqlite+aiosqlite:///./portfolio.db'

    frontend_origin: str = 'http://localhost:5173'

    linkedin_client_id: str = ''
    linkedin_client_secret: str = ''
    linkedin_redirect_uri: str = 'http://localhost:8000/api/v1/auth/linkedin/callback'
    linkedin_scopes: str = 'openid profile email r_member_social'

    token_encryption_key: str = ''
    owner_email: str = ''
    internal_sync_secret: str = 'dev-sync-secret'


@lru_cache
def get_settings() -> Settings:
    return Settings()
