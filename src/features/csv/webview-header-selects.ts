import type { CsvColumnDataType, CsvColumnSchema, CsvDateFormat } from '../../types.ts';
import type { GridViewActions } from './webview-toolbar.ts';

const COLUMN_DATA_TYPES: readonly CsvColumnDataType[] = [
  'text',
  'boolean',
  'number',
  'date',
  'json',
  'jsonl',
];

const DATE_FORMATS: readonly CsvDateFormat[] = ['YYYY-MM-DD', 'MM/DD/YYYY', 'MMM D, YYYY', 'ISO'];

const DECIMAL_OPTIONS = [
  { label: 'Auto dec', value: '' },
  { label: '0 dec', value: '0' },
  { label: '1 dec', value: '1' },
  { label: '2 dec', value: '2' },
  { label: '3 dec', value: '3' },
  { label: '4 dec', value: '4' },
] as const;

/**
 * Appends `<option>` elements to a `<select>` element from a list of `{ label, value }` pairs.
 */
function appendSelectOptions(
  select: HTMLSelectElement,
  options: readonly { label: string; value: string }[],
  activeValue: string,
): void {
  for (const item of options) {
    const opt = document.createElement('option');

    Object.assign(opt, {
      selected: item.value === activeValue,
      textContent: item.label,
      value: item.value,
    });
    select.appendChild(opt);
  }
}

/**
 * Creates the `<select>` element for choosing date formats when `dataType === 'date'`.
 */
function createDateFormatSelect(
  actions: GridViewActions,
  colIndex: number,
  activeFormat: CsvDateFormat | undefined,
): HTMLSelectElement {
  const select = document.createElement('select');
  const items = DATE_FORMATS.map((fmt) => ({ label: fmt, value: fmt }));

  Object.assign(select, { className: 'select-field', title: 'Date display format' });
  appendSelectOptions(select, items, activeFormat ?? 'YYYY-MM-DD');
  select.addEventListener('change', () => {
    actions.onUpdateColumnSchema(colIndex, { dateFormat: select.value as CsvDateFormat });
  });

  return select;
}

/**
 * Creates the `<select>` element for choosing decimal precision when `dataType === 'number'`.
 */
function createDecimalSelect(
  actions: GridViewActions,
  colIndex: number,
  decimals: number | null | undefined,
): HTMLSelectElement {
  const select = document.createElement('select');
  const currentVal = typeof decimals === 'number' ? String(decimals) : '';

  Object.assign(select, { className: 'select-field', title: 'Decimal places' });
  appendSelectOptions(select, DECIMAL_OPTIONS, currentVal);
  select.addEventListener('change', () => {
    const nextDecimals = select.value === '' ? null : Number(select.value);

    actions.onUpdateColumnSchema(colIndex, { decimals: nextDecimals });
  });

  return select;
}

/**
 * Creates the `<select>` element for choosing a column's semantic `CsvColumnDataType`.
 *
 * @param actions - User interaction callbacks.
 * @param colIndex - Zero-based column index.
 * @param activeType - Active column data type.
 * @returns Configured `HTMLSelectElement`.
 *
 * @example
 * ```ts
 * const select = createDataTypeSelect(actions, 0, 'json');
 * ```
 */
export function createDataTypeSelect(
  actions: GridViewActions,
  colIndex: number,
  activeType: CsvColumnDataType,
): HTMLSelectElement {
  const select = document.createElement('select');
  const items = COLUMN_DATA_TYPES.map((dt) => ({ label: dt.toUpperCase(), value: dt }));

  Object.assign(select, {
    className: 'select-field',
    title: 'Column data type (saved in .vscode/settings.json)',
  });
  appendSelectOptions(select, items, activeType);
  select.addEventListener('change', () => {
    actions.onUpdateColumnSchema(colIndex, { dataType: select.value as CsvColumnDataType });
  });

  return select;
}

/**
 * Creates a contextual format `<select>` for `number` or `date` columns, or `null` otherwise.
 *
 * @param actions - User interaction callbacks.
 * @param colIndex - Zero-based column index.
 * @param schema - Resolved column schema.
 * @returns Configured `HTMLSelectElement` or `null`.
 *
 * @example
 * ```ts
 * const fmtSelect = createFormatSelect(actions, 1, schema);
 * ```
 */
export function createFormatSelect(
  actions: GridViewActions,
  colIndex: number,
  schema: CsvColumnSchema,
): HTMLSelectElement | null {
  if (schema.dataType === 'number') return createDecimalSelect(actions, colIndex, schema.decimals);

  if (schema.dataType === 'date') {
    return createDateFormatSelect(actions, colIndex, schema.dateFormat);
  }

  return null;
}
