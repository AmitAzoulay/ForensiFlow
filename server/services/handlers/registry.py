from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _4657_registry_modified(tx, case_id, log, ctx):
    op = log['data_map'].get('OperationType', '').strip()
    action_type = {
        '%%1904': 'REGISTRY_VALUE_CREATED',
        '%%1905': 'REGISTRY_VALUE_MODIFIED',
        '%%1906': 'REGISTRY_VALUE_DELETED',
    }.get(op, 'REGISTRY_MODIFIED')
    _insert_graph_relationship(tx, case_id, "Process", ctx['proc'], "Registry", ctx['registry'], action_type, log['details'])

_rules_4657 = [_4657_registry_modified]

def _handle_4657(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'proc':     ENTITY_RESOLVERS['process'](log['data_map'], 'ProcessName', 'ProcessId', proc_map),
        'registry': ENTITY_RESOLVERS['registry'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4657:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '4657': _handle_4657,
}
