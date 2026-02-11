"""
Honeytoken API routes.
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.db.database import get_db
from app.app.security.honeytokens.models import HoneyToken, HoneyTokenEvent
from app.app.security.honeytokens.schemas import (
    TokenOut, PackCreateRequest, PackCreateResponse,
    EventOut, PlaybookRequest, PlaybookResult,
    DecoyLoginRequest, FakeKeyRequest,
)
from app.app.security.honeytokens.service import create_token_pack, trigger_token
from app.app.security.honeytokens.playbooks import run_playbook

honeytoken_router = APIRouter(tags=["honeytokens"])


# ── Create token pack ─────────────────────────────
@honeytoken_router.post("/packs/create", response_model=PackCreateResponse)
async def create_pack(body: PackCreateRequest, db: AsyncSession = Depends(get_db)):
    result = await create_token_pack(db, body.placement)
    return result


# ── List all tokens ───────────────────────────────
@honeytoken_router.get("/tokens", response_model=List[TokenOut])
async def list_tokens(
    pack_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(HoneyToken)
    if pack_id:
        query = query.where(HoneyToken.pack_id == pack_id)
    query = query.order_by(desc(HoneyToken.created_at))
    result = await db.execute(query)
    rows = result.scalars().all()
    return [TokenOut(**t.to_dict()) for t in rows]


# ── Get events for a token ────────────────────────
@honeytoken_router.get("/events", response_model=List[EventOut])
async def list_events(
    token_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(HoneyTokenEvent)
    if token_id:
        query = query.where(HoneyTokenEvent.token_id == token_id)
    query = query.order_by(desc(HoneyTokenEvent.ts)).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [EventOut(**e.to_dict()) for e in rows]


# ── Canary URL trigger ───────────────────────────
@honeytoken_router.get("/canary/{token_uuid}")
async def canary_trigger(token_uuid: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Any access to this URL = confirmed malicious activity."""
    # Find token by matching the UUID in value_plain
    canary_path = f"/api/security/honeytokens/canary/{token_uuid}"
    result = await db.execute(
        select(HoneyToken).where(
            HoneyToken.type == "canary_url",
            HoneyToken.value_plain == canary_path,
            HoneyToken.revoked == False,
        )
    )
    token = result.scalars().first()

    if not token:
        return {"status": "not_found", "message": "Unknown canary token"}

    source_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    trigger_result = await trigger_token(
        db, token,
        source_ip=source_ip,
        user_agent=user_agent,
        context={"path": canary_path, "method": "GET"},
    )
    # Return innocuous 404 to attacker
    return {"detail": "Not Found"}


# ── Fake API key trigger ─────────────────────────
@honeytoken_router.post("/demo/use-key")
async def fake_key_trigger(body: FakeKeyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Simulate someone using a stolen API key."""
    result = await db.execute(
        select(HoneyToken).where(
            HoneyToken.type == "fake_api_key",
            HoneyToken.value_plain == body.api_key,
            HoneyToken.revoked == False,
        )
    )
    token = result.scalars().first()

    if not token:
        return {"status": "invalid_key", "triggered": False}

    source_ip = request.client.host if request.client else "unknown"
    trigger_result = await trigger_token(
        db, token,
        source_ip=source_ip,
        user_agent=request.headers.get("user-agent", "unknown"),
        context={"api_key_used": body.api_key[:8] + "***"},
    )
    return {"status": "unauthorized", "triggered": True, "event": trigger_result["event"]}


# ── Decoy login trigger ──────────────────────────
@honeytoken_router.post("/decoy-login")
async def decoy_login_trigger(body: DecoyLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Simulate login attempt with a decoy username."""
    result = await db.execute(
        select(HoneyToken).where(
            HoneyToken.type == "decoy_login",
            HoneyToken.value_plain == body.username,
            HoneyToken.revoked == False,
        )
    )
    token = result.scalars().first()

    if not token:
        return {"status": "invalid_credentials", "triggered": False}

    source_ip = request.client.host if request.client else "unknown"
    trigger_result = await trigger_token(
        db, token,
        source_ip=source_ip,
        user_agent=request.headers.get("user-agent", "unknown"),
        context={"username": body.username, "login_attempt": True},
    )
    return {"status": "access_denied", "triggered": True, "event": trigger_result["event"]}


# ── Run playbook ──────────────────────────────────
@honeytoken_router.post("/playbooks/run", response_model=PlaybookResult)
async def execute_playbook(body: PlaybookRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HoneyToken).where(HoneyToken.id == body.token_id))
    token = result.scalars().first()
    if not token:
        return PlaybookResult(action=body.action, result="error", details={"error": "Token not found"})

    playbook_result = await run_playbook(db, token, body.action)
    return PlaybookResult(**playbook_result)


# ── Simulate trigger (for demo button) ───────────
@honeytoken_router.post("/simulate-trigger/{token_id}")
async def simulate_trigger(token_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Demo button: simulate a trigger on any token."""
    result = await db.execute(select(HoneyToken).where(HoneyToken.id == token_id))
    token = result.scalars().first()
    if not token:
        return {"error": "Token not found"}

    trigger_result = await trigger_token(
        db, token,
        source_ip="203.0.113.42",
        user_agent="Mozilla/5.0 (X11; Linux) Suspicious-Bot/1.0",
        context={"simulated": True, "demo": True},
    )
    return trigger_result
