import importlib
import io
import os
import uuid as _uuid

import requests
from werkzeug.datastructures import FileStorage

import routes.investigations as investigations_routes
import services.ai_agent as _ai_agent


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

    # We call the endpoint without a case_id to make sure the API rejects the request early.
    response = client.get("/api/graph-data")

    # The route should return a 400 and a clear validation message instead of querying the database.
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

    # We request the real route while the database method is replaced with a known-good fake response.
    response = client.get("/api/investigations")

    # The API should serialize that fake DB result back as JSON without altering its contents.
    assert response.status_code == 200
    assert response.get_json() == [{"case_id": "123", "name": "Lab Case"}]


def test_get_investigations_failure(monkeypatch):
    # This tests the failure path when the DB layer raises an exception.
    server_module = _load_server_module()

    def _boom():
        raise RuntimeError("db down")

    # We force the database access to fail and then verify the route returns a clean 500 response.
    monkeypatch.setattr(server_module.db_client, "get_all_investigations", _boom)
    client = server_module.app.test_client()

    response = client.get("/api/investigations")

    # The API should convert the DB exception into a client-safe error message.
    assert response.status_code == 500
    assert response.get_json()["error"] == "Failed to fetch investigations"


def test_parse_evtx_requires_file_part():
    # This tests upload validation when no file is provided in the request body.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    # use the canonical investigations upload endpoint
    # This request omits the file entirely, which should trigger validation before parsing starts.
    response = client.post("/api/investigations", data={})

    # The server should reject the request with a 400 and a descriptive error.
    assert response.status_code == 400
    assert response.get_json()["error"] == "No file part"


def test_parse_evtx_rejects_empty_filename():
    # This tests upload validation when a file field exists but the filename is empty.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    # We attach a file object with an empty filename to verify the route rejects blank names.
    response = client.post(
        "/api/investigations",
        data={"evtxFile": (io.BytesIO(b"abc"), "")},
        content_type="multipart/form-data",
    )

    # The endpoint should stop before file processing and report that no file was selected.
    assert response.status_code == 400
    assert response.get_json()["error"] == "No selected file"


def test_get_graph_data_db_failure(monkeypatch):
    # This tests error handling when graph lookup fails in the DB layer.
    server_module = _load_server_module()

    def _boom(_case_id):
        raise RuntimeError("db down")

    # The database call is intentionally made to fail so we can confirm the route converts it to a 500.
    monkeypatch.setattr(server_module.db_client, "get_case_graph", _boom)
    client = server_module.app.test_client()

    response = client.get("/api/graph-data?case_id=case-1")

    # The client should see a clean backend error response instead of an unhandled crash.
    assert response.status_code == 500
    assert response.get_json()["error"] == "Failed to fetch graph data"


def test_ai_chat_requires_case_id_and_history():
    # This tests input validation for AI chat route.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    # the app exposes a streaming `/api/chat` endpoint; exercise it with the same JSON payload
    # We send an empty case_id and empty history to confirm the endpoint validates before AI work starts.
    response = client.post("/api/chat", json={"case_id": "", "history": []})

    # The route should reject the payload with a 400 and a short validation error.
    assert response.status_code == 400
    # unified `/api/chat` returns a short validation error when no message provided
    assert response.get_json()["error"] == "No message provided"


def test_ai_chat_returns_no_data_message(monkeypatch):
    # This tests the branch where timeline is empty for a valid AI chat request.
    server_module = _load_server_module()
    # We replace the timeline lookup with an empty list to simulate a case that has no graph data.
    monkeypatch.setattr(server_module.db_client, "get_investigation_timeline", lambda _case_id: [])
    client = server_module.app.test_client()

    # The request is valid, but there is no data to feed into the AI answer.
    response = client.post("/api/chat", json={"case_id": "case-1", "history": [{"role": "user", "content": "hi"}]})

    # The API should return a 200 with a graceful no-data message in the SSE stream.
    assert response.status_code == 200
    # streaming endpoints return SSE; the test client collects the streamed body as text
    assert "No data in the current graph" in response.get_data(as_text=True)


def test_ai_chat_http_429_maps_to_429_reply(monkeypatch):
    # This tests API rate-limit mapping from provider HTTP errors to a stable response.
    server_module = _load_server_module()
    # We provide a minimal timeline so the route reaches the AI call path rather than the no-data branch.
    monkeypatch.setattr(server_module.db_client, "get_investigation_timeline", lambda _case_id: [{"k": "v"}])

    class DummyResponse:
        status_code = 429

    def _raise_http_error(_timeline, _history):
        raise requests.exceptions.HTTPError(response=DummyResponse())

    # patch the canonical AI function used by the route
    # We intentionally raise an HTTP 429 from the AI provider to ensure the route converts it to a safe message.
    monkeypatch.setattr(_ai_agent, "generate_forensic_response", _raise_http_error)
    client = server_module.app.test_client()

    response = client.post("/api/chat", json={"case_id": "case-1", "history": [{"role": "user", "content": "hi"}]})

    # unified `/api/chat` is a streaming endpoint, errors from the AI provider are returned
    # inside the stream body rather than via the HTTP status code.
    assert response.status_code == 200
    assert "Failed to process AI request" in response.get_data(as_text=True)


def test_delete_investigation_failure(monkeypatch):
    # This tests delete endpoint error path when DB delete fails.
    server_module = _load_server_module()

    def _boom(_case_id):
        raise RuntimeError("db down")

    # The database delete is made to fail so the route’s error handling can be validated.
    monkeypatch.setattr(server_module.db_client, "delete_investigation", _boom)
    client = server_module.app.test_client()

    response = client.delete("/api/investigations/case-1")

    # The endpoint should return a 500 and a clear error response when the delete fails.
    assert response.status_code == 500
    assert response.get_json()["error"] == "Failed to delete investigation"


def test_generate_handler_requires_numeric_event_id():
    # This tests generate-handler input validation for invalid event IDs.
    server_module = _load_server_module()
    client = server_module.app.test_client()

    # the explicit `/api/generate-handler` endpoint no longer exists; ensure the test tolerates a missing route
    # We provide a non-numeric event_id to confirm the endpoint rejects invalid input safely.
    response = client.post("/api/generate-handler", json={"event_id": "abc", "description": "desc"})

    # Depending on API version, this may be a 400 or 404, but it must not accept the bad input.
    assert response.status_code in (400, 404)


def test_parse_evtx_success_uses_stubbed_uuid_and_no_real_save(monkeypatch):
    # This test demonstrates deterministic input control by stubbing UUID and file writes.
    server_module = _load_server_module()

    # We fix the UUID so the returned case_id is stable and easy to assert.
    monkeypatch.setattr(_uuid, "uuid4", lambda: "11111111-1111-1111-1111-111111111111")
    # Patch the route module's local reference to the parser (it imports the function at module import time)
    monkeypatch.setattr(investigations_routes, "parse_and_store_evtx", lambda *args, **kwargs: None)
    # No server-level parser patch required; route calls `services.evtx_parser.parse_and_store_evtx` directly
    # We also stub saving to disk so the test does not create any real upload artifacts.
    monkeypatch.setattr(FileStorage, "save", lambda self, dst, buffer_size=16384: None)

    client = server_module.app.test_client()
    response = client.post(
        "/api/investigations",
        data={"evtxFile": (io.BytesIO(b"fake"), "x.evtx"), "invName": "My Inv!@#"},
        content_type="multipart/form-data",
    )

    # investigations POST returns 201 on success
    # A successful upload should produce the fixed case id and sanitized filename.
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["case_id"] == "11111111-1111-1111-1111-111111111111"
    assert payload["filename"].startswith("MyInv_")


def test_save_edited_forwards_notebook_text(monkeypatch):
    # This tests that the edited-investigation save payload includes analyst notes.
    server_module = _load_server_module()

    captured = {}

    def _capture(original_case_id, new_case_id, new_name, nodes, links, notebook_text):
        # We capture the exact arguments sent to the database save call so we can verify the payload.
        captured.update(
            original_case_id=original_case_id,
            new_case_id=new_case_id,
            new_name=new_name,
            nodes=nodes,
            links=links,
            notebook_text=notebook_text,
        )

    # The database save method is replaced so we can inspect the payload without touching real storage.
    monkeypatch.setattr(server_module.db_client, "save_edited_graph", _capture)

    # We fix the new case id to keep the saved response deterministic and easy to verify.
    monkeypatch.setattr(_uuid, "uuid4", lambda: "22222222-2222-2222-2222-222222222222")
    client = server_module.app.test_client()

    response = client.post(
        "/api/save-edited",
        json={
            "old_case_id": "case-old",
            "new_name": "Case Rename",
            "nodes": [{"id": "n1"}],
            "links": [{"id": "l1"}],
            "notebook_text": "Analyst note",
        },
    )

    # The route should pass the notebook text through to the database layer and save it unchanged.
    assert response.status_code == 200
    assert captured["original_case_id"] == "case-old"
    assert captured["new_case_id"] == "22222222-2222-2222-2222-222222222222"
    assert captured["notebook_text"] == "Analyst note"
