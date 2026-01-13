from sqlalchemy import Column, String, Integer, Date, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class WeatherForecast(Base):
    __tablename__ = "weather_forecasts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    trail_id = Column(UUID(as_uuid=True), ForeignKey("trails.id", ondelete="CASCADE"), nullable=False)
    location_type = Column(String, nullable=False)
    forecast_date = Column(Date, nullable=False)
    forecast_hour = Column(Integer, nullable=False)
    temperature_f = Column(Integer)
    precipitation_prob = Column(Integer)
    precipitation_type = Column(String)
    wind_speed_mph = Column(Integer)
    wind_gust_mph = Column(Integer)
    sky_cover = Column(Integer)
    weather_summary = Column(String)
    fetched_at = Column(TIMESTAMP, server_default=func.now())
