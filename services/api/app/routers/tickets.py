from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any
from datetime import datetime
import uuid

from app.schemas.ticket import TicketCreate, TicketResponse

router = APIRouter()

# In-memory store for initial Phase 1 testing prior to database connection
_in_memory_tickets: Dict[str, Dict[str, Any]] = {}


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def create_ticket(ticket_in: TicketCreate):
    # Enforce idempotency via external_id
    for t in _in_memory_tickets.values():
        if t["external_id"] == ticket_in.external_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ticket with external_id '{ticket_in.external_id}' already exists."
            )

    now = datetime.utcnow()
    ticket_id = str(uuid.uuid4())
    record = {
        "id": ticket_id,
        "external_id": ticket_in.external_id,
        "customer_email": ticket_in.customer_email,
        "customer_name": ticket_in.customer_name,
        "subject": ticket_in.subject,
        "message": ticket_in.message,
        "category": ticket_in.category,
        "priority": ticket_in.priority.value,
        "status": "new",
        "created_at": now,
        "updated_at": now,
        "metadata": ticket_in.metadata or {}
    }
    _in_memory_tickets[ticket_id] = record
    return record


@router.get("", response_model=List[TicketResponse])
async def list_tickets():
    from app.config import settings
    import httpx

    # 1. Fetch directly from Supabase Cloud if configured
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                headers = {
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"
                }
                res = await client.get(
                    f"{settings.SUPABASE_URL}/rest/v1/tickets?order=created_at.desc",
                    headers=headers
                )
                if res.status_code == 200:
                    records = res.json()
                    return [
                        TicketResponse(
                            id=r["id"],
                            external_id=r["external_id"],
                            customer_email=r["customer_email"],
                            customer_name=r.get("customer_name"),
                            subject=r["subject"],
                            message=r["message"],
                            category=r.get("category"),
                            priority=r.get("priority", "medium"),
                            status=r.get("status", "new"),
                            created_at=r["created_at"],
                            updated_at=r["updated_at"],
                            metadata=r.get("metadata")
                        )
                        for r in records
                    ]
        except Exception:
            pass

    return list(_in_memory_tickets.values())


@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: str):
    if ticket_id not in _in_memory_tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return _in_memory_tickets[ticket_id]
