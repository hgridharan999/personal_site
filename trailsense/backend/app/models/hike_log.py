from sqlalchemy import Column, String, Integer, Date, Boolean, ForeignKey, DECIMAL, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base


class HikeLog(Base):
    __tablename__ = "hike_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trail_id = Column(UUID(as_uuid=True), ForeignKey("trails.id", ondelete="SET NULL"), nullable=True)
    trail_name = Column(String, nullable=True)
    hike_date = Column(Date, nullable=False)
    completed = Column(Boolean, nullable=False)
    difficulty_rating = Column(Integer, nullable=True)
    time_taken_hours = Column(DECIMAL(4, 2), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
