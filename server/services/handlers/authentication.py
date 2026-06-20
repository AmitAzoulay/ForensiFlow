from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _4624_logged_in(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Computer", ctx['computer'], "LOGGED_IN", log['details'])

_rules_4624 = [_4624_logged_in]

def _handle_4624(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'user':     ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map),
        'computer': ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4624:
        rule(tx, case_id, log, ctx)


def _4625_failed_logon(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Computer", ctx['computer'], "FAILED_LOGON", log['details'])

_rules_4625 = [_4625_failed_logon]

def _handle_4625(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'user':     ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map),
        'computer': ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4625:
        rule(tx, case_id, log, ctx)


def _4648_explicit_creds(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['src_user'], "User", ctx['dst_user'], "EXPLICIT_CREDS_USED", log['details'])

def _4648_remote_access(tx, case_id, log, ctx):
    ts = log['data_map'].get('TargetServerName', '-')
    if not ts or ts.lower() in ['localhost', '127.0.0.1', '-']:
        return
    _insert_graph_relationship(tx, case_id, "User", ctx['src_user'], "Computer", ts.lower(), "REMOTE_ACCESS", log['details'])

_rules_4648 = [_4648_explicit_creds, _4648_remote_access]

def _handle_4648(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'src_user': ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'dst_user': ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map),
    }
    for rule in _rules_4648:
        rule(tx, case_id, log, ctx)


def _4672_priv_logon(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Computer", ctx['computer'], "PRIV_LOGON", log['details'])

_rules_4672 = [_4672_priv_logon]

def _handle_4672(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'user':     ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'computer': ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4672:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '4624': _handle_4624,
    '4625': _handle_4625,
    '4648': _handle_4648,
    '4672': _handle_4672,
}
