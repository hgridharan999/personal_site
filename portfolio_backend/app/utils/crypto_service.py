import base64
import hashlib
from cryptography.fernet import Fernet

from app.config import get_settings


settings = get_settings()


def _build_fernet() -> Fernet:
    if settings.token_encryption_key:
        key = settings.token_encryption_key.encode('utf-8')
    else:
        # Dev fallback key so local setup works before env wiring.
        key = base64.urlsafe_b64encode(hashlib.sha256(b'portfolio-backend-dev-key').digest())
    return Fernet(key)


def encrypt_value(value: str) -> str:
    fernet = _build_fernet()
    return fernet.encrypt(value.encode('utf-8')).decode('utf-8')


def decrypt_value(value: str) -> str:
    fernet = _build_fernet()
    return fernet.decrypt(value.encode('utf-8')).decode('utf-8')
