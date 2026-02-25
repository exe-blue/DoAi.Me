import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_task():
    resp = client.post("/tasks/", json={"title": "Test task"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test task"
    assert data["status"] == "pending"
    assert data["priority"] == "medium"
    assert data["id"] is not None


def test_create_task_with_all_fields():
    resp = client.post(
        "/tasks/",
        json={
            "title": "Full task",
            "description": "A detailed description",
            "status": "in_progress",
            "priority": "high",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Full task"
    assert data["description"] == "A detailed description"
    assert data["status"] == "in_progress"
    assert data["priority"] == "high"


def test_create_task_missing_title():
    resp = client.post("/tasks/", json={})
    assert resp.status_code == 422


def test_list_tasks():
    client.post("/tasks/", json={"title": "Task 1"})
    client.post("/tasks/", json={"title": "Task 2"})
    resp = client.get("/tasks/")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_tasks_filter_by_status():
    client.post("/tasks/", json={"title": "Pending", "status": "pending"})
    client.post("/tasks/", json={"title": "Done", "status": "completed"})
    resp = client.get("/tasks/?status=completed")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Done"


def test_list_tasks_filter_by_priority():
    client.post("/tasks/", json={"title": "Low", "priority": "low"})
    client.post("/tasks/", json={"title": "High", "priority": "high"})
    resp = client.get("/tasks/?priority=high")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "High"


def test_list_tasks_pagination():
    for i in range(5):
        client.post("/tasks/", json={"title": f"Task {i}"})
    resp = client.get("/tasks/?skip=2&limit=2")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_task():
    create_resp = client.post("/tasks/", json={"title": "Get me"})
    task_id = create_resp.json()["id"]
    resp = client.get(f"/tasks/{task_id}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Get me"


def test_get_task_not_found():
    resp = client.get("/tasks/9999")
    assert resp.status_code == 404


def test_update_task():
    create_resp = client.post("/tasks/", json={"title": "Old title"})
    task_id = create_resp.json()["id"]
    resp = client.put(f"/tasks/{task_id}", json={"title": "New title", "status": "completed"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New title"
    assert data["status"] == "completed"


def test_update_task_partial():
    create_resp = client.post("/tasks/", json={"title": "Keep me", "priority": "low"})
    task_id = create_resp.json()["id"]
    resp = client.put(f"/tasks/{task_id}", json={"priority": "high"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Keep me"
    assert data["priority"] == "high"


def test_update_task_not_found():
    resp = client.put("/tasks/9999", json={"title": "Nope"})
    assert resp.status_code == 404


def test_delete_task():
    create_resp = client.post("/tasks/", json={"title": "Delete me"})
    task_id = create_resp.json()["id"]
    resp = client.delete(f"/tasks/{task_id}")
    assert resp.status_code == 204
    resp = client.get(f"/tasks/{task_id}")
    assert resp.status_code == 404


def test_delete_task_not_found():
    resp = client.delete("/tasks/9999")
    assert resp.status_code == 404
