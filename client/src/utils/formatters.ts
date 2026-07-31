// Field values arrive pre-interpreted from the server.
// This function is kept as a small display layer so callers can still get
// analyst-friendly labels for common Windows-style filter values.
export function formatFilterValue(fieldName: string, rawValue: string | number | null | undefined): string {
  const rawText = String(rawValue ?? '').trim();
  if (!rawText) return rawText;

  const normalized = rawText.toLowerCase();

  if (fieldName === 'Status') {
    const statusLabels: Record<string, string> = {
      '0x0': 'Success',
      '0xc0000064': 'User logon failure',
      '0xc000006a': 'Wrong password',
      '0xc0000234': 'User account locked',
    };

    const label = statusLabels[normalized];
    return label ? `${label} (${rawText})` : rawText;
  }

  if (fieldName === 'AccessMask') {
    const permissions: string[] = [];
    const numericValue = parseInt(rawText.startsWith('0x') ? rawText.slice(2) : rawText, rawText.startsWith('0x') ? 16 : 10);
    if (!Number.isNaN(numericValue)) {
      if (numericValue & 0x1) permissions.push('Read Data / List Dir');
      if (numericValue & 0x2) permissions.push('Write Data / Add File');
      if (numericValue & 0x4) permissions.push('Append Data / Add Subdir');
      if (numericValue & 0x8) permissions.push('Read EA');
      if (numericValue & 0x10) permissions.push('Write EA');
      if (numericValue & 0x20) permissions.push('Execute / Traverse');
      if (numericValue & 0x40) permissions.push('Delete Child');
      if (numericValue & 0x80) permissions.push('Read Attributes');
      if (numericValue & 0x100) permissions.push('Write Attributes');
      if (numericValue & 0x200) permissions.push('Delete');
      if (numericValue & 0x400) permissions.push('Read Permissions');
      if (numericValue & 0x800) permissions.push('Write DAC');
      if (numericValue & 0x1000) permissions.push('Write Owner');
      if (numericValue & 0x2000) permissions.push('Synchronize');
      if (numericValue & 0x10000000) permissions.push('Read');
      if (numericValue & 0x20000000) permissions.push('Write');
      if (numericValue & 0x40000000) permissions.push('Execute');
      if (numericValue & 0x80000000) permissions.push('Delete');
    }

    if (permissions.length > 0) {
      return `${rawText} (${permissions.join(', ')})`;
    }
  }

  return rawText;
}
