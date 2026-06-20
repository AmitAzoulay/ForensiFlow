from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _4697_service_installed(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Service", ctx['service'], "SERVICE_INSTALLED", log['details'])

_rules_4697 = [_4697_service_installed]

def _handle_4697(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'user':    ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'service': ENTITY_RESOLVERS['service'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4697:
        rule(tx, case_id, log, ctx)


def _4698_task_created(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "User", ctx['user'], "Task", ctx['task'], "TASK_CREATED", log['details'])

_rules_4698 = [_4698_task_created]

def _handle_4698(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'user': ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map),
        'task': ENTITY_RESOLVERS['task'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4698:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '4697': _handle_4697,
    '4698': _handle_4698,
}
