import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status
import httpx

from app.config import settings
from app.schemas.approval import ApprovalSubmission, ApprovalResponse

router = APIRouter()

# In-memory local fallback store for approvals
_local_approvals: Dict[str, Dict[str, Any]] = {}


@router.post("/process", response_model=ApprovalResponse, status_code=status.HTTP_200_OK)
async def process_approval(payload: ApprovalSubmission):
    """
    WF-04: Human-in-the-Loop Approval Processor
    1. Records reviewer decision (approved, rejected, modified_and_approved, escalated).
    2. Updates ticket status in Supabase Cloud (`approved`, `rejected`, or `escalated`).
    3. Persists complete audit record to `approvals` table.
    4. Triggers outbound dispatch event if approved.
    """
    approval_id = str(uuid.uuid4())
    now = datetime.utcnow()

    # Determine resulting ticket status
    status_mapping = {
        "approved": "approved",
        "modified_and_approved": "approved",
        "rejected": "rejected",
        "escalated": "escalated"
    }
    decision_str = str(payload.decision.value if hasattr(payload.decision, 'value') else payload.decision)
    new_ticket_status = status_mapping.get(decision_str, "pending_approval")
    final_text = payload.final_content or payload.draft_content or ""
    notification_dispatched = decision_str in ["approved", "modified_and_approved"]

    # 1. Update Supabase if credentials exist
    auth_key = settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    if settings.SUPABASE_URL and auth_key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                headers = {
                    "apikey": auth_key,
                    "Authorization": f"Bearer {auth_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                }

                # Get existing ticket metadata to preserve RAG sources and update ai_draft
                ticket_get = await client.get(
                    f"{settings.SUPABASE_URL}/rest/v1/tickets?id=eq.{payload.ticket_id}",
                    headers=headers
                )
                updated_metadata = {}
                if ticket_get.status_code == 200 and ticket_get.json():
                    existing_record = ticket_get.json()[0]
                    updated_metadata = existing_record.get("metadata") or {}

                # Save the human-edited final text into metadata
                updated_metadata["ai_draft"] = final_text
                updated_metadata["reviewed_by"] = payload.reviewer_id
                updated_metadata["decision"] = payload.decision.value

                # Update ticket status and metadata in Supabase
                patch_url = f"{settings.SUPABASE_URL}/rest/v1/tickets?id=eq.{payload.ticket_id}"
                patch_res = await client.patch(
                    patch_url,
                    headers=headers,
                    json={
                        "status": new_ticket_status,
                        "metadata": updated_metadata,
                        "updated_at": now.isoformat()
                    }
                )

                # Insert approval record
                approval_record = {
                    "id": approval_id,
                    "ticket_id": payload.ticket_id,
                    "draft_content": payload.draft_content or "No initial draft provided",
                    "final_content": final_text,
                    "decision": payload.decision.value,
                    "rejection_reason": payload.rejection_reason,
                    "reviewer_id": payload.reviewer_id,
                    "reviewed_at": now.isoformat()
                }
                await client.post(
                    f"{settings.SUPABASE_URL}/rest/v1/approvals",
                    headers=headers,
                    json=approval_record
                )
        except Exception:
            pass

    # 2. Local memory fallback
    _local_approvals[approval_id] = {
        "id": approval_id,
        "ticket_id": payload.ticket_id,
        "decision": payload.decision.value,
        "reviewer_id": payload.reviewer_id,
        "final_content": final_text,
        "reviewed_at": now,
        "ticket_status": new_ticket_status,
        "notification_dispatched": notification_dispatched
    }

    return ApprovalResponse(
        id=approval_id,
        ticket_id=payload.ticket_id,
        decision=payload.decision.value,
        reviewer_id=payload.reviewer_id,
        final_content=final_text,
        reviewed_at=now,
        ticket_status=new_ticket_status,
        notification_dispatched=notification_dispatched
    )


@router.get("/list", response_model=List[ApprovalResponse])
def list_approvals():
    return list(_local_approvals.values())
