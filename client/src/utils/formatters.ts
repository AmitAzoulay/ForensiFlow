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

  return rawText;
}
