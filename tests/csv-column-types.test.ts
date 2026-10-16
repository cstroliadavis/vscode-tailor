import { describe, expect, it } from 'bun:test';
import {
  buildColumnSchemaKey,
  formatDateCell,
  formatNumberCell,
  parseBooleanCell,
  parseJsonCell,
  parseJsonlCell,
  resolveColumnSchema,
  serializeJsonlItems,
  shouldAutoOpenInspector,
} from '../src/features/csv/csv-column-types.ts';
import type { CsvFileSchemaConfig } from '../src/types.ts';

describe('CSV Typed Column Formatting, Validation & JSON/JSONL Parsing', () => {
  const setup = () => {
    const rows = Object.freeze([
      ['id', 'active', 'amount', 'created', 'meta', 'events'],
      ['1', 'true', '42.5', '2026-10-16', '{"role":"admin"}', '{"ev":"login"}\n{"ev":"logout"}'],
    ]);
    const fileSchema = Object.freeze<CsvFileSchemaConfig>({
      columns: {
        active: { dataType: 'boolean' },
        amount: { dataType: 'number', decimals: 2, pinned: true, width: 120 },
      },
      headerRowCount: 1,
    });

    return { fileSchema, rows: rows.map((r) => [...r]) };
  };

  it('classifies boolean cell strings and preserves non-boolean text', () => {
    expect(parseBooleanCell('true')).toEqual({
      isBoolean: true,
      nextValue: 'false',
      truthy: true,
    });
    expect(parseBooleanCell('False')).toEqual({
      isBoolean: true,
      nextValue: 'True',
      truthy: false,
    });
    expect(parseBooleanCell('1')).toEqual({
      isBoolean: true,
      nextValue: '0',
      truthy: true,
    });
    expect(parseBooleanCell('pending')).toEqual({
      isBoolean: false,
      nextValue: 'pending',
      truthy: false,
    });
  });

  it('formats numeric strings to configured decimal places and preserves invalid numbers', () => {
    expect(formatNumberCell('42.5', 2)).toEqual({ formatted: '42.50', isValidNumber: true });
    expect(formatNumberCell('100.125', 0)).toEqual({ formatted: '100', isValidNumber: true });
    expect(formatNumberCell('42.500', null)).toEqual({ formatted: '42.5', isValidNumber: true });
    expect(formatNumberCell('N/A', 2)).toEqual({ formatted: 'N/A', isValidNumber: false });
  });

  it('formats date strings across YYYY-MM-DD, MM/DD/YYYY, MMM D, YYYY, and ISO presets', () => {
    expect(formatDateCell('2026-10-16', 'YYYY-MM-DD').formatted).toBe('2026-10-16');
    expect(formatDateCell('2026-10-16', 'MM/DD/YYYY').formatted).toBe('10/16/2026');
    expect(formatDateCell('2026-10-16', 'MMM D, YYYY').formatted).toBe('Oct 16, 2026');
    expect(formatDateCell('2026-10-16', 'ISO').formatted).toBe('2026-10-16T00:00:00Z');
    expect(formatDateCell('not-a-date', 'YYYY-MM-DD').isValidDate).toBe(false);
  });

  it('parses JSON and JSONL cells and serializes JSONL object items back to newline strings', () => {
    const validJson = parseJsonCell('{"role":"admin","level":3}');
    const invalidJson = parseJsonCell('{broken');
    const validJsonl = parseJsonlCell('{"id":1,"tag":"a"}\n{"id":2,"tag":"b"}');
    const serialized = serializeJsonlItems(validJsonl.items);

    expect(validJson.error).toBeNull();
    expect(validJson.isRecord).toBe(true);
    expect(invalidJson.error).not.toBeNull();
    expect(validJsonl.error).toBeNull();
    expect(validJsonl.items).toEqual([
      { id: 1, tag: 'a' },
      { id: 2, tag: 'b' },
    ]);
    expect(serialized).toBe('{"id":1,"tag":"a"}\n{"id":2,"tag":"b"}');
  });

  it('resolves saved column schemas and evaluates auto-open inspector rules', () => {
    const { fileSchema, rows } = setup();
    const amountSchema = resolveColumnSchema(fileSchema, rows, 2);
    const defaultSchema = resolveColumnSchema(fileSchema, rows, 0);

    expect(buildColumnSchemaKey(rows, 1, 2)).toBe('amount');
    expect(amountSchema).toEqual({
      dataType: 'number',
      dateFormat: 'YYYY-MM-DD',
      decimals: 2,
      pinned: true,
      width: 120,
    });
    expect(defaultSchema.dataType).toBe('text');
    expect(shouldAutoOpenInspector('{"a":1}', 'json')).toBe(true);
    expect(shouldAutoOpenInspector('short', 'text')).toBe(false);
    expect(shouldAutoOpenInspector('line 1\nline 2', 'text')).toBe(true);
  });
});
