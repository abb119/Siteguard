"""
Pydantic schemas for honeytokens.
"""
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel


class TokenOut(BaseModel):
    id: int
    type: str
    value_preview: Optional[str] = None
    placement: Optional[str] = None
    severity: str = "high"
    metadata: Optional[Any] = None
    created_at: Optional[datetime] = None
    revoked: bool = False
    pack_id: Optional[str] = None

    class Config:
        from_attributes = True


class PackCreateRequest(BaseModel):
    placement: str = "Production Environment"


class PackCreateResponse(BaseModel):
    pack_id: str
    tokens: List[TokenOut]


class EventOut(BaseModel):
    id: int
    token_id: int
    ts: Optional[datetime] = None
    source_ip: Optional[str] = None
    user_agent: Optional[str] = None
    geo: Optional[Any] = None
    context: Optional[Any] = None

    class Config:
        from_attributes = True


class PlaybookRequest(BaseModel):
    token_id: int
    action: str           # notify | block_ip | open_incident | rotate
    simulate: bool = True


class PlaybookResult(BaseModel):
    action: str
    result: str
    details: Optional[Any] = None


class DecoyLoginRequest(BaseModel):
    username: str
    password: str


class FakeKeyRequest(BaseModel):
    api_key: str
