"""
Honeytoken factory + trigger handler.
Generates tokens, detects access, emits SecurityEvents + WS broadcasts.
"""
import hashlib
import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.app.security.honeytokens.models import HoneyToken, HoneyTokenEvent
from app.app.security.common.models import SecurityEvent
from app.app.security.common.ws import get_broadcaster


# ── Token generators ──────────────────────────────
def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _generate_canary_url() -> Dict:
    token_id = str(uuid.uuid4())
    return {
        "type": "canary_url",
        "value": f"/api/security/honeytokens/canary/{token_id}",
        "placement": "Shared internal wiki / README",
        "severity": "crit",
        "metadata": {"description": "Canary URL — any access is 100% malicious"},
    }


def _generate_fake_api_key() -> Dict:
    key = f"sk-siteguard-{secrets.token_hex(16)}"
    return {
        "type": "fake_api_key",
        "value": key,
        "placement": "Leaked credentials store / .env.example",
        "severity": "crit",
        "metadata": {"description": "Fake API key — usage confirms credential theft"},
    }


def _generate_decoy_login() -> Dict:
    username = f"admin_backup_{secrets.token_hex(4)}"
    return {
        "type": "decoy_login",
        "value": username,
        "placement": "Hidden admin account (no real privileges)",
        "severity": "high",
        "metadata": {"description": "Decoy admin login — login attempt = intrusion"},
    }


def _generate_decoy_doc() -> Dict:
    doc_id = str(uuid.uuid4())[:8]
    return {
        "type": "decoy_doc",
        "value": f"Confidential_Report_{doc_id}.pdf",
        "placement": "Shared drive / document repository",
        "severity": "high",
        "metadata": {"description": "Decoy document with embedded canary link"},
    }


# ── Pack creation ─────────────────────────────────
async def create_token_pack(db: AsyncSession, placement: str = "Production") -> Dict:
    """Create a pack of 4 honeytokens (one of each type)."""
    pack_id = str(uuid.uuid4())[:12]
    generators = [_generate_canary_url, _generate_fake_api_key, _generate_decoy_login, _generate_decoy_doc]

    tokens = []
    for gen in generators:
        data = gen()
        token = HoneyToken(
            type=data["type"],
            value_hash=_hash(data["value"]),
            value_plain=data["value"],
            placement=data.get("placement", placement),
            severity=data.get("severity", "high"),
            metadata_json=json.dumps(data.get("metadata", {})),
            pack_id=pack_id,
        )
        db.add(token)
        tokens.append(token)

    # Also create audit event
    event = SecurityEvent(
        type="honeytoken",
        severity="low",
        title="Honeytoken Pack Created",
        summary=f"Pack {pack_id} with 4 tokens deployed to {placement}",
        payload_json=json.dumps({"pack_id": pack_id, "token_count": 4}),
    )
    db.add(event)
    await db.commit()

    for t in tokens:
        await db.refresh(t)
    await db.refresh(event)

    # Broadcast
    await get_broadcaster().broadcast(event.to_dict())

    return {"pack_id": pack_id, "tokens": [t.to_dict() for t in tokens]}


# ── Trigger handling ──────────────────────────────
async def trigger_token(
    db: AsyncSession,
    token: HoneyToken,
    source_ip: str = "unknown",
    user_agent: str = "unknown",
    context: Optional[Dict] = None,
) -> Dict:
    """Record a hit on a honeytoken and emit critical security event."""
    # Create hit event
    hit = HoneyTokenEvent(
        token_id=token.id,
        source_ip=source_ip,
        user_agent=user_agent,
        context_json=json.dumps(context or {}),
    )
    db.add(hit)

    # Create security event (CRIT)
    sec_event = SecurityEvent(
        type="honeytoken",
        severity="crit",
        title=f"🚨 Honeytoken Triggered: {token.type}",
        summary=f"Token '{token.value_plain}' accessed from {source_ip}. Confidence: 99%",
        payload_json=json.dumps({
            "token_id": token.id,
            "token_type": token.type,
            "source_ip": source_ip,
            "user_agent": user_agent,
            "confidence": 0.99,
        }),
    )
    db.add(sec_event)
    await db.commit()
    await db.refresh(hit)
    await db.refresh(sec_event)

    # Broadcast to SOC dashboard
    await get_broadcaster().broadcast(sec_event.to_dict())

    return {
        "triggered": True,
        "event": sec_event.to_dict(),
        "hit": hit.to_dict(),
    }
