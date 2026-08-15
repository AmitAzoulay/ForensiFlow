import { describe, expect, it } from 'vitest';

import { parseNumericValue, tokenize } from '../App';
import { formatFilterValue } from '../utils/formatters';

describe('App query helpers', () => {
  it('tokenizes logical query operators and terms', () => {
    // This test confirms query text becomes structured tokens for the filter engine.
    // Mixed content is used here: one relation token, one boolean operator, one field filter term.
    const result = tokenize('FAILED_LOGON AND 4624.TargetUserName==admin');

    // We assert exact token order because downstream parsing depends on deterministic sequencing.
    expect(result).toEqual([
      { type: 'TERM', value: 'FAILED_LOGON' },
      { type: 'AND' },
      { type: 'TERM', value: '4624.TargetUserName==admin' },
    ]);
  });

  it('parses hexadecimal strings into numbers', () => {
    // This test verifies support for Windows-style hex values (0x...).
    // 0x10 in base-16 equals decimal 16.
    expect(parseNumericValue('0x10')).toBe(16);
  });

  it('adds human-readable meaning to status codes', () => {
    // This test checks that raw status values are translated for analyst readability.
    // This status code is expected to map to the friendly "Wrong password" label.
    const result = formatFilterValue('Status', '0xc000006a');

    expect(result).toBe('Wrong password (0xc000006a)');
  });

  it('supports parentheses and NOT tokenization', () => {
    // This test covers boolean control tokens used by advanced query syntax.
    // The expression includes unary NOT plus grouped OR terms.
    const result = tokenize('NOT (FAILED_LOGON OR LOGGED_IN)');

    // Parentheses must be emitted as explicit tokens for proper boolean evaluation.
    expect(result).toEqual([
      { type: 'NOT' },
      { type: 'LPAREN' },
      { type: 'TERM', value: 'FAILED_LOGON' },
      { type: 'OR' },
      { type: 'TERM', value: 'LOGGED_IN' },
      { type: 'RPAREN' },
    ]);
  });

  it('keeps unknown status values unchanged', () => {
    // This test covers the passthrough branch for values not in the translation map.
    // Unknown status codes should remain untouched so analysts still see original evidence.
    expect(formatFilterValue('Status', '0xdeadbeef')).toBe('0xdeadbeef');
  });

  it('keeps access mask values unchanged', () => {
    // This test covers the passthrough behavior for fields the formatter no longer interprets.
    // AccessMask is intentionally not remapped here, so raw value should be preserved.
    const result = formatFilterValue('AccessMask', '0x3');

    expect(result).toBe('0x3');
  });

  it('returns null for invalid numeric value parsing', () => {
    // This test covers parse failure path for non-numeric input.
    // Non-numeric strings should fail cleanly instead of throwing or returning NaN.
    expect(parseNumericValue('not-a-number')).toBeNull();
  });
});
