# Phase 2 Complete: Backend Intelligence

Phase 2 implementation is complete! The TrailSense backend now includes the full decision engine, recommendations system, and trip report parsing capabilities.

## What's New in Phase 2

### Decision Engine
- Hard rules for trail feasibility assessment
- Naismith's Rule for time estimation
- Confidence score calculation (0-100%)
- Four-category breakdown (capability, weather, conditions, gear)
- Recommendation categorization (go, caution, reconsider, don't go)

### Intelligent Recommendations
- Constraint-based trail filtering
- Composite scoring algorithm
- Drive time calculation using haversine distance
- Maximal Marginal Relevance (MMR) for diversity
- Returns top 5 ranked trails with explanations

### Trip Report Parsing
- Groq API integration for LLM-powered parsing
- Structured data extraction from natural language
- Confidence scoring for extracted data
- Support for manual condition entry

### New API Endpoints

#### Assessments
```
POST /api/assessments
  Body: { trail_id, date, gear }
  Returns: Full assessment with confidence score, breakdown, concerns

GET /api/assessments/:id
  Returns: Specific assessment details

GET /api/assessments
  Returns: All assessments for current user
```

#### Recommendations
```
POST /api/recommendations
  Body: { date, max_distance, max_elevation_gain, max_drive_time_minutes,
          terrain_preferences, desired_features, avoid, difficulty }
  Returns: Top 5 trail recommendations with why_recommended
```

#### Trail Conditions
```
GET /api/trails/:id/conditions
  Returns: All condition reports for a trail

POST /api/trails/:id/conditions
  Body: { report_date, trail_status, snow_level_ft, required_gear, notes }
  Returns: Created condition report
```

#### Hike Logs
```
GET /api/hikes
  Returns: All hikes for current user

POST /api/hikes
  Body: { trail_id, hike_date, completed, difficulty_rating,
          time_taken_hours, notes }
  Returns: Created hike log

PUT /api/hikes/:id
  Body: Partial update
  Returns: Updated hike log

DELETE /api/hikes/:id
  Returns: Success confirmation
```

## New Database Tables

### trail_conditions
Stores parsed trip reports and manual condition entries:
- Trail status (clear, muddy, icy, snowy, closed)
- Snow level, mud level, water crossing status
- Required gear and hazards
- Difficulty and overall sentiment
- Source and confidence score

### assessments
Stores user trail assessments:
- Confidence score and recommendation
- Four-category breakdown (JSONB)
- List of concerns
- Assessment date

### hike_logs
Stores completed hike logs:
- Completed status and difficulty rating
- Actual time taken vs estimated
- Notes for future reference

## Architecture Overview

### Decision Engine Flow
1. User requests assessment with trail_id, date, and gear
2. System fetches trail data, weather forecast, and conditions
3. Hard rules applied (returns 0-100 score + concerns)
4. Breakdown generated for each category
5. Recommendation determined based on score
6. Assessment saved to database

### Recommendation Flow
1. User provides constraints (distance, elevation, drive time, features)
2. System filters trails by hard constraints
3. Calculates drive time using haversine distance
4. Runs decision engine on each candidate trail
5. Scores trails with bonuses/penalties
6. Applies MMR for diversity
7. Returns top 5 with explanations

### LLM Parsing Flow
1. Trip report text submitted
2. Structured prompt sent to Groq API (Llama 3.1 70B)
3. JSON response parsed
4. Confidence check (>= 0.5)
5. Data inserted into trail_conditions

## Setup Instructions

### 1. Install New Dependencies
```bash
cd trailsense/backend
pip install -r requirements.txt
```

### 2. Add Groq API Key
Get a free API key from [console.groq.com](https://console.groq.com)

Add to `.env`:
```
GROQ_API_KEY=your-groq-api-key-here
```

### 3. Run Database Migration
```bash
alembic upgrade head
```

### 4. Restart Server
```bash
uvicorn app.main:app --reload
```

## Testing the New Features

### Test Assessment
```bash
curl -X POST http://localhost:8000/api/assessments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trail_id": "TRAIL_UUID",
    "date": "2026-01-20",
    "gear": ["microspikes", "trekking_poles"]
  }'
```

Expected response:
```json
{
  "assessment_id": "uuid",
  "confidence_score": 73.5,
  "recommendation": "caution",
  "breakdown": {
    "capability": {"status": "good", "notes": "Within your range"},
    "weather": {"status": "warning", "notes": "Storms after 2pm"},
    "conditions": {"status": "good", "notes": "Trail clear"},
    "gear": {"status": "good", "notes": "All recommended gear available"}
  },
  "concerns": ["Start early to avoid afternoon storms"],
  "estimated_time_hours": 5.5,
  "weather_summary": {...},
  "recent_reports": [...]
}
```

### Test Recommendations
```bash
curl -X POST http://localhost:8000/api/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-01-20",
    "max_distance": 15,
    "max_elevation_gain": 3500,
    "max_drive_time_minutes": 120,
    "terrain_preferences": ["alpine"],
    "desired_features": ["lake", "summit"],
    "avoid": ["crowds"],
    "difficulty": "moderate"
  }'
```

Expected response:
```json
{
  "recommendations": [
    {
      "trail": {...},
      "confidence_score": 78,
      "drive_time_minutes": 90,
      "why_recommended": "Great match for your fitness level. Has lake, summit. Usually uncrowded.",
      "concerns": [],
      "weather_summary": {...}
    },
    ...
  ],
  "message": null
}
```

### Test Condition Entry
```bash
curl -X POST http://localhost:8000/api/trails/TRAIL_UUID/conditions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "report_date": "2026-01-15",
    "trail_status": "snowy",
    "snow_level_ft": 11000,
    "required_gear": ["microspikes"],
    "notes": "Snow above treeline, microspikes recommended"
  }'
```

### Test Hike Logging
```bash
curl -X POST http://localhost:8000/api/hikes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trail_id": "TRAIL_UUID",
    "hike_date": "2026-01-18",
    "completed": true,
    "difficulty_rating": 3,
    "time_taken_hours": 5.5,
    "notes": "Great day, perfect conditions!"
  }'
```

## Key Implementation Details

### Hard Rules
- Trail closed = 0% confidence
- Lightning risk on exposed trail = max 30%
- Missing critical gear (microspikes on ice) = max 25%
- Time exceeds capacity by 50% = max 40%
- Elevation gain exceeds experience by 30% = max 50%

### Naismith's Rule
- Base time: distance / pace (slow=2mph, moderate=3mph, fast=4mph)
- Climb penalty: elevation_gain / 2000 hours
- Total = base_time + climb_penalty

### Scoring Bonuses
- Terrain match: +10 points
- Each feature match: +5 points
- Avoid penalties: -15 points each

### MMR Diversity
If top 2 recommendations have identical terrain types, the algorithm searches for a different terrain type to include as the 3rd recommendation.

## Code Quality

All Phase 2 code follows professional standards:
- Type hints throughout
- Async/await for database operations
- Pydantic validation on all endpoints
- Clear separation of concerns (routes → services → models)
- Comprehensive error handling
- No console emojis (per style guide)

## API Documentation

Visit [http://localhost:8000/docs](http://localhost:8000/docs) to see interactive API documentation with all new endpoints.

## Next Steps

Phase 2 is complete! Next phases:

**Phase 3**: React frontend with design system integration
**Phase 4**: Assessment UI, recommendations UI, deployment

## Files Added/Modified

### New Files
- `app/models/condition.py`
- `app/models/assessment.py`
- `app/models/hike_log.py`
- `app/services/decision_engine.py`
- `app/services/llm_service.py`
- `app/services/scraper_service.py`
- `app/services/recommendation_service.py`
- `app/routes/assessments.py`
- `app/routes/recommendations.py`
- `app/routes/conditions.py`
- `app/routes/hikes.py`
- `alembic/versions/002_add_intelligence_tables.py`

### Modified Files
- `app/models/__init__.py` - Added new model imports
- `app/main.py` - Registered new routes
- `app/config.py` - Added GROQ_API_KEY setting
- `requirements.txt` - Added beautifulsoup4, lxml
- `.env.example` - Added GROQ_API_KEY

## Troubleshooting

### Migration fails
```bash
alembic downgrade -1
alembic upgrade head
```

### Import errors
Make sure virtual environment is activated and dependencies installed:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

### Groq API errors
- Verify API key is correct in `.env`
- Check [status.groq.com](https://status.groq.com) for service status
- Ensure httpx is installed

---

**Status**: Phase 2 ✅ Complete
**Ready for**: Phase 3 (Frontend development)
