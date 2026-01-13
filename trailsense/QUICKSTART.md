# TrailSense Quick Start Guide

## Phase 1 Complete! 🎉

The backend foundation is now operational with all core functionality.

## What You Can Do Now

### 1. Start the Backend Server

```bash
cd trailsense/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your database URL and secret key

# Run migrations
alembic upgrade head

# Import sample trails
python scripts/import_trails.py

# Start the server
uvicorn app.main:app --reload
```

Server will run at: http://localhost:8000
API docs: http://localhost:8000/docs

### 2. Test the API

Visit http://localhost:8000/docs for interactive API documentation.

#### Example Flow:

**Register a User**
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hiker@example.com",
    "password": "securepassword123",
    "name": "John Hiker"
  }'
```

**Complete Onboarding**
```bash
curl -X POST http://localhost:8000/api/profile/onboard \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fitness": {
      "max_hours": 6,
      "max_elevation_gain": 3000,
      "pace": "moderate",
      "experience_years": 5
    },
    "technical": {
      "scrambling_comfort": true,
      "exposure_comfort": 3,
      "navigation_skill": "sometimes"
    },
    "personal": {
      "home_elevation": 5000,
      "cold_tolerance": 4,
      "risk_tolerance": "moderate"
    },
    "location": {
      "city": "Denver",
      "state": "CO",
      "lat": 39.7392,
      "lon": -104.9903
    }
  }'
```

**Browse Trails**
```bash
curl http://localhost:8000/api/trails \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Weather Forecast**
```bash
curl "http://localhost:8000/api/trails/TRAIL_ID/weather?date=2026-01-20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Database Setup

### Using Supabase (Recommended for Development)

1. Create free account at https://supabase.com
2. Create new project
3. Get connection string from Settings > Database
4. Update `.env` with: `DATABASE_URL=postgresql+asyncpg://...`

### Using Local PostgreSQL

1. Install PostgreSQL 15+
2. Create database:
```sql
CREATE DATABASE trailsense;
```
3. Update `.env` with local connection string

## Project Structure

```
trailsense/backend/
├── app/
│   ├── main.py          # FastAPI entry point
│   ├── config.py        # Configuration
│   ├── database.py      # DB connection
│   ├── models/          # SQLAlchemy models
│   │   ├── user.py
│   │   ├── trail.py
│   │   └── weather.py
│   ├── routes/          # API endpoints
│   │   ├── auth.py      # /api/auth/*
│   │   ├── profile.py   # /api/profile/*
│   │   ├── trails.py    # /api/trails/*
│   │   └── weather.py   # /api/trails/{id}/weather
│   ├── services/        # Business logic
│   │   ├── auth_service.py
│   │   ├── trail_service.py
│   │   └── weather_service.py
│   └── utils/
│       └── security.py  # JWT & password hashing
├── alembic/             # Database migrations
├── data/
│   └── trails.csv       # Sample Colorado trails
└── scripts/
    └── import_trails.py # CSV import utility
```

## API Endpoints Summary

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `GET /api/auth/me` - Current user info

### Profile
- `GET /api/profile` - Get profile
- `PUT /api/profile` - Update profile
- `POST /api/profile/onboard` - Complete onboarding
- `PUT /api/profile/gear` - Update gear

### Trails
- `GET /api/trails` - List trails (filterable)
- `GET /api/trails/{id}` - Trail details
- `POST /api/trails` - Create trail
- `GET /api/trails/{id}/weather` - Weather forecast

## Sample Data

10 Colorado trails included:
- Mt. Bierstadt (14er)
- Grays Peak (14er)
- Torreys Peak (14er)
- Quandary Peak (14er)
- Sky Pond (RMNP)
- Emerald Lake (RMNP)
- Chasm Lake (RMNP)
- Lake Isabelle (Indian Peaks)
- Blue Lake (Indian Peaks)
- Lost Lake (Indian Peaks)

## Environment Variables

Required in `.env`:
```bash
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/trailsense
SECRET_KEY=generate-with-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

Generate SECRET_KEY:
```bash
openssl rand -hex 32
```

## Troubleshooting

### "ModuleNotFoundError"
Make sure virtual environment is activated:
```bash
source venv/bin/activate
```

### "Connection refused" database error
Ensure PostgreSQL is running and credentials are correct in `.env`

### Alembic migration errors
Drop and recreate database, then re-run migrations:
```bash
alembic downgrade base
alembic upgrade head
```

### Import script fails
Ensure database migrations have run first:
```bash
alembic upgrade head
python scripts/import_trails.py
```

## Next Steps

Phase 1 is complete! Next phases:

**Phase 2**: Decision engine, trip report scraping, recommendations
**Phase 3**: React frontend with design system integration
**Phase 4**: Assessment UI, deployment

## Code Quality

- Type hints throughout
- Async operations for performance
- Pydantic validation
- JWT authentication
- Bcrypt password hashing
- RESTful API design
- Comprehensive error handling

## Getting Help

- API docs: http://localhost:8000/docs
- Check README.md for detailed information
- Review PHASE1_COMPLETE.md for implementation details

---

**Status**: Phase 1 ✅ Complete
**Ready for**: Phase 2 development
