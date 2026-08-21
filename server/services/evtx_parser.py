import logging
import re
import time
import xml.etree.ElementTree as ET
import Evtx.Evtx as evtx

from services.handlers import EVENT_HANDLERS
from constants.windows_event_codes import FIELD_MAPS, WINDOWS_CODE_MAP

logger = logging.getLogger(__name__)

_CODE_RE = re.compile(r'%%\d+')

_ACCESS_MASK_BITS = [
    (0x1,      'Read Data / List Dir'),
    (0x2,      'Write Data / Add File'),
    (0x4,      'Append Data / Add Subdir'),
    (0x8,      'Read Extended Attrs'),
    (0x10,     'Write Extended Attrs'),
    (0x20,     'Execute / Traverse'),
    (0x40,     'Delete Child'),
    (0x80,     'Read Attributes'),
    (0x100,    'Write Attributes'),
    (0x10000,  'Delete'),
    (0x20000,  'Read Control'),
    (0x40000,  'Write DAC'),
    (0x80000,  'Write Owner'),
    (0x100000, 'Synchronize'),
]

_SERVICE_TYPE_BITS = [
    (0x1,   'Kernel Driver'),
    (0x2,   'File System Driver'),
    (0x4,   'Adapter'),
    (0x8,   'Recognizer Driver'),
    (0x10,  'Win32 Own Process'),
    (0x20,  'Win32 Share Process'),
    (0x100, 'Interactive Process'),
]

_TICKET_OPTIONS_BITS = [
    (0x40000000, 'Forwardable'),
    (0x20000000, 'Forwarded'),
    (0x10000000, 'Proxiable'),
    (0x08000000, 'Proxy'),
    (0x02000000, 'Postdated'),
    (0x01000000, 'Invalid'),
    (0x00800000, 'Renewable'),
    (0x00200000, 'Initial'),
    (0x00100000, 'Pre-Authenticated'),
    (0x00080000, 'HW-Authenticated'),
    (0x00010000, 'OK-as-Delegate'),
]

_BITMASK_FIELDS = {
    'AccessMask':    _ACCESS_MASK_BITS,
    'Accesses':      _ACCESS_MASK_BITS,
    'ServiceType':   _SERVICE_TYPE_BITS,
    'TicketOptions': _TICKET_OPTIONS_BITS,
}


def _decode_bitmask(raw: str, bit_table: list) -> str:
    try:
        val = int(raw, 16) if raw.lower().startswith('0x') else int(raw)
    except (ValueError, TypeError):
        return raw
    flags = [label for bit, label in bit_table if val & bit]
    return f"{raw} ({', '.join(flags)})" if flags else raw


def _interpret_value(field_name: str, raw: str) -> str:
    if not raw or raw == '-':
        return raw

    # Bitmask fields — fall through if the value isn't a plain hex/int
    bit_table = _BITMASK_FIELDS.get(field_name)
    if bit_table:
        result = _decode_bitmask(raw, bit_table)
        if result != raw:
            return result

    # Lookup-table fields (NTSTATUS, Kerberos, LogonType, etc.)
    field_map = FIELD_MAPS.get(field_name)
    if field_map:
        interp = field_map.get(raw.lower().strip()) or field_map.get(raw.strip())
        if interp:
            return f"{interp} ({raw})"

    # %%code substitution (OperationType, ImpersonationLevel, etc.)
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
    start_time = time.perf_counter()
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

    parse_elapsed = time.perf_counter() - start_time
    logger.info(
        f"Parsed {len(parsed_logs)} events from {filepath} in {parse_elapsed:.2f}s "
        f"({(len(parsed_logs) / parse_elapsed if parse_elapsed > 0 else 0):.1f} logs/sec)"
    )

    store_start = time.perf_counter()

    with db_client.driver.session() as session:
        tx = session.begin_transaction()
        try:
            tx.run(
                "CREATE (i:Investigation {case_id: $case_id, name: $name, created_at: timestamp(), notebook_text: ''})",
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
            store_elapsed = time.perf_counter() - store_start
            total_elapsed = time.perf_counter() - start_time
            logs_per_second = len(parsed_logs) / total_elapsed if total_elapsed > 0 else 0
            logger.info(
                f"Successfully processed and stored EVTX for case {case_id}: "
                f"{len(parsed_logs)} logs stored in {store_elapsed:.2f}s, "
                f"total {total_elapsed:.2f}s ({logs_per_second:.1f} logs/sec)"
            )
        except Exception as e:
            logger.warning(f"Final commit partial failure, some events may be missing: {e}")
            try:
                tx.rollback()
            except Exception:
                pass

    return case_id
