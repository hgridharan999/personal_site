from sqlalchemy import Column, String, DECIMAL, TIMESTAMP, ARRAY, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String)
    profile = Column(JSONB, nullable=False, default={})
    gear_inventory = Column(ARRAY(String), default=[])
    current_fatigue = Column(DECIMAL(3, 2), default=0.0)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
