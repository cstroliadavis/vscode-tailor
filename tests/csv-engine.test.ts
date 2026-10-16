import { describe, expect, it } from 'bun:test';
import { applyWebviewMutation } from '../src/features/csv/csv-messages.ts';
import {
  buildColumnHeaderLabel,
  editCsvCell,
  filterCsvRows,
  insertCsvColumn,
  insertCsvRow,
  removeCsvColumn,
  removeCsvRow,
  setCsvHeaderRowCount,
  sortCsvDataRows,
} from '../src/features/csv/csv-operations.ts';
import {
  findTokenAtPosition,
  parseCsvDocument,
  scanCsvCellTokens,
  serializeCsvDocument,
} from '../src/features/csv/csv-parser.ts';
import { buildCsvGridHtml } from '../src/features/csv/csv-webview-html.ts';
import {
  buildHoverMarkdown,
  groupTokensByColumnBucket,
} from '../src/features/csv/rainbow-helpers.ts';

describe('CSV Parser, Serializer & Operations', () => {
  /**
   * Optional configuration overrides for CSV test setup.
   */
  interface SetupOverrides {
    csvText?: string;
    headerRowCount?: number;
  }

  const setup = (overrides: SetupOverrides = {}) => {
    const csvText =
      overrides.csvText ??
      ['id,name,score', '10,Charlie,85', '2,Alice,95', '1,Bob,70', '3,Diana,'].join('\n') + '\n';
    const headerRowCount = overrides.headerRowCount ?? 1;
    const model = Object.freeze(parseCsvDocument(csvText, headerRowCount));

    return { csvText, model };
  };

  it('parses RFC 4180 CSV with quoted commas, escaped quotes, and multiline cells', () => {
    const raw = 'id,note\r\n1,"Hello, ""World"""\r\n2,"Line 1\nLine 2"\r\n';
    const { model } = setup({ csvText: raw });

    expect(model.lineEnding).toBe('\r\n');
    expect(model.trailingNewline).toBe(true);
    expect(model.rows).toEqual([
      ['id', 'note'],
      ['1', 'Hello, "World"'],
      ['2', 'Line 1\nLine 2'],
    ]);
    expect(serializeCsvDocument(model)).toBe(raw);
  });

  it('normalizes ragged rows to rectangular width and handles empty input', () => {
    const ragged = parseCsvDocument('a,b,c\n1\n2,3', 1);
    const empty = parseCsvDocument('', 1);

    expect(ragged.rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
      ['2', '3', ''],
    ]);
    expect(empty.rows).toEqual([]);
    expect(serializeCsvDocument(empty)).toBe('');
  });

  it('scans cell tokens and locates the token under a cursor position', () => {
    const tokens = scanCsvCellTokens('name,role\nAlice,Engineer');
    const found = findTokenAtPosition(tokens, 1, 8);
    const missing = findTokenAtPosition(tokens, 5, 0);

    expect(tokens.length).toBe(4);
    expect(found?.colIndex).toBe(1);
    expect(found?.rowIndex).toBe(1);
    expect(found?.value).toBe('Engineer');
    expect(missing).toBeUndefined();
  });

  it('groups cell tokens into rainbow color buckets and generates column hover markdown', () => {
    const csv = 'name,role\nAlice,Engineer';
    const tokens = scanCsvCellTokens(csv);
    const buckets = groupTokensByColumnBucket(tokens, 10);
    const hover = buildHoverMarkdown(csv, { character: 8, headerRowCount: 1, line: 1 });

    expect(buckets.get(0)?.map((t) => t.value)).toEqual(['name', 'Alice']);
    expect(buckets.get(1)?.map((t) => t.value)).toEqual(['role', 'Engineer']);
    expect(hover).toContain('**Column 2: role** (Row 2)');
    expect(hover).toContain('Value: `Engineer`');
  });

  it('builds composite column header labels across single or multiple header rows', () => {
    const rows = [
      ['Q1', 'Q1'],
      ['Revenue', 'Cost'],
      ['100', '40'],
    ];

    expect(buildColumnHeaderLabel(rows, 2, 0)).toBe('Q1 / Revenue');
    expect(buildColumnHeaderLabel(rows, 0, 0)).toBe('Column 1 (A)');
  });

  it('sorts data rows numerically and lexically while keeping header rows pinned', () => {
    const { model } = setup();

    const ascById = sortCsvDataRows(model, {
      colIndex: 0,
      direction: 'asc',
      headerRowCount: 1,
    });
    const descByScore = sortCsvDataRows(model, {
      colIndex: 2,
      direction: 'desc',
      headerRowCount: 1,
    });

    expect(ascById.rows.map((r) => r[0])).toEqual(['id', '1', '2', '3', '10']);
    expect(descByScore.rows.map((r) => r[1])).toEqual(['name', 'Alice', 'Charlie', 'Bob', 'Diana']);
  });

  it('preserves multi-row headers at the top when sorting data rows', () => {
    const multiHeaderCsv = ['Metric,Metric', 'Name,Value', 'Zeta,20', 'Alpha,5'].join('\n');
    const { model } = setup({ csvText: multiHeaderCsv, headerRowCount: 2 });

    const sorted = sortCsvDataRows(model, {
      colIndex: 0,
      direction: 'asc',
      headerRowCount: 2,
    });

    expect(sorted.rows).toEqual([
      ['Metric', 'Metric'],
      ['Name', 'Value'],
      ['Alpha', '5'],
      ['Zeta', '20'],
    ]);
  });

  it('filters visible data row indices using global and per-column queries without mutating', () => {
    const { model } = setup();

    const byGlobal = filterCsvRows(model, {
      columnFilters: {},
      globalQuery: 'alice',
      headerRowCount: 1,
    });
    const byCol = filterCsvRows(model, {
      columnFilters: { 2: '5' },
      globalQuery: '',
      headerRowCount: 1,
    });

    expect(byGlobal).toEqual([2]);
    expect(byCol).toEqual([1, 2]);
  });

  it('edits cells and inserts or removes rows and columns non-destructively', () => {
    const { model } = setup();

    const edited = editCsvCell(model, { colIndex: 1, rowIndex: 1, value: 'Chuck' });
    const withRow = insertCsvRow(edited, 1);
    const withoutRow = removeCsvRow(withRow, 1);
    const withCol = insertCsvColumn(withoutRow, 3, 'Status');
    const withoutCol = removeCsvColumn(withCol, 3);
    const updatedHeaders = setCsvHeaderRowCount(withoutCol, 2);

    expect(edited.rows[1]?.[1]).toBe('Chuck');
    expect(withRow.rows.length).toBe(model.rows.length + 1);
    expect(withoutRow.rows.length).toBe(model.rows.length);
    expect(withCol.rows[0]?.[3]).toBe('Status');
    expect(withoutCol.rows[0]?.length).toBe(3);
    expect(updatedHeaders.headerRowCount).toBe(2);
  });

  it('processes webview mutation messages and generates CSP-compliant webview HTML', () => {
    const { model } = setup();
    const afterEdit = applyWebviewMutation(model, {
      colIndex: 1,
      rowIndex: 2,
      type: 'editCell',
      value: 'Alicia',
    });
    const afterSort = applyWebviewMutation(afterEdit, {
      colIndex: 0,
      direction: 'asc',
      headerRowCount: 1,
      type: 'sortColumn',
    });
    const afterHeader = applyWebviewMutation(afterSort, {
      headerRowCount: 2,
      type: 'setHeaderRowCount',
    });
    const html = buildCsvGridHtml({
      cspSource: 'vscode-webview:',
      nonce: 'test-nonce',
      scriptUri: 'vscode-webview://script.js',
    });

    expect(afterSort.rows[2]?.[1]).toBe('Alicia');
    expect(afterHeader.headerRowCount).toBe(2);
    expect(html).toContain('nonce="test-nonce"');
    expect(html).toContain('vscode-webview://script.js');
  });
});

