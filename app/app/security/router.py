"""
Master security router — mounts all sub-module routers and provides
shared endpoints: unified event WS stream, event history, audit log.
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.db.database import get_db
from app.app.security.common.models import SecurityEvent, SecurityAudit
from app.app.security.common.schemas import SecurityEventOut, SecurityAuditOut
from app.app.security.common.ws import get_broadcaster

router = APIRouter(tags=["security"])


# ── Unified WebSocket event stream ─────────────────
@router.websocket("/ws/events")
async def ws_security_events(websocket: WebSocket):
    """Real-time SOC feed — every SecurityEvent is pushed here."""
    broadcaster = get_broadcaster()
    await broadcaster.connect(websocket)
    try:
        while True:
            # Keep connection alive; client doesn't need to send data
            await websocket.receive_text()
    except WebSocketDisconnect:
        await broadcaster.disconnect(websocket)
    except Exception:
        await broadcaster.disconnect(websocket)


# ── REST: Event history ─────────────────────────────
@router.get("/events", response_model=List[SecurityEventOut])
async def list_events(
    type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(SecurityEvent)
    if type:
        query = query.where(SecurityEvent.type == type)
    if severity:
        query = query.where(SecurityEvent.severity == severity)
    query = query.order_by(desc(SecurityEvent.ts)).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [SecurityEventOut(**r.to_dict()) for r in rows]


# ── REST: Audit log ─────────────────────────────────
@router.get("/audit", response_model=List[SecurityAuditOut])
async def list_audit(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(SecurityAudit).order_by(desc(SecurityAudit.ts)).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [SecurityAuditOut(**r.to_dict()) for r in rows]


# ── REST: Summary / stats ──────────────────────────
@router.get("/stats")
async def security_stats(db: AsyncSession = Depends(get_db)):
    """Quick summary for the Security Dashboard cards."""
    from sqlalchemy import func

    total_q = await db.execute(select(func.count(SecurityEvent.id)))
    total = total_q.scalar() or 0

    crit_q = await db.execute(
        select(func.count(SecurityEvent.id)).where(SecurityEvent.severity == "crit")
    )
    crit = crit_q.scalar() or 0

    high_q = await db.execute(
        select(func.count(SecurityEvent.id)).where(SecurityEvent.severity == "high")
    )
    high = high_q.scalar() or 0

    return {
        "total_events": total,
        "critical": crit,
        "high": high,
        "ws_clients": get_broadcaster().client_count,
    }


# ── Mount sub-routers (lazy to avoid circular imports) ──
def mount_sub_routers():
    """Called once from main.py after all modules are imported."""
    from app.app.security.honeytokens.routes import honeytoken_router
    from app.app.security.attack_graph.routes import attack_graph_router
    from app.app.security.llm_gateway.routes import llm_router

    router.include_router(honeytoken_router, prefix="/honeytokens")
    router.include_router(attack_graph_router, prefix="/attack-graph")
    router.include_router(llm_router, prefix="/llm")
