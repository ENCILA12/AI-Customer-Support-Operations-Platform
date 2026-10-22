from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class KnowledgeDocumentCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    source: str = Field(..., description="e.g. refund_policy.md, delivery_faq.txt")
    content: str = Field(..., min_length=10)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class KnowledgeChunkResponse(BaseModel):
    id: Optional[str] = None
    chunk_index: int
    content: str
    similarity: Optional[float] = None


class KnowledgeDocumentResponse(BaseModel):
    id: str
    title: str
    source: str
    total_chunks: int
    created_at: datetime


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=2)
    match_count: int = Field(default=3, ge=1, le=10)
    match_threshold: float = Field(default=0.4, ge=0.0, le=1.0)


class SearchMatchResponse(BaseModel):
    id: Optional[str] = None
    chunk_index: int
    content: str
    similarity: float
    source: Optional[str] = None
    document_title: Optional[str] = None
