import importlib
import os

from services.handler_registry import get_available_relations, tool_executor


def _load_server_module():
    # Initialize minimal Neo4j env settings before importing the server module in tests.
    os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
    os.environ.setdefault("NEO4J_USER", "neo4j")
    os.environ.setdefault("NEO4J_PASSWORD", "test")
    return importlib.import_module("server")


def test_tool_executor_unknown_returns_error():
    # This test confirms the generic tool executor handles unsupported tool names safely.
    # The contract is to return an error response instead of raising an unhandled exception.
    _load_server_module()

    # We intentionally pass a tool name that does not exist to ensure the function fails gracefully.
    res = tool_executor('nonexistent_tool', {})
    assert res.get('status') == 'error'


def test_get_available_relations_includes_builtin():
    # This test checks the registry exposes the built-in relationship vocabulary used by handlers.
    # A known forensic relation such as FAILED_LOGON should always be available.
    _load_server_module()

    # We read the registry list and check for a canonical relation that should always be included.
    rels = get_available_relations()
    assert isinstance(rels, list)
    assert 'FAILED_LOGON' in rels
