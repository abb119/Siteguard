import asyncio
import os
import sys

# Add the parent directory to sys.path to allow imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.app.db.database import AsyncSessionLocal
from app.app.db.models import User
from app.app.auth.jwt import get_password_hash
from sqlalchemy import select

async def seed_users():
    print("Seeding database with initial users...")
    async with AsyncSessionLocal() as session:
        # Check if admin user exists
        result = await session.execute(select(User).where(User.username == "admin"))
        user = result.scalars().first()
        
        if not user:
            print("Creating admin user...")
            hashed_password = get_password_hash("admin123")
            new_user = User(
                username="admin",
                email="admin@siteguard.com",
                hashed_password=hashed_password,
                is_active=True,
                disabled=False
            )
            session.add(new_user)
            await session.commit()
            print("Admin user created successfully.")
        else:
            print("Admin user already exists.")

if __name__ == "__main__":
    asyncio.run(seed_users())
