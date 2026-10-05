"""Small async compatibility layer for FinFlow's pre-existing FastAPI routes.

The iOS app already ships a custom `/api/*` contract.  This layer lets the
routes retain their response shapes while using Supabase Auth and PostgREST
instead of the retired MongoDB service.  It is deliberately server-only: the
Supabase secret key must never reach Expo clients.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import os
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException


_FIELD_MAP: dict[str, dict[str, str]] = {
    "settings": {"pctNeeds": "pct_needs", "pctWants": "pct_wants", "pctSavings": "pct_savings", "lastRecurringMonth": "last_recurring_month"},
    "expenses": {"date": "expense_date"},
    "ai_messages": {"timestamp": "created_at"},
    "ai_insights": {"date": "insight_date"},
    "plaid_items": {"item_id": "plaid_item_id", "access_token": "access_token_ciphertext"},
    "bills": {"dueDay": "due_day"},
}


def _wire_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _to_wire(table: str, record: dict[str, Any]) -> dict[str, Any]:
    mapping = _FIELD_MAP.get(table, {})
    return {mapping.get(key, key): _wire_value(value) for key, value in record.items() if key != "_id"}


def _from_wire(table: str, record: dict[str, Any]) -> dict[str, Any]:
    reverse = {value: key for key, value in _FIELD_MAP.get(table, {}).items()}
    converted = {reverse.get(key, key): value for key, value in record.items()}
    if "id" in converted:
        converted["_id"] = converted["id"]
    for key in ("created_at", "updated_at", "last_synced_at", "imported_at"):
        value = converted.get(key)
        if isinstance(value, str):
            try:
                converted[key] = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                pass
    return converted


@dataclass
class WriteResult:
    inserted_id: str | None = None
    matched_count: int = 0
    deleted_count: int = 0


class Cursor:
    def __init__(self, collection: "Collection", query: dict[str, Any]):
        self.collection = collection
        self.query = query
        self.order: tuple[str, bool] | None = None

    def sort(self, field: str, direction: int):
        self.order = (field, direction >= 0)
        return self

    async def to_list(self, length: int = 1000):
        return await self.collection._select(self.query, limit=length, order=self.order)


class Collection:
    def __init__(self, store: "SupabaseStore", table: str):
        self.store = store
        self.table = table

    def find(self, query: dict[str, Any], _projection: dict[str, Any] | None = None) -> Cursor:
        return Cursor(self, query)

    async def find_one(self, query: dict[str, Any], _projection: dict[str, Any] | None = None):
        rows = await self._select(query, limit=1)
        return rows[0] if rows else None

    async def _select(self, query: dict[str, Any], limit: int, order: tuple[str, bool] | None = None):
        params = self.store.filters(self.table, query)
        params["limit"] = str(limit)
        if order:
            field = _FIELD_MAP.get(self.table, {}).get(order[0], order[0])
            params["order"] = f"{field}.{'asc' if order[1] else 'desc'}"
        response = await self.store.request("GET", f"/rest/v1/{self.table}", params=params)
        return [_from_wire(self.table, item) for item in response.json()]

    async def insert_one(self, record: dict[str, Any]) -> WriteResult:
        response = await self.store.request(
            "POST", f"/rest/v1/{self.table}", json=[_to_wire(self.table, record)], prefer="return=representation"
        )
        rows = response.json()
        return WriteResult(inserted_id=str(rows[0].get("id")) if rows else record.get("id"))

    async def delete_one(self, query: dict[str, Any]) -> WriteResult:
        response = await self.store.request("DELETE", f"/rest/v1/{self.table}", params=self.store.filters(self.table, query), prefer="return=representation")
        return WriteResult(deleted_count=len(response.json()))

    async def delete_many(self, query: dict[str, Any]) -> WriteResult:
        response = await self.store.request("DELETE", f"/rest/v1/{self.table}", params=self.store.filters(self.table, query), prefer="return=representation")
        return WriteResult(deleted_count=len(response.json()))

    async def update_one(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False) -> WriteResult:
        changes = dict(update.get("$set", {}))
        if "$push" in update:
            current = await self.find_one(query)
            if not current:
                raise HTTPException(status_code=404, detail="Record not found")
            for key, value in update["$push"].items():
                changes[key] = [*(current.get(key) or []), value]
        if upsert:
            current = await self.find_one(query)
            if not current:
                seed = {**query, **update.get("$setOnInsert", {}), **changes}
                return await self.insert_one(seed)
        response = await self.store.request(
            "PATCH", f"/rest/v1/{self.table}", params=self.store.filters(self.table, query),
            json=_to_wire(self.table, changes), prefer="return=representation",
        )
        return WriteResult(matched_count=len(response.json()))


class UsersCollection:
    def __init__(self, store: "SupabaseStore"):
        self.store = store

    async def find_one(self, query: dict[str, Any], _projection: dict[str, Any] | None = None):
        if query.get("_id"):
            return await self.store.user_by_id(str(query["_id"]))
        raise HTTPException(status_code=500, detail="Email user lookups are not supported after the Supabase cutover")

    async def insert_one(self, record: dict[str, Any]) -> WriteResult:
        user = await self.store.create_user(record["email"], record["password"], record.get("name", "User"), record.get("role", "user"))
        return WriteResult(inserted_id=user["_id"])

    async def delete_one(self, query: dict[str, Any]) -> WriteResult:
        await self.store.delete_user(str(query["_id"]))
        return WriteResult(deleted_count=1)


class SupabaseStore:
    """Server-side client. Fails closed if its production secrets are absent."""
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.secret = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.users = UsersCollection(self)
        for table in ("settings", "bills", "expenses", "savings_goals", "ai_messages", "ai_insights", "watchlist", "plaid_items", "plaid_transactions", "support_tickets"):
            setattr(self, table, Collection(self, table))

    @property
    def configured(self) -> bool:
        return bool(self.url and self.secret)

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        if not self.configured:
            raise HTTPException(status_code=503, detail="FinFlow is being configured. Please try again shortly.")
        headers = {"apikey": self.secret, "Authorization": f"Bearer {self.secret}", "Content-Type": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def request(self, method: str, path: str, **kwargs):
        prefer = kwargs.pop("prefer", None)
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(method, f"{self.url}{path}", headers=self._headers(prefer), **kwargs)
        if response.status_code == 409:
            raise HTTPException(status_code=409, detail="A record with those values already exists")
        if response.is_error:
            raise HTTPException(status_code=502, detail="Database service unavailable")
        return response

    def filters(self, table: str, query: dict[str, Any]) -> dict[str, str]:
        params: dict[str, str] = {}
        mapping = _FIELD_MAP.get(table, {})
        for key, value in query.items():
            field = mapping.get(key, key)
            if isinstance(value, dict) and "$in" in value:
                params[field] = "in.(" + ",".join(quote(str(v), safe="") for v in value["$in"]) + ")"
            elif isinstance(value, dict) and "$regex" in value:
                prefix = str(value["$regex"]).removeprefix("^")
                params[field] = f"like.{quote(prefix, safe='')}%"
            elif isinstance(value, dict) and "$gte" in value:
                params[field] = f"gte.{quote(str(value['$gte']), safe='')}"
            else:
                params[field] = f"eq.{quote(str(_wire_value(value)).lower() if isinstance(value, bool) else str(_wire_value(value)), safe='')}"
        return params

    async def create_user(self, email: str, password: str, name: str, role: str = "user") -> dict[str, Any]:
        response = await self.request("POST", "/auth/v1/admin/users", json={"email": email, "password": password, "email_confirm": True, "user_metadata": {"name": name}})
        user = response.json()
        user_id = user["id"]
        try:
            await self.request("POST", "/rest/v1/profiles", json=[{"id": user_id, "name": name, "role": role}], prefer="return=representation")
            await self.settings.insert_one({"user_id": user_id, "salary": 5000, "currency": "$", "pctNeeds": 50, "pctWants": 30, "pctSavings": 20})
        except Exception:
            await self.delete_user(user_id)
            raise
        return {"_id": user_id, "id": user_id, "email": email, "name": name, "role": role}

    async def delete_user(self, user_id: str) -> None:
        await self.request("DELETE", f"/auth/v1/admin/users/{quote(user_id, safe='')}")

    async def user_by_id(self, user_id: str) -> dict[str, Any] | None:
        profile = await self.request("GET", "/rest/v1/profiles", params={"id": f"eq.{user_id}", "limit": "1"})
        rows = profile.json()
        if not rows:
            return None
        row = rows[0]
        return {"_id": row["id"], "id": row["id"], "name": row["name"], "role": row.get("role", "user"), "created_at": row.get("created_at")}

    async def admin_user_by_email(self, email: str) -> dict[str, Any] | None:
        """Find an Auth user for bootstrap only; normal login uses Auth directly."""
        response = await self.request("GET", "/auth/v1/admin/users", params={"page": "1", "per_page": "1000"})
        for user in response.json().get("users", []):
            if user.get("email", "").lower() == email.lower():
                return user
        return None

    async def ensure_admin(self, email: str, password: str) -> None:
        existing = await self.admin_user_by_email(email)
        if existing:
            user_id = existing["id"]
            await self.request(
                "PUT", f"/auth/v1/admin/users/{quote(user_id, safe='')}",
                json={"password": password, "email_confirm": True},
            )
            await self.request(
                "POST", "/rest/v1/profiles",
                json=[{"id": user_id, "name": existing.get("user_metadata", {}).get("name") or "Admin", "role": "admin"}],
                prefer="resolution=merge-duplicates,return=representation",
            )
            return
        await self.create_user(email, password, "Admin", "admin")

    async def session_for_password(self, email: str, password: str) -> dict[str, Any]:
        response = await self.request("POST", "/auth/v1/token?grant_type=password", json={"email": email, "password": password})
        return response.json()

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        response = await self.request("POST", "/auth/v1/token?grant_type=refresh_token", json={"refresh_token": refresh_token})
        return response.json()

    async def current_user(self, access_token: str) -> dict[str, Any]:
        if not self.configured:
            raise HTTPException(status_code=503, detail="FinFlow is being configured. Please try again shortly.")
        headers = {"apikey": self.secret, "Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{self.url}/auth/v1/user", headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")
        auth_user = response.json()
        profile = await self.user_by_id(auth_user["id"])
        if not profile:
            raise HTTPException(status_code=401, detail="User profile not found")
        profile["email"] = auth_user.get("email", "")
        return profile
