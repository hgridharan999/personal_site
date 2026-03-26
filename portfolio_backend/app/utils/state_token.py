from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
from base64 import urlsafe_b64decode, urlsafe_b64encode

from fastapi import HTTPException, status

from app.config import get_settings


settings = get_settings()


def _secret() -> bytes:
    secret = settings.internal_sync_secret
    return secret.encode('utf-8')


def create_state_token() -> str:
    payload = {
        'exp': (datetime.now(UTC) + timedelta(minutes=10)).timestamp(),
        'purpose': 'linkedin_oauth',
    }
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    signature = hmac.new(_secret(), payload_bytes, hashlib.sha256).digest()
    return f"{urlsafe_b64encode(payload_bytes).decode('utf-8')}.{urlsafe_b64encode(signature).decode('utf-8')}"


def verify_state_token(token: str) -> None:
    try:
        payload_part, sig_part = token.split('.')
        payload_bytes = urlsafe_b64decode(payload_part.encode('utf-8'))
        provided_sig = urlsafe_b64decode(sig_part.encode('utf-8'))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid OAuth state token.') from exc

    expected_sig = hmac.new(_secret(), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_sig, provided_sig):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid OAuth state signature.')

    payload = json.loads(payload_bytes.decode('utf-8'))
    if datetime.now(UTC).timestamp() > payload.get('exp', 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OAuth state token has expired.')
