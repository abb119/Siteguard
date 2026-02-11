"""
Simulated playbook actions for honeytoken incidents.
Each action is realistic enough for a demo but doesn't touch real infrastructure.
"""
import json
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.app.security.honeytokens.models import HoneyToken, PlaybookRun
from app.app.security.common.models import SecurityEvent, SecurityAudit
from app.app.security.common.ws import get_broadcaster


async def run_playbook(db: AsyncSession, token: HoneyToken, action: str) -> dict:
    """Execute a simulated playbook action and log everything."""
    handlers = {
        "notify": _action_notify,
        "block_ip": _action_block_ip,
        "open_incident": _action_open_incident,
        "rotate": _action_rotate,
    }

    handler = handlers.get(action)
    if not handler:
        return {"action": action, "result": "error", "details": {"error": f"Unknown action: {action}"}}

    result = await handler(db, token)

    # Persist playbook run
    run = PlaybookRun(
        token_id=token.id,
        action=action,
        result=result.get("result", "success"),
        details_json=json.dumps(result.get("details", {})),
    )
    db.add(run)

    # Audit trail
    audit = SecurityAudit(
        action=f"playbook.{action}",
        target=f"token:{token.id}",
        result=result.get("result", "success"),
        details_json=json.dumps({"token_type": token.type, "action": action}),
    )
    db.add(audit)
    await db.commit()

    return {"action": action, "result": result.get("result"), "details": result.get("details")}


async def _action_notify(db: AsyncSession, token: HoneyToken) -> dict:
    """Simulate webhook notification."""
    event = SecurityEvent(
        type="honeytoken",
        severity="high",
        title="📢 Notification Sent",
        summary=f"Webhook fired for token {token.id} ({token.type}). Security team alerted.",
        payload_json=json.dumps({"token_id": token.id, "channel": "webhook", "status": "delivered"}),
    )
    db.add(event)
    await db.flush()
    await get_broadcaster().broadcast(event.to_dict())
    return {"result": "success", "details": {"message": "Webhook notification sent to security team", "channel": "#security-alerts"}}


async def _action_block_ip(db: AsyncSession, token: HoneyToken) -> dict:
    """Simulate IP blocking."""
    blocked_ip = "203.0.113.42"  # Demo IP
    event = SecurityEvent(
        type="honeytoken",
        severity="high",
        title="🛡️ IP Blocked",
        summary=f"Source IP {blocked_ip} added to blocklist after token {token.id} trigger.",
        payload_json=json.dumps({"token_id": token.id, "blocked_ip": blocked_ip, "duration": "24h"}),
    )
    db.add(event)
    await db.flush()
    await get_broadcaster().broadcast(event.to_dict())
    return {"result": "success", "details": {"blocked_ip": blocked_ip, "duration": "24h", "firewall_rule": "auto-generated"}}


async def _action_open_incident(db: AsyncSession, token: HoneyToken) -> dict:
    """Create a security incident record."""
    incident_id = f"INC-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    event = SecurityEvent(
        type="honeytoken",
        severity="crit",
        title=f"🔴 Incident Opened: {incident_id}",
        summary=f"Security incident created for token {token.id} ({token.type}). Investigation required.",
        payload_json=json.dumps({
            "incident_id": incident_id,
            "token_id": token.id,
            "status": "open",
            "assigned_to": "security-team",
            "priority": "P1",
        }),
    )
    db.add(event)
    await db.flush()
    await get_broadcaster().broadcast(event.to_dict())
    return {"result": "success", "details": {"incident_id": incident_id, "status": "open", "priority": "P1"}}


async def _action_rotate(db: AsyncSession, token: HoneyToken) -> dict:
    """Revoke current token and create a replacement."""
    token.revoked = True

    event = SecurityEvent(
        type="honeytoken",
        severity="med",
        title="🔄 Token Rotated",
        summary=f"Token {token.id} ({token.type}) revoked and replaced.",
        payload_json=json.dumps({"old_token_id": token.id, "action": "revoked_and_replaced"}),
    )
    db.add(event)
    await db.flush()
    await get_broadcaster().broadcast(event.to_dict())
    return {"result": "success", "details": {"old_token_id": token.id, "status": "revoked", "new_token": "pending_creation"}}
