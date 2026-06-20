import logging
import re
import xml.etree.ElementTree as ET
import Evtx.Evtx as evtx

from services.handlers import EVENT_HANDLERS

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
    # User account attribute placeholders (events 4720, 4738, 4741)
    '%%1793': '<not set>',
    '%%1794': 'Never',
    '%%1797': 'All',
    # UserAccountControl flags (events 4720, 4738, 4741, 4742)
    '%%2080': 'Normal Account',
    '%%2082': 'Account Disabled',
    '%%2084': 'Home Directory Required',
    '%%2086': 'Locked Out',
    '%%2088': 'Password Not Required',
    '%%2090': 'User Cannot Change Password',
    '%%2092': 'Encrypted Text Password Allowed',
    '%%2094': 'Temp Duplicate Account',
    '%%2096': 'Normal Account',
    '%%2098': 'MNS Logon Account',
    '%%2100': 'Interdomain Trust Account',
    '%%2102': 'Workstation Trust Account',
    '%%2104': 'Server Trust Account',
    '%%2106': 'Password Never Expires',
    '%%2108': 'MNS Logon Account',
    '%%2110': 'Smartcard Required',
    '%%2112': 'Trusted for Delegation',
    '%%2114': 'Not Delegated',
    '%%2116': 'Use DES Key Only',
    '%%2118': 'Do Not Require Pre-Auth',
    '%%2120': 'Password Expired',
    '%%2122': 'Trusted to Authenticate for Delegation',
    '%%2124': 'Partial Secrets Account (RODC)',
    # Standard access rights (AccessList field — events 4663, 4656, 4670)
    '%%1537': 'Delete',
    '%%1538': 'Read Control',
    '%%1539': 'Write DAC',
    '%%1540': 'Write Owner',
    '%%1541': 'Synchronize',
    '%%1542': 'Access System Security',
    # Object-specific access rights (AccessList field — events 4663, 4656)
    '%%4416': 'Read Data / List Directory',
    '%%4417': 'Write Data / Add File',
    '%%4418': 'Append Data / Add Subdirectory',
    '%%4419': 'Read Extended Attributes',
    '%%4420': 'Write Extended Attributes',
    '%%4421': 'Execute / Traverse',
    '%%4423': 'Read Attributes',
    '%%4424': 'Write Attributes',
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

_KERBEROS_STATUS_MAP = {
    '0x0':  'Success',
    '0x1':  'Client not found in Kerberos database',
    '0x2':  'Server not found in Kerberos database',
    '0x6':  'Bad network address / client not found',
    '0x7':  'Protocol version mismatch',
    '0x8':  'Integrity check failed',
    '0xc':  'KDC policy rejection',
    '0xd':  'Bad Kerberos option',
    '0x12': 'Credentials revoked / account disabled',
    '0x17': 'Password expired',
    '0x18': 'Pre-authentication failed (wrong password)',
    '0x19': 'Pre-authentication required',
    '0x1a': 'Server principal not valid yet',
    '0x24': 'Certificate mismatch',
    '0x25': 'Integrity check failed on AP response',
    '0x29': 'Request is a replay',
    '0x2c': 'Bad key version number',
    '0x2d': 'Service key expired',
    '0x32': 'Kerberos application error',
}

_PRE_AUTH_TYPE_MAP = {
    '0':  'No Pre-Authentication',
    '2':  'Password (RC4/NTLM)',
    '15': 'PKINIT (Certificate)',
    '17': 'Hardware Token (Smartcard)',
    '18': 'PKINIT (MS Extension)',
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
    'FailureCode':          _KERBEROS_STATUS_MAP,
    'TicketEncryptionType': _ENCRYPTION_TYPE_MAP,
    'Protocol':             _PROTOCOL_MAP,
    'PreAuthType':          _PRE_AUTH_TYPE_MAP,
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


def _process_event_logic(tx, case_id, log, sid_map, proc_map):
    handler = EVENT_HANDLERS.get(log['event_id'])
    if handler:
        try:
            handler(tx, case_id, log, sid_map, proc_map)
        except Exception as e:
            logger.error(f"Handler failed for event {log['event_id']}: {e}")


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
