import importlib
import io
import os

import requests
from werkzeug.datastructures import FileStorage


def _load_server_module():
    # Set basic Neo4j env vars so importing the Flask module is deterministic in tests.
    os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
    os.environ.setdefault("NEO4J_USER", "neo4j")
    os.environ.setdefault("NEO4J_PASSWORD", "test")
    return importlib.import_module("server")


def test_get_graph_data_requires_case_id():
    # This tests input validation: missing case_id should return 400.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    response = client.get("/api/graph-data")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing case_id parameter"


def test_get_investigations_success(monkeypatch):
    # This tests the happy path for listing investigations.
    server_module = _load_server_module()
    monkeypatch.setattr(
        server_module.db_client,
        "get_all_investigations",
        lambda: [{"case_id": "123", "name": "Lab Case"}],
    )
    client = server_module.app.test_client()

    response = client.get("/api/investigations")

    assert response.status_code == 200
    assert response.get_json() == [{"case_id": "123", "name": "Lab Case"}]


def test_get_investigations_failure(monkeypatch):
    # This tests the failure path when the DB layer raises an exception.
    server_module = _load_server_module()

    def _boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(server_module.db_client, "get_all_investigations", _boom)
    client = server_module.app.test_client()

    response = client.get("/api/investigations")

    assert response.status_code == 500
    assert response.get_json()["error"] == "Failed to fetch investigations"


def test_parse_evtx_requires_file_part():
    # This tests upload validation when no file is provided in the request body.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    response = client.post("/api/parse-evtx", data={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "No file part"


def test_parse_evtx_rejects_empty_filename():
    # This tests upload validation when a file field exists but the filename is empty.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    response = client.post(
        "/api/parse-evtx",
        data={"evtxFile": (io.BytesIO(b"abc"), "")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "No selected file"


def test_get_graph_data_db_failure(monkeypatch):
    # This tests error handling when graph lookup fails in the DB layer.
    server_module = _load_server_module()

    def _boom(_case_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(server_module.db_client, "get_case_graph", _boom)
    client = server_module.app.test_client()

    response = client.get("/api/graph-data?case_id=case-1")

    assert response.status_code == 500
    assert response.get_json()["error"] == "Failed to fetch graph data"


def test_ai_chat_requires_case_id_and_history():
    # This tests input validation for AI chat route.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    response = client.post("/api/ai-chat", json={"case_id": "", "history": []})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing case_id or chat history"


def test_ai_chat_returns_no_data_message(monkeypatch):
    # This tests the branch where timeline is empty for a valid AI chat request.
    server_module = _load_server_module()
    monkeypatch.setattr(server_module.db_client, "get_investigation_timeline", lambda _case_id: [])
    client = server_module.app.test_client()

    response = client.post("/api/ai-chat", json={"case_id": "case-1", "history": [{"role": "user", "content": "hi"}]})

    assert response.status_code == 200
    assert "No data in the current graph" in response.get_json()["reply"]


def test_ai_chat_http_429_maps_to_429_reply(monkeypatch):
    # This tests API rate-limit mapping from provider HTTP errors to a stable response.
    server_module = _load_server_module()
    monkeypatch.setattr(server_module.db_client, "get_investigation_timeline", lambda _case_id: [{"k": "v"}])

    class DummyResponse:
        status_code = 429

    def _raise_http_error(_timeline, _history):
        raise requests.exceptions.HTTPError(response=DummyResponse())

    monkeypatch.setattr(server_module, "generate_forensic_response", _raise_http_error)
    client = server_module.app.test_client()

    response = client.post("/api/ai-chat", json={"case_id": "case-1", "history": [{"role": "user", "content": "hi"}]})

    assert response.status_code == 429
    assert "AI is overloaded" in response.get_json()["reply"]


def test_delete_investigation_failure(monkeypatch):
    # This tests delete endpoint error path when DB delete fails.
    server_module = _load_server_module()

    def _boom(_case_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(server_module.db_client, "delete_investigation", _boom)
    client = server_module.app.test_client()

    response = client.delete("/api/investigations/case-1")

    assert response.status_code == 500
    assert response.get_json()["error"] == "Failed to delete investigation"


def test_generate_handler_requires_numeric_event_id():
    # This tests generate-handler input validation for invalid event IDs.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    response = client.post("/api/generate-handler", json={"event_id": "abc", "description": "desc"})

    assert response.status_code == 400
    assert "numeric event_id" in response.get_json()["error"]


def test_parse_evtx_success_uses_stubbed_uuid_and_no_real_save(monkeypatch):
    # This test demonstrates deterministic input control by stubbing UUID and file writes.
    server_module = _load_server_module()

    monkeypatch.setattr(server_module.uuid, "uuid4", lambda: "11111111-1111-1111-1111-111111111111")
    monkeypatch.setattr(server_module, "parse_and_store_evtx", lambda *args, **kwargs: None)
    monkeypatch.setattr(FileStorage, "save", lambda self, dst, buffer_size=16384: None)

    client = server_module.app.test_client()
    response = client.post(
        "/api/parse-evtx",
        data={"evtxFile": (io.BytesIO(b"fake"), "x.evtx"), "invName": "My Inv!@#"},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["case_id"] == "11111111-1111-1111-1111-111111111111"
    assert payload["filename"].startswith("MyInv_")
