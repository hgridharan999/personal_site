from sqlalchemy import Column, String, Date, ForeignKey, ARRAY, DECIMAL, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid

from app.database import Base


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trail_id = Column(UUID(as_uuid=True), ForeignKey("trails.id", ondelete="CASCADE"), nullable=False)
    assessment_date = Column(Date, nullable=False)
    confidence_score = Column(DECIMAL(5, 2), nullable=False)
    recommendation = Column(String, nullable=False)
    breakdown = Column(JSONB, nullable=False)
    concerns = Column(ARRAY(String), default=list)
    created_at = Column(TIMESTAMP, server_default=func.now())
