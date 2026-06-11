"""
Auth hierarchy endpoints (invitation-only signup):

  admin   -> creates companies (each with its manager user, role=company)
  company -> creates workers (role=worker) inside its own company
  worker  -> logs in; the live monitor stores events under their username

Multi-tenant scoping: a company manager can only see its own workers and their
events. Driver events are linked to workers through DriverEvent.session_id ==
worker username (no schema change needed for events).
"""
from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as safunc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.auth.jwt import get_current_active_user, get_password_hash, require_roles
from app.app.db.database import get_db
from app.app.db.models import Company, DriverEvent, User
from app.app.schemas import (
    CompanyCreate,
    CompanyOut,
    MeOut,
    UserOut,
    WorkerCreate,
    WorkerOut,
)

router = APIRouter(tags=["auth"])

# Same weights as the trip report in routes.py
SAFETY_WEIGHTS: Dict[str, int] = {
    "MICROSLEEP": 18, "DROWSY": 10, "PHONE": 8, "DISTRACTION": 6,
    "LOOK_DOWN": 6, "DRINKING": 4, "NO_FACE": 3, "YAWN": 2, "NO_SEATBELT": 8,
}


async def _username_taken(db: AsyncSession, username: str) -> bool:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalars().first() is not None


# ── Current user ─────────────────────────────────────────────────────
@router.get("/users/me", response_model=MeOut)
async def get_me(
    current: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company_name = None
    if current.company_id:
        company = await db.get(Company, current.company_id)
        company_name = company.name if company else None
    return MeOut(
        id=current.id, username=current.username, full_name=current.full_name,
        email=current.email, role=current.role, company_id=current.company_id,
        disabled=current.disabled, company_name=company_name,
    )


# ── Admin: companies ─────────────────────────────────────────────────
@router.post("/admin/companies", response_model=CompanyOut, status_code=201)
async def create_company(
    payload: CompanyCreate,
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Company).where(Company.name == payload.name))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Company already exists")
    if await _username_taken(db, payload.manager_username):
        raise HTTPException(status_code=409, detail="Username already taken")

    company = Company(name=payload.name)
    db.add(company)
    await db.flush()

    manager = User(
        username=payload.manager_username,
        full_name=payload.manager_full_name,
        hashed_password=get_password_hash(payload.manager_password),
        role="company",
        company_id=company.id,
        is_active=True,
        disabled=False,
    )
    db.add(manager)
    await db.commit()
    await db.refresh(company)
    return CompanyOut(id=company.id, name=company.name, workers=0, manager=manager.username)


@router.get("/admin/companies", response_model=List[CompanyOut])
async def list_companies(
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    companies = (await db.execute(select(Company).order_by(Company.id))).scalars().all()
    out: List[CompanyOut] = []
    for c in companies:
        workers = (await db.execute(
            select(safunc.count(User.id)).where(User.company_id == c.id, User.role == "worker")
        )).scalar() or 0
        manager_row = (await db.execute(
            select(User.username).where(User.company_id == c.id, User.role == "company")
        )).scalars().first()
        out.append(CompanyOut(id=c.id, name=c.name, workers=workers, manager=manager_row))
    return out


@router.get("/admin/users", response_model=List[UserOut])
async def list_all_users(
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    return (await db.execute(select(User).order_by(User.id))).scalars().all()


# ── Company: workers ─────────────────────────────────────────────────
@router.post("/company/workers", response_model=WorkerOut, status_code=201)
async def create_worker(
    payload: WorkerCreate,
    manager: User = Depends(require_roles("company")),
    db: AsyncSession = Depends(get_db),
):
    if await _username_taken(db, payload.username):
        raise HTTPException(status_code=409, detail="Username already taken")
    worker = User(
        username=payload.username,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role="worker",
        company_id=manager.company_id,
        is_active=True,
        disabled=False,
    )
    db.add(worker)
    await db.commit()
    await db.refresh(worker)
    return WorkerOut(
        id=worker.id, username=worker.username, full_name=worker.full_name,
        email=worker.email, role=worker.role, company_id=worker.company_id,
        disabled=worker.disabled, events=0, safety_score=100,
    )


@router.get("/company/workers", response_model=List[WorkerOut])
async def list_workers(
    manager: User = Depends(require_roles("company", "admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.role == "worker")
    if manager.role == "company":
        query = query.where(User.company_id == manager.company_id)
    workers = (await db.execute(query.order_by(User.id))).scalars().all()

    out: List[WorkerOut] = []
    for w in workers:
        events = (await db.execute(
            select(DriverEvent.event_type).where(DriverEvent.session_id == w.username)
        )).scalars().all()
        penalty = sum(SAFETY_WEIGHTS.get(t, 3) for t in events)
        out.append(WorkerOut(
            id=w.id, username=w.username, full_name=w.full_name, email=w.email,
            role=w.role, company_id=w.company_id, disabled=w.disabled,
            events=len(events), safety_score=max(0, 100 - penalty),
        ))
    return out
