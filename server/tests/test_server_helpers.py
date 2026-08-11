import importlib
import os

import pytest

from services.handler_registry import extract_reasoning, summarize_handler, validate_handler_ast


def _load_server_module():
    os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
    os.environ.setdefault("NEO4J_USER", "neo4j")
    os.environ.setdefault("NEO4J_PASSWORD", "test")
    return importlib.import_module("server")


def test_extract_reasoning_reads_leading_comment_block():
    # This test ensures explanation comments are captured from generated handlers.
    _load_server_module()

    code = "# first line\n# second line\ndef handler():\n    return 1\n"

    result = extract_reasoning(code)

    assert result == "first line\nsecond line"


def test_summarize_handler_lists_relationships():
    # This test ensures the summary includes event ID and relationship hints.
    _load_server_module()

    code = '_insert_graph_relationship(tx, case_id, "User", src, "Computer", dst, "LOGGED_IN", details)'

    result = summarize_handler(code, "4624")

    assert "Handler for event 4624 registered." in result
    assert "User" in result
    assert "Computer" in result
    assert "LOGGED_IN" in result


def test_validate_handler_ast_accepts_safe_code():
    # This test proves known-safe handler code passes validation.
    _load_server_module()

    code = (
        "from services.handlers._shared import ENTITY_RESOLVERS, _insert_graph_relationship\n"
        "from services.handlers import register_handler\n\n"
        "def handle(tx, case_id, log, sid_map, proc_map):\n"
        "    user = ENTITY_RESOLVERS['user'](tx, case_id, 'alice')\n"
        "    host = ENTITY_RESOLVERS['computer'](tx, case_id, 'ws1')\n"
        "    _insert_graph_relationship(tx, case_id, 'User', user, 'Computer', host, 'LOGGED_IN', {})\n\n"
        "register_handler('4624', handle)\n"
    )

    detected = validate_handler_ast(code, "4624")

    assert detected == "4624"


def test_validate_handler_ast_rejects_import_statement():
    # This test proves unsafe imports are blocked by the validator.
    _load_server_module()

    code = (
        "import os\n"
        "from services.handlers import register_handler\n\n"
        "def handle(tx, case_id, log, sid_map, proc_map):\n"
        "    return None\n\n"
        "register_handler('4624', handle)\n"
    )

    with pytest.raises(ValueError):
        validate_handler_ast(code, "4624")
