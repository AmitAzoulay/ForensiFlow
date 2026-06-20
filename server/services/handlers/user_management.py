from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _4720_user_created(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['src_user'], "User", ctx['dst_user'], "USER_CREATED", log['details'])

_rules_4720 = [_4720_user_created]

def _handle_4720(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'src_user': ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'dst_user': ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetSid', sid_map),
    }
    for rule in _rules_4720:
        rule(tx, case_id, log, ctx)


def _4726_user_deleted(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['src_user'], "User", ctx['dst_user'], "USER_DELETED", log['details'])

_rules_4726 = [_4726_user_deleted]

def _handle_4726(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'src_user': ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'dst_user': ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetSid', sid_map),
    }
    for rule in _rules_4726:
        rule(tx, case_id, log, ctx)


def _4732_added_to_group(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['dst_user'], "Group", ctx['group'], "ADDED_TO_GROUP", log['details'])

def _4732_modified_group(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['src_user'], "Group", ctx['group'], "MODIFIED_GROUP", log['details'])

_rules_4732 = [_4732_added_to_group, _4732_modified_group]

def _handle_4732(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'src_user': ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'dst_user': ENTITY_RESOLVERS['user'](log['data_map'], 'MemberName', 'MemberSid', sid_map),
        'group':    ENTITY_RESOLVERS['group'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4732:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '4720': _handle_4720,
    '4726': _handle_4726,
    '4732': _handle_4732,
}
