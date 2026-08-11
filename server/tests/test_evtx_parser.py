import importlib
import os

from services import evtx_parser as ep
from services import handlers as handlers_mod


def _ensure_server_importable():
    os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
    os.environ.setdefault("NEO4J_USER", "neo4j")
    os.environ.setdefault("NEO4J_PASSWORD", "test")
    importlib.import_module('server')


def test_interpret_value_translates_known_codes():
    # Ensure a known NTSTATUS code becomes a readable string
    assert 'Wrong password' in ep._interpret_value('Status', '0xc000006a')


def test_interpret_details_filters_private_keys():
    details = {'Status': '0x0', '_internal': 'secret', 'Other': 'val'}
    interpreted = ep._interpret_details(details)
    assert 'Status' in interpreted
    assert 'Other' in interpreted
    assert '_internal' not in interpreted


def test_process_event_logic_calls_handler(monkeypatch):
    # Hook into EVENT_HANDLERS to ensure handler invocation paths work
    _ensure_server_importable()

    called = []

    def fake_handler(tx, case_id, log, sid_map, proc_map):
        called.append((case_id, log.get('event_id')))

    monkeypatch.setitem(handlers_mod.EVENT_HANDLERS, '9999', fake_handler)

    ep._process_event_logic(None, 'case-123', {'event_id': '9999'}, {}, {})

    assert called and called[0][0] == 'case-123'
