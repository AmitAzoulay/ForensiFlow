from ._shared import ENTITY_RESOLVERS, _insert_graph_relationship


def _4688_process_created(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "Process", ctx['src_proc'], "Process", ctx['dst_proc'], "PROCESS_CREATED", log['details'])

_rules_4688 = [_4688_process_created]

def _handle_4688(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'src_proc': ENTITY_RESOLVERS['process'](log['data_map'], 'ParentProcessName', 'ProcessId', proc_map),
        'dst_proc': ENTITY_RESOLVERS['process'](log['data_map'], 'NewProcessName', 'NewProcessId', proc_map),
    }
    for rule in _rules_4688:
        rule(tx, case_id, log, ctx)


def _4696_token_assigned(tx, case_id, log, ctx):
    _insert_graph_relationship(tx, case_id, "Process", ctx['proc'], "User", ctx['user'], "TOKEN_ASSIGNED", log['details'])

_rules_4696 = [_4696_token_assigned]

def _handle_4696(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'proc': ENTITY_RESOLVERS['process'](log['data_map'], 'ProcessName', 'TargetProcessId', proc_map),
        'user': ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map),
    }
    for rule in _rules_4696:
        rule(tx, case_id, log, ctx)


def _4663_file_access(tx, case_id, log, ctx):
    mask_str = log['data_map'].get('AccessMask', '').strip().lower()
    if not mask_str.startswith('0x'):
        return
    try:
        mask_val = int(mask_str, 16)
    except ValueError:
        return
    if mask_val & 0x10000:
        action_type = "OBJECT_ACCESSED_DELETE"
    elif mask_val & 0x2:
        action_type = "OBJECT_ACCESSED_WRITE"
    elif mask_val & 0x4:
        action_type = "OBJECT_ACCESSED_APPEND"
    elif mask_val & 0x1:
        action_type = "OBJECT_ACCESSED_READ"
    elif mask_val & 0x20:
        action_type = "OBJECT_ACCESSED_EXECUTE"
    else:
        return
    _insert_graph_relationship(tx, case_id, "Process", ctx['proc'], "File", ctx['file'], action_type, log['details'])

_rules_4663 = [_4663_file_access]

def _handle_4663(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'proc': ENTITY_RESOLVERS['process'](log['data_map'], 'ProcessName', 'ProcessId', proc_map),
        'file': ENTITY_RESOLVERS['file'](log['data_map'], None, None, {}),
    }
    for rule in _rules_4663:
        rule(tx, case_id, log, ctx)


def _4656_process_handle(tx, case_id, log, ctx):
    if log['data_map'].get('ObjectType', '').lower() != 'process':
        return
    target = ENTITY_RESOLVERS['process'](log['data_map'], 'ObjectName', None, {})
    _insert_graph_relationship(tx, case_id, "Process", ctx['proc'], "Process", target, "REQUESTED_HANDLE", log['details'])

def _4656_file_handle(tx, case_id, log, ctx):
    if log['data_map'].get('ObjectType', '').lower() == 'process':
        return
    target = ENTITY_RESOLVERS['file'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "Process", ctx['proc'], "File", target, "REQUESTED_HANDLE", log['details'])

_rules_4656 = [_4656_process_handle, _4656_file_handle]

def _handle_4656(tx, case_id, log, sid_map, proc_map):
    ctx = {
        'proc': ENTITY_RESOLVERS['process'](log['data_map'], 'ProcessName', 'ProcessId', proc_map),
    }
    for rule in _rules_4656:
        rule(tx, case_id, log, ctx)


HANDLERS = {
    '4688': _handle_4688,
    '4696': _handle_4696,
    '4663': _handle_4663,
    '4656': _handle_4656,
}
