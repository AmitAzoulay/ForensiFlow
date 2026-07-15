import importlib
import os


def _load_server_module():
    os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
    os.environ.setdefault("NEO4J_USER", "neo4j")
    os.environ.setdefault("NEO4J_PASSWORD", "test")
    return importlib.import_module("server")


def test_tool_executor_unknown_returns_error():
    server = _load_server_module()
    res = server._tool_executor('nonexistent_tool', {})
    assert res.get('status') == 'error'


def test_get_available_relations_includes_builtin():
    server = _load_server_module()
    rels = server._get_available_relations()
    assert isinstance(rels, list)
    assert 'FAILED_LOGON' in rels
