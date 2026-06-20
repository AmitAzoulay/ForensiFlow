from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _1102_audit_log_cleared(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Computer", ctx['computer'], "AUDIT_LOG_CLEARED", log['details'])

_rules_1102 = [_1102_audit_log_cleared]

def _handle_1102(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'user':     ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'computer': ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {}),
    }
    for rule in _rules_1102:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '1102': _handle_1102,
}
