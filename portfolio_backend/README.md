# Portfolio Backend

FastAPI backend for the portfolio `Blogs + Posts` timeline.

## Features
- LinkedIn OAuth connect/disconnect endpoints
- LinkedIn ingestion endpoint for scheduled syncs
- Normalized feed API consumed by frontend (`/api/v1/feed`)

## Quick start
1. Copy `.env.example` to `.env` and fill LinkedIn credentials.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Run server:
   - `uvicorn app.main:app --reload --port 8000`

## Key endpoints
- `GET /health`
- `GET /api/v1/auth/linkedin/start`
- `GET /api/v1/auth/linkedin/callback`
- `POST /api/v1/auth/linkedin/disconnect`
- `POST /api/v1/internal/sync/linkedin` (requires `X-Sync-Secret` header)
- `GET /api/v1/feed?limit=50`
