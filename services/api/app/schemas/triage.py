from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class TriageDraftRequest(BaseModel):
    subject: str = Field(..., min_length=2)
    message: str = Field(..., min_length=5)
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None


class TriageDraftResponse(BaseModel):
    category: str
    priority: str
    sentiment: str
    summary: str
    drafted_response: str
    confidence_score: float
    evidence_used: List[str] = []
    requires_escalation: bool = False
    rag_sources: List[Dict[str, Any]] = []
