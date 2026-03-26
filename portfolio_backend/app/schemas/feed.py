from datetime import datetime
from pydantic import BaseModel, Field


class FeedItem(BaseModel):
    id: str
    source: str = Field(default='linkedin')
    sourceLabel: str = Field(default='LinkedIn')
    title: str
    excerpt: str
    publishedAt: str
    displayDate: str
    internalSlug: str | None = None
    externalUrl: str


class FeedResponse(BaseModel):
    items: list[FeedItem]


class PostCreate(BaseModel):
    text: str
    url: str
    title: str | None = None
    published_at: datetime | None = None


class PostCreated(BaseModel):
    id: int
    provider_post_id: str
    title: str
