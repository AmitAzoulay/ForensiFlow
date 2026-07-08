import logging
import re
import xml.etree.ElementTree as ET
import Evtx.Evtx as evtx

from services.handlers import EVENT_HANDLERS
from constants.windows_event_codes import FIELD_MAPS, WINDOWS_CODE_MAP

logger = logging.getLogger(__name__)

_CODE_RE = re.compile(r'%%\d+')


def _interpret_value(field_name: str, raw: str) -> str:
    if not raw or raw == '-':
        return raw
    field_map = FIELD_MAPS.get(field_name)
    if field_map:
        interp = field_map.get(raw.lower().strip())
        if interp:
            return f"{interp} ({raw})"
    if _CODE_RE.search(raw):
        def _replace(m):
            code = m.group(0)
            interp = WINDOWS_CODE_MAP.get(code)
            return f"{interp} ({code})" if interp else code
        return _CODE_RE.sub(_replace, raw)
    return raw


def _interpret_details(data_map: dict) -> dict:
    return {
        k: _interpret_value(k, v) if isinstance(v, str) else v
        for k, v in data_map.items()
        if not k.startswith('_')
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
            tx.commit()
        except Exception as e:
            try:
                tx.rollback()
            except Exception:
                pass
            logger.error(f"Failed to create investigation node: {e}")
            raise

        tx = session.begin_transaction()
        for count, log in enumerate(parsed_logs):
            try:
                _process_event_logic(tx, case_id, log, sid_map, proc_map)
            except Exception as e:
                logger.warning(f"Handler error for event {log['event_id']}, skipping and restarting transaction: {e}")
                try:
                    tx.rollback()
                except Exception:
                    pass
                tx = session.begin_transaction()
                continue

            if count > 0 and count % 2000 == 0:
                tx.commit()
                tx = session.begin_transaction()

        try:
            tx.commit()
            logger.info(f"Successfully processed and stored EVTX for case {case_id}")
        except Exception as e:
            logger.warning(f"Final commit partial failure, some events may be missing: {e}")
            try:
                tx.rollback()
            except Exception:
                pass

    return case_id
