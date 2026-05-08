import logging
import xml.etree.ElementTree as ET
import Evtx.Evtx as evtx

logger = logging.getLogger(__name__)

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

    valid_labels = ["User", "Computer", "Process", "Registry", "Task", "Service", "File"]
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


def _resolve_user(data_map, name_key, sid_key, sid_map):
    """Resolves a generic username using the SID map if the name is missing."""
    name = data_map.get(name_key, "")
    if name and name != '-': 
        return name
    
    sid = data_map.get(sid_key, "")
    if sid in sid_map: 
        return sid_map[sid]
        
    return sid if sid and sid != '-' else "Unknown_User"


def _resolve_process(data_map, name_key, id_key, proc_map):
    pid = data_map.get(id_key, "")
    name = data_map.get(name_key, "")
    
    if name and name != '-': 
        clean_name = name.split('\\')[-1]
    elif pid in proc_map: 
        clean_name = proc_map[pid]
    else:
        clean_name = "Unknown_Process"
        
    pid_val = pid if pid and pid != '-' else clean_name
    
    return (pid_val, clean_name)


def _process_event_logic(tx, case_id, log, sid_map, proc_map):
    """
    Routes the parsed log to the correct Neo4j relationship builder based on Event ID.
    """
    event_id = log['event_id']
    host_name = log['host_name']
    data_map = log['data_map']
    
    details = {"event_id": event_id, "timestamp": log['timestamp']}
    details.update(data_map) 

    if event_id == '4624':
        user = _resolve_user(data_map, 'TargetUserName', 'TargetUserSid', sid_map)
        _insert_graph_relationship(tx, case_id, "User", user, "Computer", host_name, "LOGGED_IN", details)

    elif event_id == '4672':
        user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        _insert_graph_relationship(tx, case_id, "User", user, "Computer", host_name, "PRIV_LOGON", details)

    elif event_id == '4625':
        user = _resolve_user(data_map, 'TargetUserName', 'TargetUserSid', sid_map)
        _insert_graph_relationship(tx, case_id, "User", user, "Computer", host_name, "FAILED_LOGON", details)

    elif event_id == '4688':
        src_proc = _resolve_process(data_map, 'ParentProcessName', 'ProcessId', proc_map)
        dst_proc = _resolve_process(data_map, 'NewProcessName', 'NewProcessId', proc_map)
        _insert_graph_relationship(tx, case_id, "Process", src_proc, "Process", dst_proc, "PROCESS_CREATED", details)

    elif event_id == '4698':
        user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        task = data_map.get('TaskName', 'Unknown_Task')
        _insert_graph_relationship(tx, case_id, "User", user, "Task", task, "TASK_CREATED", details)

    elif event_id == '5156':
        proc = _resolve_process(data_map, 'Application', 'ProcessId', proc_map)
        _insert_graph_relationship(tx, case_id, "Process", proc, "Computer", host_name, "NETWORK_CONNECTION", details)

    elif event_id == '4697':
        user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        service = data_map.get('ServiceName', 'Unknown_Service')
        _insert_graph_relationship(tx, case_id, "User", user, "Service", service, "SERVICE_INSTALLED", details)

    elif event_id == '4657':
        proc = _resolve_process(data_map, 'ProcessName', 'ProcessId', proc_map)
        obj_name = data_map.get('ObjectName', '')
        val_name = data_map.get('ObjectValueName', '')
        
        reg_path = f"{obj_name}\\{val_name}" if val_name else obj_name
        if not reg_path or reg_path == "-": 
            reg_path = "Unknown_Registry_Key"
            
        _insert_graph_relationship(tx, case_id, "Process", proc, "Registry", reg_path, "REGISTRY_MODIFIED", details)

    elif event_id == '4720':
        src_user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        dst_user = _resolve_user(data_map, 'TargetUserName', 'TargetSid', sid_map)
        _insert_graph_relationship(tx, case_id, "User", src_user, "User", dst_user, "USER_CREATED", details)

    elif event_id == '4648':
        src_user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        dst_user = _resolve_user(data_map, 'TargetUserName', 'TargetUserSid', sid_map)
        _insert_graph_relationship(tx, case_id, "User", src_user, "User", dst_user, "EXPLICIT_CREDS_USED", details)
        
        target_server = data_map.get('TargetServerName', '-')
        if target_server and target_server.lower() not in ["localhost", "127.0.0.1", "-"]:
            _insert_graph_relationship(tx, case_id, "User", src_user, "Computer", target_server.lower(), "REMOTE_ACCESS", details)

    elif event_id == '4696':
        proc = _resolve_process(data_map, 'ProcessName', 'TargetProcessId', proc_map)
        user = _resolve_user(data_map, 'TargetUserName', 'TargetUserSid', sid_map)
        _insert_graph_relationship(tx, case_id, "Process", proc, "User", user, "TOKEN_ASSIGNED", details)

    elif event_id == '4663':
        proc = _resolve_process(data_map, 'ProcessName', 'ProcessId', proc_map)
        file_obj = data_map.get('ObjectName', 'Unknown_Object')
        _insert_graph_relationship(tx, case_id, "Process", proc, "File", file_obj, "OBJECT_ACCESSED", details)
    elif event_id == '1102':
        user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        _insert_graph_relationship(tx, case_id, "User", user, "Computer", host_name, "AUDIT_LOG_CLEARED", details)
    
    elif event_id == '4769':
        user = _resolve_user(data_map, 'TargetUserName', 'TargetUserSid', sid_map)
        service_name = data_map.get('ServiceName', 'Unknown_Service')
        ip_address = data_map.get('IpAddress', '')
        
        # Clean domain suffix from username if present for better readability
        if '@' in user:
            user = user.split('@')[0]
            
        _insert_graph_relationship(tx, case_id, "User", user, "Computer", service_name, "TICKET_REQUESTED", details)
        
        # Map source IP if it's a remote request
        if ip_address and ip_address not in ['-', '127.0.0.1', '::1']:
            _insert_graph_relationship(tx, case_id, "Computer", ip_address, "User", user, "USED_IP_FOR_TICKET", details)

    elif event_id == '4726':
        src_user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        dst_user = _resolve_user(data_map, 'TargetUserName', 'TargetSid', sid_map)
        
        _insert_graph_relationship(tx, case_id, "User", src_user, "User", dst_user, "USER_DELETED", details)
    elif event_id == '5140':
        user = _resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid', sid_map)
        share_name = data_map.get('ShareName', 'Unknown_Share')
        ip_address = data_map.get('IpAddress', '')
        
        
        _insert_graph_relationship(tx, case_id, "User", user, "File", share_name, "ACCESSED_SHARE", details)
        
        
        if ip_address and ip_address not in ['-', '127.0.0.1', '::1']:
             _insert_graph_relationship(tx, case_id, "Computer", ip_address, "File", share_name, "REMOTE_SHARE_ACCESS", details)

def parse_and_store_evtx(filepath, case_id, case_name, db_client):
    """
    Parses a Windows EVTX file, extracts relevant forensic events, 
    and stores them as a graph inside Neo4j.
    """
    parsed_logs = []
    sid_map = {}
    proc_map = {}

    # Step 1: Parse XML from EVTX and build entity maps
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
                # Add this block to support UserData payloads like Event 1102
                
                if not data_map:
                    user_data = root.find(".//UserData")
                    if user_data is not None and len(user_data) > 0:
                        for child in user_data[0]:
                            clean_tag = child.tag.split('}')[-1]
                            data_map[clean_tag] = child.text or ""

                # Build SID mapping for user resolution
                for sid_key, name_key in [('SubjectUserSid', 'SubjectUserName'), ('TargetUserSid', 'TargetUserName'), ('TargetSid', 'TargetUserName')]:
                    sid = data_map.get(sid_key)
                    name = data_map.get(name_key)
                    if sid and name and name not in ['-', ''] and sid != 'S-1-0-0':
                        sid_map[sid] = name

                # Build Process ID mapping
                for id_key, name_key in [('ProcessId', 'ProcessName'), ('NewProcessId', 'NewProcessName'), ('TargetProcessId', 'ProcessName')]:
                    pid = data_map.get(id_key)
                    pname = data_map.get(name_key)
                    if pid and pname and pname not in ['-', '']:
                        proc_map[pid] = pname.split('\\')[-1]

                parsed_logs.append({
                    'event_id': event_id,
                    'host_name': host_name,
                    'timestamp': timestamp,
                    'data_map': data_map
                })
            except Exception as e:
                # Silently skip malformed individual log entries but continue processing
                continue

    # Step 2: Insert into Neo4j in batches
    with db_client.driver.session() as session:
        tx = session.begin_transaction()
        try:
            # Initialize the investigation metadata node
            tx.run(
                "CREATE (i:Investigation {case_id: $case_id, name: $name, created_at: timestamp()})", 
                case_id=case_id, 
                name=case_name
            )

            for count, log in enumerate(parsed_logs):
                _process_event_logic(tx, case_id, log, sid_map, proc_map)

                # Commit in batches of 2000 to prevent memory exhaustion
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