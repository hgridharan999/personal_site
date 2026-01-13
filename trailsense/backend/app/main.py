from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import auth, profile, trails, weather

app = FastAPI(
    title="TrailSense API",
    description="Hiking decision support system API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(trails.router)
app.include_router(weather.router)


@app.get("/")
async def root():
    return {
        "message": "TrailSense API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
