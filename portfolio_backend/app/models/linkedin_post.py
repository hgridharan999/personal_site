from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LinkedInPost(Base):
    __tablename__ = 'linkedin_posts'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider_post_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(280))
    excerpt: Mapped[str] = mapped_column(Text)
    external_url: Mapped[str] = mapped_column(String(500))
    raw_payload: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
