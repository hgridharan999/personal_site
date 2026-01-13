# TrailSense

A personal hiking decision support system that assesses trail feasibility and recommends hikes based on weather conditions, trail characteristics, and user capability.

## Project Structure

```
trailsense/
├── backend/         # FastAPI backend
│   ├── app/
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   └── utils/        # Helper functions
│   ├── alembic/          # Database migrations
│   ├── data/             # Trail data
│   ├── scripts/          # Utility scripts
│   └── requirements.txt
└── frontend/        # React frontend (Phase 3)
```

## Phase 1: Backend Core (Completed)

### Features Implemented
- User authentication (register, login, JWT tokens)
- User profile management with onboarding
- Trail database with CRUD operations
- Weather integration with National Weather Service API
- Database migrations with Alembic

### Technology Stack
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with asyncpg
- **ORM**: SQLAlchemy 2.0 (async)
- **Authentication**: JWT with python-jose
- **Password Hashing**: bcrypt via passlib
- **Weather API**: National Weather Service (free, no API key)
- **Migrations**: Alembic

## Setup Instructions

### Prerequisites
- Python 3.11 or higher
- PostgreSQL 15 or higher
- pip or uv for package management

### Backend Setup

1. Navigate to the backend directory:
```bash
cd trailsense/backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/trailsense
SECRET_KEY=your-secret-key-here-generate-with-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

5. Run database migrations:
```bash
alembic upgrade head
```

6. Import sample trail data:
```bash
python scripts/import_trails.py
```

7. Start the development server:
```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile
- `POST /api/profile/onboard` - Complete onboarding
- `PUT /api/profile/gear` - Update gear inventory

### Trails
- `GET /api/trails` - List trails (with filters)
- `GET /api/trails/{id}` - Get trail details
- `POST /api/trails` - Create trail
- `GET /api/trails/{id}/weather?date=YYYY-MM-DD` - Get weather forecast

## Database Schema

### Users
- User authentication and profile data
- Profile stores fitness, technical ability, personal preferences, and location as JSONB
- Gear inventory as text array

### Trails
- Trail metadata (name, region, coordinates, elevation)
- Difficulty ratings and technical requirements
- Terrain types and features
- Crowd levels and access information

### Weather Forecasts
- Hourly forecasts for trailhead and summit
- Temperature, precipitation, wind data
- Fetched from National Weather Service API

## Next Steps

### Phase 2: Backend Intelligence (Coming Soon)
- Decision engine with hard rules and ML models
- Trip report scraping and LLM parsing
- Recommendation system
- Hike logging with adaptive learning

### Phase 3: Frontend Core (Coming Soon)
- React application with TypeScript
- User onboarding flow
- Trail browsing and search
- Design system matching personal website

### Phase 4: Frontend Polish & Deploy (Coming Soon)
- Assessment UI with confidence scoring
- Recommendation interface
- Hike logging
- Production deployment

## Development Status

- [x] Project structure
- [x] Database models
- [x] Authentication system
- [x] Profile management
- [x] Trail CRUD operations
- [x] Weather service integration
- [x] Sample data import
- [x] Database migrations
- [ ] Decision engine
- [ ] Trip report scraping
- [ ] Recommendation system
- [ ] Frontend application

## Contributing

This is a personal project currently in active development. Phase 1 (Backend Core) is complete.

## License

MIT License
