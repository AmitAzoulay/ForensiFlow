export const WINDOWS_CODE_MAP: Record<string, string> = {
  '%%1904': 'New value created',
  '%%1905': 'Value modified',
  '%%1906': 'Value deleted',
  '%%1936': 'Type 1 - Default',
  '%%1937': 'Type 2 - Elevated',
  '%%1938': 'Type 3 - Limited',
  '%%1832': 'Anonymous',
  '%%1833': 'Identification',
  '%%1840': 'Impersonation',
  '%%1841': 'Delegation',
  '%%1842': 'Yes',
  '%%1843': 'No',
  '%%14592': 'Inbound',
  '%%14593': 'Outbound',
};

export const FIELD_VALUE_MAPS: Record<string, Record<string, string>> = {
  OperationType: {
    '%%1904': 'New value created',
    '%%1905': 'Value modified',
    '%%1906': 'Value deleted',
  },
  Status: {
    '0x0': 'Success',
    '0xc0000064': 'Unknown username',
    '0xc000006a': 'Wrong password',
    '0xc000006d': 'Bad credentials',
  },
  SubStatus: {
    '0x0': 'Success',
    '0xc0000064': 'Unknown username',
    '0xc000006a': 'Wrong password',
    '0xc000006d': 'Bad credentials',
  },
  FailureCode: {
    '0x0': 'Success',
    '0x1': 'Client not found in Kerberos database',
    '0x18': 'Pre-authentication failed (wrong password)',
  },
};

export function parseNumericValue(value: string): number | null {
  if (!value) return null;
  const normalized = value.trim();
  const parsed = parseInt(
    normalized.startsWith('0x') ? normalized.slice(2) : normalized,
    normalized.startsWith('0x') ? 16 : 10,
  );
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatAccessMask(rawValue: string): string {
  const hexVal = parseNumericValue(rawValue);
  if (hexVal === null) return rawValue;

  const accessTypes: string[] = [];
  if (hexVal & 0x1)      accessTypes.push('Read Data / List Dir');
  if (hexVal & 0x2)      accessTypes.push('Write Data / Add File');
  if (hexVal & 0x4)      accessTypes.push('Append Data / Add Subdir');
  if (hexVal & 0x8)      accessTypes.push('Read Extended Attrs');
  if (hexVal & 0x10)     accessTypes.push('Write Extended Attrs');
  if (hexVal & 0x20)     accessTypes.push('Execute / Traverse');
  if (hexVal & 0x40)     accessTypes.push('Delete Child');
  if (hexVal & 0x80)     accessTypes.push('Read Attributes');
  if (hexVal & 0x100)    accessTypes.push('Write Attributes');
  if (hexVal & 0x10000)  accessTypes.push('Delete');
  if (hexVal & 0x20000)  accessTypes.push('Read Control');
  if (hexVal & 0x40000)  accessTypes.push('Write DAC');
  if (hexVal & 0x80000)  accessTypes.push('Write Owner');
  if (hexVal & 0x100000) accessTypes.push('Synchronize');

  return accessTypes.length > 0 ? `${rawValue} (${accessTypes.join(', ')})` : rawValue;
}

export function formatFilterValue(fieldName: string, rawValue: string | number | null | undefined): string {
  const normalized = String(rawValue ?? '').trim();
  if (!normalized || normalized === '-') return normalized;

  if (normalized.includes('(') && normalized.includes(')')) {
    return normalized;
  }

  const lowerField = fieldName.toLowerCase();
  if (lowerField === 'accessmask' || lowerField === 'accesses') {
    return formatAccessMask(normalized);
  }

  const fieldMap = FIELD_VALUE_MAPS[fieldName] ?? FIELD_VALUE_MAPS[fieldName.toLowerCase()];
  if (fieldMap) {
    const translated = fieldMap[normalized.toLowerCase()];
    if (translated) return `${translated} (${normalized})`;
  }

  const codeMapValue = WINDOWS_CODE_MAP[normalized.toLowerCase()];
  if (codeMapValue) return `${codeMapValue} (${normalized})`;

  return normalized;
}

export function formatTicketOptions(optStr: string): string {
  const hexVal = parseInt(optStr, 16);
  if (isNaN(hexVal)) return optStr;

  const flags: string[] = [];
  if (hexVal & 0x40000000) flags.push('Forwardable');
  if (hexVal & 0x20000000) flags.push('Forwarded');
  if (hexVal & 0x10000000) flags.push('Proxiable');
  if (hexVal & 0x08000000) flags.push('Proxy');
  if (hexVal & 0x02000000) flags.push('Postdated');
  if (hexVal & 0x01000000) flags.push('Invalid');
  if (hexVal & 0x00800000) flags.push('Renewable');
  if (hexVal & 0x00200000) flags.push('Initial');
  if (hexVal & 0x00100000) flags.push('Pre-Authenticated');
  if (hexVal & 0x00080000) flags.push('HW-Authenticated');
  if (hexVal & 0x00010000) flags.push('OK-as-Delegate');

  return flags.length > 0 ? `${optStr} (${flags.join(', ')})` : optStr;
}

export function formatLogonType(type: string): string {
  const types: Record<string, string> = {
    '2': 'Interactive (Local)',
    '3': 'Network (Remote)',
    '4': 'Batch',
    '5': 'Service',
    '7': 'Unlock',
    '8': 'NetworkCleartext',
    '9': 'NewCredentials',
    '10': 'RemoteInteractive (RDP)',
    '11': 'CachedInteractive',
  };
  return types[type] ? `${type} (${types[type]})` : type;
}

export function formatStartType(startTypeStr: string): string {
  const types: Record<string, string> = {
    '0': 'Boot Start',
    '1': 'System Start',
    '2': 'Auto Start',
    '3': 'Demand Start',
    '4': 'Disabled',
  };
  return types[startTypeStr] ? `${startTypeStr} (${types[startTypeStr]})` : startTypeStr;
}

export function formatServiceType(serviceTypeStr: string): string {
  const val = parseInt(serviceTypeStr.startsWith('0x') ? serviceTypeStr.slice(2) : serviceTypeStr, 16);
  if (isNaN(val)) return serviceTypeStr;

  const types: string[] = [];
  if (val & 0x1)   types.push('Kernel Driver');
  if (val & 0x2)   types.push('File System Driver');
  if (val & 0x4)   types.push('Adapter');
  if (val & 0x8)   types.push('Recognizer Driver');
  if (val & 0x10)  types.push('Win32 Own Process');
  if (val & 0x20)  types.push('Win32 Share Process');
  if (val & 0x100) types.push('Interactive Process');

  return types.length > 0 ? `${serviceTypeStr} (${types.join(' + ')})` : serviceTypeStr;
}

export function formatDataValue(key: string, value: any): string {
  const strVal = String(value);
  if (!strVal || strVal === '-') return '-';
  if (key === 'AccessMask' || key === 'Accesses') return formatAccessMask(strVal);
  if (key === 'TicketOptions')    return formatTicketOptions(strVal);
  if (key === 'ServiceStartType') return formatStartType(strVal);
  if (key === 'ServiceType')      return formatServiceType(strVal);
  if (key === 'LogonType')        return formatLogonType(strVal);
  return strVal;
}
