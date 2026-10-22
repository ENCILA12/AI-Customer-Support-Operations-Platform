import uuid
from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
import httpx

from app.config import settings
from app.schemas.knowledge import (
    KnowledgeDocumentCreate,
    KnowledgeDocumentResponse,
    SemanticSearchRequest,
    SearchMatchResponse
)
from app.services.rag import chunk_text, generate_embeddings

router = APIRouter()

# In-memory local cache for instant zero-dependency retrieval & fallback
LOCAL_DOCUMENTS: Dict[str, Dict[str, Any]] = {}
LOCAL_CHUNKS: List[Dict[str, Any]] = []


@router.post("/ingest", response_model=KnowledgeDocumentResponse, status_code=status.HTTP_201_CREATED)
async def ingest_document(payload: KnowledgeDocumentCreate):
    """
    Ingest a company knowledge document (markdown, FAQs, policies):
    1. Splits into overlapping semantic chunks
    2. Generates 768-dim vector embeddings locally using FastEmbed (bge-base-en)
    3. Persists document & chunks with vectors to Supabase pgvector
    """
    doc_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    # 1. Chunk document
    chunks = chunk_text(payload.content, chunk_size=500, overlap=80)
    if not chunks:
        raise HTTPException(status_code=400, detail="Document content could not be chunked.")

    # 2. Generate embeddings locally
    embeddings = generate_embeddings(chunks)

    # 3. Cache locally for instant offline search
    LOCAL_DOCUMENTS[doc_id] = {
        "id": doc_id,
        "title": payload.title,
        "source": payload.source,
        "content": payload.content,
        "created_at": now
    }
    
    for idx, (chunk_text_content, emb) in enumerate(zip(chunks, embeddings)):
        LOCAL_CHUNKS.append({
            "id": str(uuid.uuid4()),
            "document_id": doc_id,
            "document_title": payload.title,
            "source": payload.source,
            "chunk_index": idx,
            "content": chunk_text_content,
            "embedding": emb
        })

    # 4. Sync to Supabase Cloud if configured
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                }
                # Insert document
                doc_payload = {
                    "id": doc_id,
                    "title": payload.title,
                    "source": payload.source,
                    "content": payload.content,
                    "status": "active",
                    "metadata": payload.metadata or {}
                }
                await client.post(
                    f"{settings.SUPABASE_URL}/rest/v1/knowledge_documents",
                    headers=headers,
                    json=doc_payload
                )

                # Insert chunks with embeddings
                chunk_records = []
                for idx, (chunk_text_content, emb) in enumerate(zip(chunks, embeddings)):
                    chunk_records.append({
                        "id": str(uuid.uuid4()),
                        "document_id": doc_id,
                        "chunk_index": idx,
                        "content": chunk_text_content,
                        "embedding": emb,
                        "metadata": {"source": payload.source, "title": payload.title}
                    })
                
                await client.post(
                    f"{settings.SUPABASE_URL}/rest/v1/knowledge_chunks",
                    headers=headers,
                    json=chunk_records
                )
        except Exception as e:
            # Document and chunks remain preserved in local memory
            pass

    return KnowledgeDocumentResponse(
        id=doc_id,
        title=payload.title,
        source=payload.source,
        total_chunks=len(chunks),
        created_at=now
    )


@router.post("/search", response_model=List[SearchMatchResponse])
async def search_knowledge(payload: SemanticSearchRequest):
    """
    Perform semantic vector search using cosine similarity against stored chunks.
    Works seamlessly both locally and via Supabase pgvector stored procedure.
    """
    # 1. Embed query locally (768 dimensions)
    query_embeddings = generate_embeddings([payload.query])
    if not query_embeddings:
        return []
    
    query_vector = query_embeddings[0]

    # 2. Try Supabase pgvector RPC first if available
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                headers = {
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json"
                }
                rpc_body = {
                    "query_embedding": query_vector,
                    "match_threshold": payload.match_threshold,
                    "match_count": payload.match_count
                }
                res = await client.post(
                    f"{settings.SUPABASE_URL}/rest/v1/rpc/match_knowledge_chunks",
                    headers=headers,
                    json=rpc_body
                )
                if res.status_code == 200:
                    results = res.json()
                    if results:
                        return [
                            SearchMatchResponse(
                                id=r.get("id"),
                                chunk_index=r.get("chunk_index", 0),
                                content=r.get("content", ""),
                                similarity=round(float(r.get("similarity", 0.0)), 4)
                            )
                            for r in results
                        ]
        except Exception:
            pass

    # 3. Fallback: Local Cosine Similarity Search
    import numpy as np

    q_norm = np.linalg.norm(query_vector)
    if q_norm == 0 or not LOCAL_CHUNKS:
        return []

    scored_chunks = []
    for c in LOCAL_CHUNKS:
        c_vec = np.array(c["embedding"])
        sim = float(np.dot(query_vector, c_vec) / (q_norm * np.linalg.norm(c_vec)))
        if sim >= payload.match_threshold:
            scored_chunks.append({
                "id": c["id"],
                "chunk_index": c["chunk_index"],
                "content": c["content"],
                "similarity": round(sim, 4),
                "source": c.get("source"),
                "document_title": c.get("document_title")
            })

    scored_chunks.sort(key=lambda x: x["similarity"], reverse=True)
    return [SearchMatchResponse(**sc) for sc in scored_chunks[:payload.match_count]]
