from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_approval_decision_workflow():
    payload = {
        "ticket_id": "0ce657ca-3b31-47bd-9b08-8b1171744a5d",
        "decision": "approved",
        "reviewer_id": "lead-agent-ian",
        "draft_content": "Thank you for reaching out, you are eligible for refund.",
        "final_content": "Thank you for reaching out, your refund has been approved."
    }
    response = client.post("/api/v1/approvals/process", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "approved"
    assert data["ticket_status"] == "approved"
    assert data["notification_dispatched"] is True


def test_approval_rejection_workflow():
    payload = {
        "ticket_id": "0ce657ca-3b31-47bd-9b08-8b1171744a5d",
        "decision": "rejected",
        "reviewer_id": "lead-agent-ian",
        "rejection_reason": "Inquiry is past the 30-day warranty window."
    }
    response = client.post("/api/v1/approvals/process", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "rejected"
    assert data["ticket_status"] == "rejected"
    assert data["notification_dispatched"] is False
