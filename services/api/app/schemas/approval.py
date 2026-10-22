from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime


class ApprovalDecisionEnum(str, Enum):
    approved = "approved"
    rejected = "rejected"
    modified_and_approved = "modified_and_approved"
    escalated = "escalated"


class ApprovalSubmission(BaseModel):
    ticket_id: str = Field(..., description="UUID of the ticket being reviewed")
    decision: ApprovalDecisionEnum = Field(..., description="Manager decision")
    reviewer_id: str = Field(default="manager-01", description="Identifier of the reviewer/agent")
    draft_content: Optional[str] = None
    final_content: Optional[str] = None
    rejection_reason: Optional[str] = None


class ApprovalResponse(BaseModel):
    id: str
    ticket_id: str
    decision: str
    reviewer_id: str
    final_content: Optional[str]
    reviewed_at: datetime
    ticket_status: str
    notification_dispatched: bool
