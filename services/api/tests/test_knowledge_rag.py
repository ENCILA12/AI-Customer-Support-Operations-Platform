from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_knowledge_ingestion():
    payload = {
        "title": "Account Security FAQ",
        "source": "security_faq.md",
        "content": "Users can enable two-factor authentication (2FA) in Settings. Passwords must be at least 12 characters long."
    }
    response = client.post("/api/v1/knowledge/ingest", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Account Security FAQ"
    assert data["total_chunks"] >= 1


def test_semantic_search():
    # Ingest test context
    client.post("/api/v1/knowledge/ingest", json={
        "title": "Shipping Info",
        "source": "shipping.md",
        "content": "Standard delivery takes 3 to 5 business days across Metro Manila and Luzon."
    })
    
    # Search with natural language query
    search_payload = {
        "query": "Gaano katagal bago dumating ang package ko sa Manila?",
        "match_count": 1,
        "match_threshold": 0.3
    }
    response = client.post("/api/v1/knowledge/search", json=search_payload)
    assert response.status_code == 200
    results = response.json()
    assert len(results) > 0
    assert "Standard delivery" in results[0]["content"]
    assert results[0]["similarity"] > 0.4
