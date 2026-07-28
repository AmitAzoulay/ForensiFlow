// Field values arrive pre-interpreted from the server.
// This function is kept as a passthrough so callers don't need updating;
// it exists as a hook if client-side display overrides are ever needed.
export function formatFilterValue(_fieldName: string, rawValue: string | number | null | undefined): string {
  return String(rawValue ?? '').trim();
}
