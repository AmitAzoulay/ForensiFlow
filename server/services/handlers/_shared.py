import logging

logger = logging.getLogger(__name__)

ENTITY_RESOLVERS = {}


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
    'user':     _resolve_user,
    'process':  _resolve_process,
    'computer': _resolve_computer,
    'registry': _resolve_registry,
    'task':     _resolve_task,
    'service':  _resolve_service,
    'file':     _resolve_file,
    'group':    _resolve_group,
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
    CREATE (source)-[r:{rel_type}]->(target)
    SET r += $details
    """
    tx.run(query, case_id=case_id, s_id=s_id, s_name=s_name, t_id=t_id, t_name=t_name, details=details)
