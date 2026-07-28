WINDOWS_CODE_MAP = {
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

KERBEROS_STATUS_MAP = {
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

PRE_AUTH_TYPE_MAP = {
    '0':  'No Pre-Authentication',
    '2':  'Password (RC4/NTLM)',
    '15': 'PKINIT (Certificate)',
    '17': 'Hardware Token (Smartcard)',
    '18': 'PKINIT (MS Extension)',
}

NTSTATUS_MAP = {
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

ENCRYPTION_TYPE_MAP = {
    '0x1':        'DES-CBC-CRC legacy',
    '0x3':        'DES-CBC-MD5 legacy',
    '0x11':       'AES128-CTS-HMAC-SHA1',
    '0x12':       'AES256-CTS-HMAC-SHA1',
    '0x17':       'RC4-HMAC legacy',
    '0x18':       'RC4-HMAC-EXP legacy',
    '0xffffffff': 'N/A',
}

PROTOCOL_MAP = {
    '1':  'ICMP',
    '6':  'TCP',
    '17': 'UDP',
    '41': 'IPv6',
    '47': 'GRE',
    '58': 'ICMPv6',
}

LOGON_TYPE_MAP = {
    '2':  'Interactive (Local)',
    '3':  'Network (Remote)',
    '4':  'Batch',
    '5':  'Service',
    '7':  'Unlock',
    '8':  'NetworkCleartext',
    '9':  'NewCredentials',
    '10': 'RemoteInteractive (RDP)',
    '11': 'CachedInteractive',
}

SERVICE_START_TYPE_MAP = {
    '0': 'Boot Start',
    '1': 'System Start',
    '2': 'Auto Start',
    '3': 'Demand Start',
    '4': 'Disabled',
}

FIELD_MAPS = {
    'Status':               NTSTATUS_MAP,
    'SubStatus':            NTSTATUS_MAP,
    'FailureCode':          KERBEROS_STATUS_MAP,
    'TicketEncryptionType': ENCRYPTION_TYPE_MAP,
    'Protocol':             PROTOCOL_MAP,
    'PreAuthType':          PRE_AUTH_TYPE_MAP,
    'LogonType':            LOGON_TYPE_MAP,
    'ServiceStartType':     SERVICE_START_TYPE_MAP,
}
