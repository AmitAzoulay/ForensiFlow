import importlib
import os

from services.handler_registry import get_available_relations, tool_executor


def _load_server_module():
    os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
    os.environ.setdefault("NEO4J_USER", "neo4j")
    os.environ.setdefault("NEO4J_PASSWORD", "test")
    return importlib.import_module("server")


def test_tool_executor_unknown_returns_error():
    # Ensure environment is set up
    _load_server_module()

    res = tool_executor('nonexistent_tool', {})
    assert res.get('status') == 'error'


def test_get_available_relations_includes_builtin():
    _load_server_module()

    rels = get_available_relations()
    assert isinstance(rels, list)
    assert 'FAILED_LOGON' in rels
