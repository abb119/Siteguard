import asyncio
import os
import time
from collections import deque
from typing import Deque, Dict

from fastapi import HTTPException


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> None:
        now = time.time()
        async with self._lock:
            bucket = self._hits.setdefault(key, deque())
            while bucket and now - bucket[0] > self.window_seconds:
                bucket.popleft()

            if len(bucket) >= self.max_requests:
                retry_after = max(1, int(self.window_seconds - (now - bucket[0])))
                raise RateLimitExceeded(retry_after)

            bucket.append(now)


MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "5"))
WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))
rate_limiter = InMemoryRateLimiter(MAX_REQUESTS, WINDOW_SECONDS)


async def enforce_rate_limit(key: str) -> None:
    try:
        await rate_limiter.check(key)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please retry later.",
            headers={"Retry-After": str(int(exc.retry_after))},
        ) from exc
