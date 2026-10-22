from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class TicketPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TicketStatus(str, Enum):
    new = "new"
    triaged = "triaged"
    draft_ready = "draft_ready"
    pending_approval = "pending_approval"
    approved = "approved"
    rejected = "rejected"
    escalated = "escalated"
    resolved = "resolved"
    closed = "closed"


class TicketCreate(BaseModel):
    external_id: str = Field(..., description="Unique identifier to enforce idempotency")
    customer_email: EmailStr
    customer_name: Optional[str] = None
    subject: str = Field(..., min_length=3, max_length=500)
    message: str = Field(..., min_length=5)
    category: Optional[str] = None
    priority: TicketPriority = TicketPriority.medium
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class TicketResponse(BaseModel):
    id: str
    external_id: str
    customer_email: str
    customer_name: Optional[str]
    subject: str
    message: str
    category: Optional[str]
    priority: str
    status: str
    created_at: datetime
    updated_at: datetime
    metadata: Optional[Dict[str, Any]] = None
