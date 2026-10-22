import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "api"


def test_create_ticket_success():
    payload = {
        "external_id": "EXT-TEST-001",
        "customer_email": "test@example.com",
        "customer_name": "Juan Dela Cruz",
        "subject": "Delay in delivery",
        "message": "My order #12345 has not arrived yet. It has been 5 days.",
        "priority": "high"
    }
    response = client.post("/api/v1/tickets", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["external_id"] == "EXT-TEST-001"
    assert data["status"] == "new"
    assert "id" in data


def test_create_ticket_duplicate_rejected():
    payload = {
        "external_id": "EXT-TEST-001",
        "customer_email": "test@example.com",
        "subject": "Duplicate attempt",
        "message": "Sending the same inquiry again."
    }
    response = client.post("/api/v1/tickets", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_create_ticket_invalid_email():
    payload = {
        "external_id": "EXT-TEST-002",
        "customer_email": "not-an-email",
        "subject": "Bad email",
        "message": "Inquiry text here"
    }
    response = client.post("/api/v1/tickets", json=payload)
    assert response.status_code == 422
