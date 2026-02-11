"""
LLM Security Gateway API routes.
"""
import json
import os
from typing import List

import yaml
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.db.database import get_db
from app.app.security.llm_gateway.models import LlmPolicy, LlmAudit
from app.app.security.llm_gateway.schemas import (
    EvaluateRequest, EvaluateResponse, AuditOut,
    PolicyOut, ActivatePolicyRequest,
    TestSuiteResult,
)
from app.app.security.llm_gateway.service import (
    evaluate_prompt, run_test_suite, POLICIES_DIR,
)

llm_router = APIRouter(tags=["llm-gateway"])


# ── Evaluate prompt ───────────────────────────────
@llm_router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(body: EvaluateRequest, db: AsyncSession = Depends(get_db)):
    result = await evaluate_prompt(
        db, body.prompt,
        session_id=body.session_id,
        context=body.context,
        tools_requested=body.tools_requested,
    )
    return EvaluateResponse(**result)


# ── Audit log ─────────────────────────────────────
@llm_router.get("/audit", response_model=List[AuditOut])
async def get_audit(
    session_id: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(LlmAudit)
    if session_id:
        query = query.where(LlmAudit.session_id == session_id)
    query = query.order_by(desc(LlmAudit.ts)).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [AuditOut(**r.to_dict()) for r in rows]


# ── Policies ──────────────────────────────────────
@llm_router.get("/policies", response_model=List[PolicyOut])
async def list_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LlmPolicy).order_by(desc(LlmPolicy.created_at)))
    rows = result.scalars().all()

    if not rows:
        # Seed default policy from file
        path = os.path.join(POLICIES_DIR, "default.yml")
        if os.path.exists(path):
            with open(path) as f:
                yaml_text = f.read()
            policy = LlmPolicy(name="default-security-policy", yaml_text=yaml_text, active=True)
            db.add(policy)
            await db.commit()
            await db.refresh(policy)
            rows = [policy]

    return [PolicyOut(**p.to_dict()) for p in rows]


@llm_router.post("/policies/activate")
async def activate_policy(body: ActivatePolicyRequest, db: AsyncSession = Depends(get_db)):
    # Deactivate all
    result = await db.execute(select(LlmPolicy).where(LlmPolicy.active == True))
    for p in result.scalars().all():
        p.active = False

    # Activate target
    result = await db.execute(select(LlmPolicy).where(LlmPolicy.name == body.policy_name))
    policy = result.scalars().first()
    if not policy:
        return {"error": f"Policy '{body.policy_name}' not found"}

    policy.active = True
    await db.commit()
    return {"status": "activated", "policy": body.policy_name}


# ── Test suite ────────────────────────────────────
@llm_router.post("/test-suite/run", response_model=TestSuiteResult)
async def test_suite(db: AsyncSession = Depends(get_db)):
    return await run_test_suite(db)
