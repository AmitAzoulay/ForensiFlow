import sys

from .authentication import HANDLERS as _auth
from .process import HANDLERS as _process
from .registry import HANDLERS as _registry
from .user_management import HANDLERS as _user_mgmt
from .service_task import HANDLERS as _svc_task
from .network import HANDLERS as _network
from .audit import HANDLERS as _audit

_STATIC_HANDLERS: dict = {
    **_auth,
    **_process,
    **_registry,
    **_user_mgmt,
    **_svc_task,
    **_network,
    **_audit,
}

EVENT_HANDLERS: dict = dict(_STATIC_HANDLERS)
STATIC_HANDLER_IDS: frozenset = frozenset(_STATIC_HANDLERS.keys())

# Keyed by (caller_module, event_id) so reloading a file replaces its entry
# while a different file for the same event_id adds a new entry.
_REGISTRY: dict = {}


def _rebuild_event_handler(event_id: str) -> None:
    pairs = [(cb, rl) for (_, eid), (cb, rl) in _REGISTRY.items() if eid == event_id]
    if pairs:
        def _handler(tx, case_id, log, sid_map, proc_map, _pairs=pairs):
            for cb, rl in _pairs:
                ctx = cb(log['data_map'], sid_map, proc_map)
                for rule in rl:
                    rule(tx, case_id, log, ctx)
        EVENT_HANDLERS[event_id] = _handler
    elif event_id in _STATIC_HANDLERS:
        EVENT_HANDLERS[event_id] = _STATIC_HANDLERS[event_id]
    else:
        EVENT_HANDLERS.pop(event_id, None)


def register_handler(event_id: str, ctx_builder, rules: list) -> None:
    """Register rules for an event ID. Multiple files can register for the same
    event_id — all run in order. Reloading a file replaces its entry."""
    caller = sys._getframe(1).f_globals.get('__name__', 'unknown')
    _REGISTRY[(caller, event_id)] = (ctx_builder, list(rules))
    _rebuild_event_handler(event_id)


def deregister_handler(module_name: str) -> None:
    """Remove all rules contributed by a module and rebuild affected handlers."""
    affected = {eid for (mod, eid) in list(_REGISTRY) if mod == module_name}
    for key in [(mod, eid) for (mod, eid) in list(_REGISTRY) if mod == module_name]:
        del _REGISTRY[key]
    for event_id in affected:
        _rebuild_event_handler(event_id)


# Auto-load AI-generated handlers — each file calls register_handler on import.
from . import ai_generated  # noqa
