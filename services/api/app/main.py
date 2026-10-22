from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from app.config import settings
from app.routers import health, tickets, knowledge, triage, approvals

app = FastAPI(
    title="AI Customer Support Operations API",
    version="1.0.0",
    description="Backend API gatekeeper for ticket lifecycle, RAG search, LLM drafting, and approvals."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(tickets.router, prefix="/api/v1/tickets", tags=["Tickets"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["Knowledge & RAG"])
app.include_router(triage.router, prefix="/api/v1/triage", tags=["AI Triage & RAG"])
app.include_router(approvals.router, prefix="/api/v1/approvals", tags=["Human Approvals"])


@app.get("/")
def root():
    return {
        "service": "AI Customer Support Operations API",
        "status": "online",
        "timestamp": datetime.utcnow().isoformat(),
        "documentation": "/docs"
    }
