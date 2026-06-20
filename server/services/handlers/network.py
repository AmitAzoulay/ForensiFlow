from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _5156_network_connection(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "Process", ctx['proc'], "Computer", ctx['computer'], "NETWORK_CONNECTION", log['details'])

_rules_5156 = [_5156_network_connection]

def _handle_5156(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'proc':     ENTITY_RESOLVERS['process'](log['data_map'], 'Application', 'ProcessId', proc_map),
        'computer': ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {}),
    }
    for rule in _rules_5156:
        rule(tx, case_id, log, ctx)


def _4769_ticket_requested(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Computer", ctx['computer'], "TICKET_REQUESTED", log['details'])

def _4769_ip_ticket(tx, case_id, log, ctx):
    ip = log['data_map'].get('IpAddress', '')
    if not ip or ip in ['-', '127.0.0.1', '::1']:
        return
    _insert_graph_relationship(tx, case_id, "Computer", ip, "User", ctx['user'], "USED_IP_FOR_TICKET", log['details'])

_rules_4769 = [_4769_ticket_requested, _4769_ip_ticket]

def _handle_4769(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map)
    if '@' in user:
        user = user.split('@')[0]
    ctx = {
        'user':     user,
        'computer': ENTITY_RESOLVERS['computer'](log['data_map'], 'ServiceName', None, {}),
    }
    for rule in _rules_4769:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '5156': _handle_5156,
    '4769': _handle_4769,
}
