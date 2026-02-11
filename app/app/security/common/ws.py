"""
WebSocket broadcaster for real-time security events.
Manages connected clients and fans out every SecurityEvent to all listeners.
"""
import asyncio
import json
from typing import List
from fastapi import WebSocket


class SecurityEventBroadcaster:
    """Singleton broadcaster — call `.connect()` / `.disconnect()` per WS client,
    and `.broadcast(event_dict)` whenever a new SecurityEvent is created."""

    def __init__(self):
        self._clients: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._clients.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self._clients:
                self._clients.remove(ws)

    async def broadcast(self, event_dict: dict):
        """Send event to every connected client. Silently drops dead connections."""
        async with self._lock:
            dead: List[WebSocket] = []
            for ws in self._clients:
                try:
                    await ws.send_json(event_dict)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._clients.remove(ws)

    @property
    def client_count(self) -> int:
        return len(self._clients)


# Module-level singleton
_broadcaster: SecurityEventBroadcaster | None = None


def get_broadcaster() -> SecurityEventBroadcaster:
    global _broadcaster
    if _broadcaster is None:
        _broadcaster = SecurityEventBroadcaster()
    return _broadcaster
