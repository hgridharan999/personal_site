from sqlalchemy import Column, String, Integer, Date, ForeignKey, ARRAY, DECIMAL, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base


class TrailCondition(Base):
    __tablename__ = "trail_conditions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trail_id = Column(UUID(as_uuid=True), ForeignKey("trails.id", ondelete="CASCADE"), nullable=False)
    report_date = Column(Date, nullable=False)
    snow_level_ft = Column(Integer, nullable=True)
    trail_status = Column(String, nullable=True)
    mud_level = Column(String, nullable=True)
    water_crossing_status = Column(String, nullable=True)
    hazards = Column(ARRAY(String), default=list)
    required_gear = Column(ARRAY(String), default=list)
    difficulty_sentiment = Column(String, nullable=True)
    overall_sentiment = Column(String, nullable=True)
    source = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    raw_text = Column(Text, nullable=True)
    confidence = Column(DECIMAL(3, 2), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
