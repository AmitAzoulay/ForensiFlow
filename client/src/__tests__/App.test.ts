import { describe, expect, it } from 'vitest';

import { parseNumericValue, tokenize } from '../App';
import { formatFilterValue } from '../utils/formatters';

describe('App query helpers', () => {
  it('tokenizes logical query operators and terms', () => {
    // This test confirms query text becomes structured tokens for the filter engine.
    const result = tokenize('FAILED_LOGON AND 4624.TargetUserName==admin');

    expect(result).toEqual([
      { type: 'TERM', value: 'FAILED_LOGON' },
      { type: 'AND' },
      { type: 'TERM', value: '4624.TargetUserName==admin' },
    ]);
  });

  it('parses hexadecimal strings into numbers', () => {
    // This test verifies support for Windows-style hex values (0x...).
    expect(parseNumericValue('0x10')).toBe(16);
  });

  it('adds human-readable meaning to status codes', () => {
    // This test checks that raw status values are translated for analyst readability.
    const result = formatFilterValue('Status', '0xc000006a');

    expect(result).toBe('Wrong password (0xc000006a)');
  });

  it('supports parentheses and NOT tokenization', () => {
    // This test covers boolean control tokens used by advanced query syntax.
    const result = tokenize('NOT (FAILED_LOGON OR LOGGED_IN)');

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
    expect(formatFilterValue('Status', '0xdeadbeef')).toBe('0xdeadbeef');
  });

  it('keeps access mask values unchanged', () => {
    // This test covers the passthrough behavior for fields the formatter no longer interprets.
    const result = formatFilterValue('AccessMask', '0x3');

    expect(result).toBe('0x3');
  });

  it('returns null for invalid numeric value parsing', () => {
    // This test covers parse failure path for non-numeric input.
    expect(parseNumericValue('not-a-number')).toBeNull();
  });
});
