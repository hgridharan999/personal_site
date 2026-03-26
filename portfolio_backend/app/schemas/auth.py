from pydantic import BaseModel


class LinkedInAuthUrlResponse(BaseModel):
    authorization_url: str


class LinkedInCallbackResponse(BaseModel):
    connected: bool
    message: str


class LinkedInDisconnectResponse(BaseModel):
    disconnected: bool
    message: str
