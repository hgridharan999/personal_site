from sqlalchemy import Column, String, Integer, DECIMAL, Boolean, TIMESTAMP, ARRAY, Text, func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class Trail(Base):
    __tablename__ = "trails"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    region = Column(String)
    trailhead_lat = Column(DECIMAL(9, 6), nullable=False)
    trailhead_lon = Column(DECIMAL(9, 6), nullable=False)
    trailhead_elevation = Column(Integer)
    highest_point_elevation = Column(Integer)
    distance_miles = Column(DECIMAL(5, 2), nullable=False)
    elevation_gain_ft = Column(Integer, nullable=False)
    trail_type = Column(String)
    difficulty = Column(String, index=True)
    technical_class = Column(Integer, default=1)
    exposure_level = Column(Integer, default=1)
    terrain_types = Column(ARRAY(String), default=[])
    features = Column(ARRAY(String), default=[])
    typical_crowd_level = Column(Integer, default=3)
    dogs_allowed = Column(Boolean, default=True)
    fee_required = Column(Boolean, default=False)
    best_months = Column(ARRAY(Integer), default=[])
    estimated_time_hours = Column(DECIMAL(4, 2))
    route_description = Column(Text)
    required_gear = Column(ARRAY(String), default=[])
    photos = Column(ARRAY(String), default=[])
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
