import logging
import re
import xml.etree.ElementTree as ET
import Evtx.Evtx as evtx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Field-value interpretation tables
# ---------------------------------------------------------------------------

_WINDOWS_CODE_MAP = {
    # TokenElevationType (events 4688, 4624)
    '%%1936': 'Type 1 - Default',
    '%%1937': 'Type 2 - Elevated',
    '%%1938': 'Type 3 - Limited',
    # ImpersonationLevel (events 4624, 4648, 4674)
    '%%1832': 'Anonymous',
    '%%1833': 'Identification',
    '%%1840': 'Impersonation',
    '%%1841': 'Delegation',
    # Boolean flags: VirtualAccount, ElevatedToken, RestrictedAdminMode
    '%%1842': 'Yes',
    '%%1843': 'No',
    # OperationType (event 4657 — registry)
    '%%1904': 'New value created',
    '%%1905': 'Value modified',
    '%%1906': 'Value deleted',
    # Direction (event 5156 — network connection)
    '%%14592': 'Inbound',
    '%%14593': 'Outbound',
    # FailureReason (event 4625 — failed logon)
    '%%2304': 'Logon error',
    '%%2305': 'Account expired',
    '%%2306': 'Netlogon not active',
    '%%2307': 'Account locked out',
    '%%2308': 'Logon type not granted',
    '%%2309': 'Password expired',
    '%%2310': 'Account disabled',
    '%%2311': 'Logon hours restriction',
    '%%2312': 'Workstation restriction',
    '%%2313': 'Bad credentials',
    # Event keywords
    '%%8272': 'Audit Success',
    '%%8273': 'Audit Failure',
}

_NTSTATUS_MAP = {
    '0x0':        'Success',
    '0x00000000': 'Success',
    '0xc0000064': 'Unknown username',
    '0xc000006a': 'Wrong password',
    '0xc000006d': 'Bad credentials',
    '0xc000006e': 'Account restriction',
    '0xc000006f': 'Outside logon hours',
    '0xc0000070': 'Workstation restriction',
    '0xc0000071': 'Password expired',
    '0xc0000072': 'Account disabled',
    '0xc000015b': 'Logon type not granted',
    '0xc0000133': 'Clock skew too large',
    '0xc000017c': 'No domain controllers',
    '0xc000018d': 'Trust relationship failed',
    '0xc0000192': 'Netlogon not started',
    '0xc0000193': 'Account expired',
    '0xc0000224': 'Password must change',
    '0xc0000234': 'Account locked out',
    '0xc0000413': 'Authentication firewall',
}

_ENCRYPTION_TYPE_MAP = {
    '0x1':        'DES-CBC-CRC legacy',
    '0x3':        'DES-CBC-MD5 legacy',
    '0x11':       'AES128-CTS-HMAC-SHA1',
    '0x12':       'AES256-CTS-HMAC-SHA1',
    '0x17':       'RC4-HMAC legacy',
    '0x18':       'RC4-HMAC-EXP legacy',
    '0xffffffff': 'N/A',
}

_PROTOCOL_MAP = {
    '1':  'ICMP',
    '6':  'TCP',
    '17': 'UDP',
    '41': 'IPv6',
    '47': 'GRE',
    '58': 'ICMPv6',
}

_FIELD_MAPS = {
    'Status':               _NTSTATUS_MAP,
    'SubStatus':            _NTSTATUS_MAP,
    'TicketEncryptionType': _ENCRYPTION_TYPE_MAP,
    'Protocol':             _PROTOCOL_MAP,
}

_CODE_RE = re.compile(r'%%\d+')


def _interpret_value(field_name: str, raw: str) -> str:
    if not raw or raw == '-':
        return raw
    field_map = _FIELD_MAPS.get(field_name)
    if field_map:
        interp = field_map.get(raw.lower().strip())
        if interp:
            return f"{interp} ({raw})"
    if _CODE_RE.search(raw):
        def _replace(m):
            code = m.group(0)
            interp = _WINDOWS_CODE_MAP.get(code)
            return f"{interp} ({code})" if interp else code
        return _CODE_RE.sub(_replace, raw)
    return raw


def _interpret_details(data_map: dict) -> dict:
    return {
        k: _interpret_value(k, v) if isinstance(v, str) else v
        for k, v in data_map.items()
        if not k.startswith('_')
    }

def _insert_graph_relationship(tx, case_id, source_label, source_data, target_label, target_data, rel_type, details):
    if isinstance(source_data, tuple):
        s_id, s_name = source_data
    else:
        s_id, s_name = source_data, source_data

    if isinstance(target_data, tuple):
        t_id, t_name = target_data
    else:
        t_id, t_name = target_data, target_data

    if not s_id or not t_id or s_id in ['-', ''] or t_id in ['-', '']:
        return

    valid_labels = ["User", "Computer", "Process", "Registry", "Task", "Service", "File", "Group"]
    source_label = source_label.capitalize()
    target_label = target_label.capitalize()

    if source_label not in valid_labels or target_label not in valid_labels:
        logger.warning(f"Invalid node labels provided: {source_label}, {target_label}")
        return

    query = f"""
    MERGE (c:Case {{case_id: $case_id}})
    MERGE (source:{source_label} {{entity_id: $s_id, case_id: $case_id}})
    ON CREATE SET source.name = $s_name
    MERGE (target:{target_label} {{entity_id: $t_id, case_id: $case_id}})
    ON CREATE SET target.name = $t_name
    MERGE (source)-[r:{rel_type}]->(target)
    SET r += $details
    """
    try:
        tx.run(query, case_id=case_id, s_id=s_id, s_name=s_name, t_id=t_id, t_name=t_name, details=details)
    except Exception as e:
        logger.error(f"Failed to insert relationship '{rel_type}': {e}")

def _resolve_user(data_map, name_key, id_key, lookup_map):
    name = data_map.get(name_key, "")
    if name and name != '-':
        return name

    sid = data_map.get(id_key, "")
    if sid in lookup_map:
        return lookup_map[sid]

    return sid if sid and sid != '-' else "Unknown_User"


def _resolve_process(data_map, name_key, id_key, lookup_map):
    pid = data_map.get(id_key, "")
    name = data_map.get(name_key, "")

    if name and name != '-':
        clean_name = name.split('\\')[-1]
    elif pid in lookup_map:
        clean_name = lookup_map[pid]
    else:
        clean_name = "Unknown_Process"

    pid_val = pid if pid and pid != '-' else clean_name

    return (pid_val, clean_name)


def _resolve_computer(data_map, name_key, id_key, lookup_map):
    name = data_map.get(name_key or '_host_name', '')
    return name if name and name != '-' else 'Unknown_Computer'

def _resolve_registry(data_map, name_key, id_key, lookup_map):
    obj = data_map.get(name_key or 'ObjectName', '')
    val = data_map.get('ObjectValueName', '')
    path = f"{obj}\\{val}" if val else obj
    return path if path and path != '-' else 'Unknown_Registry_Key'

def _resolve_task(data_map, name_key, id_key, lookup_map):
    name = data_map.get(name_key or 'TaskName', '')
    return name if name and name != '-' else 'Unknown_Task'

def _resolve_service(data_map, name_key, id_key, lookup_map):
    name = data_map.get(name_key or 'ServiceName', '')
    return name if name and name != '-' else 'Unknown_Service'

def _resolve_file(data_map, name_key, id_key, lookup_map):
    name = data_map.get(name_key or 'ObjectName', '')
    return name if name and name != '-' else 'Unknown_File'

def _resolve_group(data_map, name_key, id_key, lookup_map):
    name = data_map.get(name_key or 'TargetUserName', '')
    return name if name and name != '-' else 'Unknown_Group'


ENTITY_RESOLVERS = {
    'user': _resolve_user,
    'process': _resolve_process,
    'computer': _resolve_computer,
    'registry': _resolve_registry,
    'task': _resolve_task,
    'service': _resolve_service,
    'file': _resolve_file,
    'group': _resolve_group,
}


def _handle_4624(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map)
    computer = ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "User", user, "Computer", computer, "LOGGED_IN", log['details'])

def _handle_4672(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map)
    computer = ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "User", user, "Computer", computer, "PRIV_LOGON", log['details'])

def _handle_4625(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map)
    computer = ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "User", user, "Computer", computer, "FAILED_LOGON", log['details'])

def _handle_4688(tx, case_id, log, sid_map, proc_map):
    src_proc = ENTITY_RESOLVERS['process'](log['data_map'], 'ParentProcessName', 'ProcessId', proc_map)
    dst_proc = ENTITY_RESOLVERS['process'](log['data_map'], 'NewProcessName', 'NewProcessId', proc_map)
    _insert_graph_relationship(tx, case_id, "Process", src_proc, "Process", dst_proc, "PROCESS_CREATED", log['details'])

def _handle_4698(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map)
    task = ENTITY_RESOLVERS['task'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "User", user, "Task", task, "TASK_CREATED", log['details'])

def _handle_5156(tx, case_id, log, sid_map, proc_map):
    proc = ENTITY_RESOLVERS['process'](log['data_map'], 'Application', 'ProcessId', proc_map)
    computer = ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "Process", proc, "Computer", computer, "NETWORK_CONNECTION", log['details'])

def _handle_4697(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map)
    service = ENTITY_RESOLVERS['service'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "User", user, "Service", service, "SERVICE_INSTALLED", log['details'])

def _handle_4657(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    proc = ENTITY_RESOLVERS['process'](data_map, 'ProcessName', 'ProcessId', proc_map)
    registry = ENTITY_RESOLVERS['registry'](data_map, None, None, {})
    operation_type = data_map.get('OperationType', '').strip()

    action_type = "REGISTRY_MODIFIED"
    if operation_type == '%%1904':
        action_type = "REGISTRY_VALUE_CREATED"
    elif operation_type == '%%1905':
        action_type = "REGISTRY_VALUE_MODIFIED"
    elif operation_type == '%%1906':
        action_type = "REGISTRY_VALUE_DELETED"

    _insert_graph_relationship(tx, case_id, "Process", proc, "Registry", registry, action_type, log['details'])

def _handle_4720(tx, case_id, log, sid_map, proc_map):
    src_user = ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map)
    dst_user = ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetSid', sid_map)
    _insert_graph_relationship(tx, case_id, "User", src_user, "User", dst_user, "USER_CREATED", log['details'])

def _handle_4648(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    src_user = ENTITY_RESOLVERS['user'](data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
    dst_user = ENTITY_RESOLVERS['user'](data_map, 'TargetUserName', 'TargetUserSid', sid_map)
    _insert_graph_relationship(tx, case_id, "User", src_user, "User", dst_user, "EXPLICIT_CREDS_USED", log['details'])

    target_server = data_map.get('TargetServerName', '-')
    if target_server and target_server.lower() not in ["localhost", "127.0.0.1", "-"]:
        _insert_graph_relationship(tx, case_id, "User", src_user, "Computer", target_server.lower(), "REMOTE_ACCESS", log['details'])

def _handle_4696(tx, case_id, log, sid_map, proc_map):
    proc = ENTITY_RESOLVERS['process'](log['data_map'], 'ProcessName', 'TargetProcessId', proc_map)
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetUserSid', sid_map)
    _insert_graph_relationship(tx, case_id, "Process", proc, "User", user, "TOKEN_ASSIGNED", log['details'])

def _handle_4663(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    proc = ENTITY_RESOLVERS['process'](data_map, 'ProcessName', 'ProcessId', proc_map)
    file_obj = ENTITY_RESOLVERS['file'](data_map, None, None, {})
    access_mask_str = data_map.get('AccessMask', '').strip().lower()

    if not access_mask_str.startswith('0x'):
        return

    try:
        mask_val = int(access_mask_str, 16)
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

    _insert_graph_relationship(tx, case_id, "Process", proc, "File", file_obj, action_type, log['details'])

def _handle_1102(tx, case_id, log, sid_map, proc_map):
    user = ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map)
    computer = ENTITY_RESOLVERS['computer'](log['data_map'], None, None, {})
    _insert_graph_relationship(tx, case_id, "User", user, "Computer", computer, "AUDIT_LOG_CLEARED", log['details'])

def _handle_4769(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    user = ENTITY_RESOLVERS['user'](data_map, 'TargetUserName', 'TargetUserSid', sid_map)
    computer = ENTITY_RESOLVERS['computer'](data_map, 'ServiceName', None, {})
    ip_address = data_map.get('IpAddress', '')

    if '@' in user:
        user = user.split('@')[0]

    _insert_graph_relationship(tx, case_id, "User", user, "Computer", computer, "TICKET_REQUESTED", log['details'])

    if ip_address and ip_address not in ['-', '127.0.0.1', '::1']:
        _insert_graph_relationship(tx, case_id, "Computer", ip_address, "User", user, "USED_IP_FOR_TICKET", log['details'])

def _handle_4726(tx, case_id, log, sid_map, proc_map):
    src_user = ENTITY_RESOLVERS['user'](log['data_map'], 'SubjectUserName', 'SubjectUserSid', sid_map)
    dst_user = ENTITY_RESOLVERS['user'](log['data_map'], 'TargetUserName', 'TargetSid', sid_map)
    _insert_graph_relationship(tx, case_id, "User", src_user, "User", dst_user, "USER_DELETED", log['details'])

def _handle_5140(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    user = ENTITY_RESOLVERS['user'](data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
    share = ENTITY_RESOLVERS['file'](data_map, 'ShareName', None, {})
    ip_address = data_map.get('IpAddress', '')

    _insert_graph_relationship(tx, case_id, "User", user, "File", share, "ACCESSED_SHARE", log['details'])

    if ip_address and ip_address not in ['-', '127.0.0.1', '::1']:
        _insert_graph_relationship(tx, case_id, "Computer", ip_address, "File", share, "REMOTE_SHARE_ACCESS", log['details'])

def _handle_4732(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    src_user = ENTITY_RESOLVERS['user'](data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
    dst_user = ENTITY_RESOLVERS['user'](data_map, 'MemberName', 'MemberSid', sid_map)
    group = ENTITY_RESOLVERS['group'](data_map, None, None, {})
    _insert_graph_relationship(tx, case_id, "User", dst_user, "Group", group, "ADDED_TO_GROUP", log['details'])
    _insert_graph_relationship(tx, case_id, "User", src_user, "Group", group, "MODIFIED_GROUP", log['details'])

def _handle_4656(tx, case_id, log, sid_map, proc_map):
    data_map = log['data_map']
    proc = ENTITY_RESOLVERS['process'](data_map, 'ProcessName', 'ProcessId', proc_map)
    obj_type = data_map.get('ObjectType', 'Unknown_Type')
    if obj_type.lower() == 'process':
        target = ENTITY_RESOLVERS['process'](data_map, 'ObjectName', None, proc_map)
        _insert_graph_relationship(tx, case_id, "Process", proc, "Process", target, "REQUESTED_HANDLE", log['details'])
    else:
        target = ENTITY_RESOLVERS['file'](data_map, None, None, {})
        _insert_graph_relationship(tx, case_id, "Process", proc, "File", target, "REQUESTED_HANDLE", log['details'])


EVENT_HANDLERS = {
    '4624': _handle_4624,
    '4672': _handle_4672,
    '4625': _handle_4625,
    '4688': _handle_4688,
    '4698': _handle_4698,
    '5156': _handle_5156,
    '4697': _handle_4697,
    '4657': _handle_4657,
    '4720': _handle_4720,
    '4648': _handle_4648,
    '4696': _handle_4696,
    '4663': _handle_4663,
    '1102': _handle_1102,
    '4769': _handle_4769,
    '4726': _handle_4726,
    '5140': _handle_5140,
    '4732': _handle_4732,
    '4656': _handle_4656,
}


def _process_event_logic(tx, case_id, log, sid_map, proc_map):
    handler = EVENT_HANDLERS.get(log['event_id'])
    if handler:
        handler(tx, case_id, log, sid_map, proc_map)


def parse_and_store_evtx(filepath, case_id, case_name, db_client):
    """
    Parses a Windows EVTX file, extracts relevant forensic events,
    and stores them as a graph inside Neo4j.
    """
    parsed_logs = []
    sid_map = {}
    proc_map = {}

    with evtx.Evtx(filepath) as logs:
        for record in logs.records():
            try:
                xml_content = record.xml().replace('xmlns="http://schemas.microsoft.com/win/2004/08/events/event"', '')
                root = ET.fromstring(xml_content)

                system_node = root.find(".//System")
                if system_node is None: continue

                event_id_node = system_node.find("EventID")
                if event_id_node is None: continue
                event_id = event_id_node.text

                computer_node = system_node.find("Computer")
                host_name = computer_node.text.lower() if computer_node is not None else "Unknown"

                time_node = system_node.find("TimeCreated")
                timestamp = time_node.get('SystemTime') if time_node is not None else "-"

                data_items = root.findall(".//EventData/Data")
                data_map = {item.get('Name'): (item.text or "") for item in data_items}
                data_map['_host_name'] = host_name

                if not data_map:
                    user_data = root.find(".//UserData")
                    if user_data is not None and len(user_data) > 0:
                        for child in user_data[0]:
                            clean_tag = child.tag.split('}')[-1]
                            data_map[clean_tag] = child.text or ""

                for sid_key, name_key in [('SubjectUserSid', 'SubjectUserName'), ('TargetUserSid', 'TargetUserName'), ('TargetSid', 'TargetUserName')]:
                    sid = data_map.get(sid_key)
                    name = data_map.get(name_key)
                    if sid and name and name not in ['-', ''] and sid != 'S-1-0-0':
                        sid_map[sid] = name

                for id_key, name_key in [('ProcessId', 'ProcessName'), ('NewProcessId', 'NewProcessName'), ('TargetProcessId', 'ProcessName')]:
                    pid = data_map.get(id_key)
                    pname = data_map.get(name_key)
                    if pid and pname and pname not in ['-', '']:
                        proc_map[pid] = pname.split('\\')[-1]

                parsed_logs.append({
                    'event_id': event_id,
                    'host_name': host_name,
                    'timestamp': timestamp,
                    'data_map': data_map,
                    'details': {"event_id": event_id, "timestamp": timestamp, **_interpret_details(data_map)},
                })
            except Exception:
                continue

    with db_client.driver.session() as session:
        tx = session.begin_transaction()
        try:
            tx.run(
                "CREATE (i:Investigation {case_id: $case_id, name: $name, created_at: timestamp()})",
                case_id=case_id,
                name=case_name
            )

            for count, log in enumerate(parsed_logs):
                _process_event_logic(tx, case_id, log, sid_map, proc_map)

                if count > 0 and count % 2000 == 0:
                    tx.commit()
                    tx = session.begin_transaction()

            tx.commit()
            logger.info(f"Successfully processed and stored EVTX for case {case_id}")

        except Exception as e:
            tx.rollback()
            logger.error(f"Transaction failed during EVTX storage: {e}")
            raise

    return case_id
