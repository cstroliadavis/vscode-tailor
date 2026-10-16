import type {
  CsvColumnDataType,
  CsvColumnSchema,
  CsvDateFormat,
  CsvFileSchemaConfig,
} from '../../types.ts';
import { buildColumnHeaderLabel } from './csv-operations.ts';

const BOOLEAN_PAIRS: Record<string, { nextValue: string; truthy: boolean } | undefined> = {
  '0': { nextValue: '1', truthy: false },
  '1': { nextValue: '0', truthy: true },
  false: { nextValue: 'true', truthy: false },
  False: { nextValue: 'True', truthy: false },
  FALSE: { nextValue: 'TRUE', truthy: false },
  no: { nextValue: 'yes', truthy: false },
  No: { nextValue: 'Yes', truthy: false },
  NO: { nextValue: 'YES', truthy: false },
  true: { nextValue: 'false', truthy: true },
  True: { nextValue: 'False', truthy: true },
  TRUE: { nextValue: 'FALSE', truthy: true },
  yes: { nextValue: 'no', truthy: true },
  Yes: { nextValue: 'No', truthy: true },
  YES: { nextValue: 'NO', truthy: true },
};

const DEFAULT_COLUMN_SCHEMA: Required<CsvColumnSchema> = {
  dataType: 'text',
  dateFormat: 'YYYY-MM-DD',
  decimals: null,
  pinned: false,
  width: 160,
};

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const STRUCTURED_TYPES = new Set<CsvColumnDataType>(['json', 'jsonl']);

/**
 * Coerces a parsed JSON value into a key-value record for mini-form rendering.
 */
function coerceToRecord(item: unknown): Record<string, unknown> {
  if (isPlainRecord(item)) return item;

  return { value: item };
}

/**
 * Extracts year, month, and day numbers from a raw date string, or `null` if invalid.
 */
function extractDateParts(raw: string): { day: number; month: number; year: number } | null {
  const trimmed = raw.trim();

  if (trimmed.length === 0) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);

  if (isoMatch) {
    return {
      day: Number(isoMatch[3]),
      month: Number(isoMatch[2]),
      year: Number(isoMatch[1]),
    };
  }

  return parseFallbackDateParts(trimmed);
}

/**
 * Formats extracted `{ year, month, day }` parts according to `format`.
 */
function formatDateParts(
  parts: { day: number; month: number; year: number },
  format: CsvDateFormat,
): string {
  const yyyy = String(parts.year).padStart(4, '0');
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  const monthName = String(MONTH_NAMES[parts.month - 1]);
  const formattedByPreset: Record<CsvDateFormat, string> = {
    ISO: `${yyyy}-${mm}-${dd}T00:00:00Z`,
    'MM/DD/YYYY': `${mm}/${dd}/${yyyy}`,
    'MMM D, YYYY': `${monthName} ${parts.day}, ${yyyy}`,
    'YYYY-MM-DD': `${yyyy}-${mm}-${dd}`,
  };

  return formattedByPreset[format];
}

/**
 * Formats a validated finite number with optional fixed decimal places.
 */
function formatFiniteNumber(num: number, decimals?: number | null): string {
  if (typeof decimals === 'number') return num.toFixed(Math.max(0, decimals));

  return String(num);
}

/**
 * Formats a JSONL item list summary preview string.
 */
function formatJsonlPreview(items: Record<string, unknown>[], firstLine: string): string {
  const suffix = items.length === 1 ? '' : 's';

  return `${items.length} item${suffix} · ${truncatePreview(firstLine, 32)}`;
}

/**
 * Extracts an error message string from a caught exception.
 */
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;

  return fallback;
}

/**
 * Checks whether an unknown value is a non-null, non-array plain object record.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;

  return !Array.isArray(value);
}

/**
 * Looks up a saved `CsvColumnSchema` by header key or fallback index key.
 */
function lookupSavedColumnSchema(
  columns: Record<string, CsvColumnSchema | undefined>,
  headerKey: string,
  colIndex: number,
): CsvColumnSchema | undefined {
  return columns[headerKey] ?? columns[String(colIndex)];
}

/**
 * Parses non-ISO date strings via UTC timestamp extraction.
 */
function parseFallbackDateParts(
  trimmed: string,
): { day: number; month: number; year: number } | null {
  const timestamp = Date.parse(trimmed);

  if (Number.isNaN(timestamp)) return null;

  const iso = new Date(timestamp).toISOString().slice(0, 10);
  const [year, month, day] = iso.split('-').map(Number);

  return { day: day!, month: month!, year: year! };
}

/**
 * Parses a newline-delimited list of JSON lines into an array of object records.
 */
function parseJsonLinesList(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => coerceToRecord(JSON.parse(line)));
}

/**
 * Truncates a string to `maxLen` characters with an ellipsis for compact cell previews.
 */
function truncatePreview(text: string, maxLen = 48): string {
  const singleLine = text.replaceAll(/\s+/g, ' ').trim();

  if (singleLine.length <= maxLen) return singleLine;

  return `${singleLine.slice(0, maxLen - 1)}…`;
}

/**
 * Builds the canonical lookup key used in `CsvFileSchemaConfig.columns` for a column.
 *
 * @param rows - Two-dimensional CSV cell matrix.
 * @param headerRowCount - Number of top contiguous header rows.
 * @param colIndex - Zero-based column index.
 * @returns Header-based lookup key (or fallback column key).
 *
 * @example
 * ```ts
 * const key = buildColumnSchemaKey([['id', 'payload']], 1, 1);
 * // 'payload'
 * ```
 */
export function buildColumnSchemaKey(
  rows: string[][],
  headerRowCount: number,
  colIndex: number,
): string {
  return buildColumnHeaderLabel(rows, headerRowCount, colIndex);
}

/**
 * Formats a raw cell string as a date according to the specified `CsvDateFormat`.
 *
 * @param raw - Raw CSV cell value.
 * @param format - Target date display format (defaults to `'YYYY-MM-DD'`).
 * @returns Formatted date string, canonical ISO date (`YYYY-MM-DD`), and validity flag.
 *
 * @example
 * ```ts
 * const res = formatDateCell('2026-10-16', 'MMM D, YYYY');
 * // res.formatted === 'Oct 16, 2026'
 * ```
 */
export function formatDateCell(
  raw: string,
  format: CsvDateFormat = 'YYYY-MM-DD',
): { formatted: string; isoDate: string; isValidDate: boolean } {
  const parts = extractDateParts(raw);

  if (!parts) return { formatted: raw, isoDate: '', isValidDate: false };

  return {
    formatted: formatDateParts(parts, format),
    isoDate: formatDateParts(parts, 'YYYY-MM-DD'),
    isValidDate: true,
  };
}

/**
 * Formats a raw numeric cell string to the specified number of decimal places.
 *
 * @param raw - Raw CSV cell value.
 * @param decimals - Fixed decimal places (`0..6`), or `null`/`undefined` for automatic decimals.
 * @returns Formatted numeric string and validity flag.
 *
 * @example
 * ```ts
 * const res = formatNumberCell('42.5', 2);
 * // res.formatted === '42.50'
 * ```
 */
export function formatNumberCell(
  raw: string,
  decimals?: number | null,
): { formatted: string; isValidNumber: boolean } {
  const trimmed = raw.trim();

  if (trimmed.length === 0) return { formatted: '', isValidNumber: false };

  const num = Number(trimmed);

  if (Number.isNaN(num)) return { formatted: raw, isValidNumber: false };

  return { formatted: formatFiniteNumber(num, decimals), isValidNumber: true };
}

/**
 * Evaluates whether a raw cell string represents a boolean (`true`/`false`, `1`/`0`, `yes`/`no`).
 *
 * @param raw - Raw CSV cell value.
 * @returns Boolean classification, truthiness, and toggled replacement string.
 *
 * @example
 * ```ts
 * const res = parseBooleanCell('true');
 * // { isBoolean: true, truthy: true, nextValue: 'false' }
 * ```
 */
export function parseBooleanCell(raw: string): {
  isBoolean: boolean;
  nextValue: string;
  truthy: boolean;
} {
  const trimmed = raw.trim();
  const match = BOOLEAN_PAIRS[trimmed] ?? BOOLEAN_PAIRS[trimmed.toLowerCase()];

  if (!match) return { isBoolean: false, nextValue: raw, truthy: false };

  return {
    isBoolean: true,
    nextValue: match.nextValue,
    truthy: match.truthy,
  };
}

/**
 * Parses a raw cell string as JSON and produces formatted code, preview, and record metadata.
 *
 * @param raw - Raw CSV cell value.
 * @returns Parsed JSON payload, pretty-printed string, preview text, and validation error if any.
 *
 * @example
 * ```ts
 * const res = parseJsonCell('{"role":"admin"}');
 * // res.isRecord === true
 * ```
 */
export function parseJsonCell(raw: string): {
  data: unknown;
  error: string | null;
  formatted: string;
  isRecord: boolean;
  preview: string;
} {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { data: {}, error: null, formatted: '{\n}', isRecord: true, preview: '{}' };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    return {
      data: parsed,
      error: null,
      formatted: JSON.stringify(parsed, null, 2),
      isRecord: isPlainRecord(parsed),
      preview: truncatePreview(trimmed),
    };
  } catch (err) {
    const msg = getErrorMessage(err, 'Invalid JSON');

    return {
      data: null,
      error: msg,
      formatted: raw,
      isRecord: false,
      preview: truncatePreview(raw),
    };
  }
}

/**
 * Parses a raw cell string as JSONL (newline-delimited JSON objects) for mini-form card editing.
 *
 * @param raw - Raw CSV cell value containing newline-delimited JSON objects.
 * @returns Array of parsed object records, formatted JSONL string, and validation error if any.
 *
 * @example
 * ```ts
 * const res = parseJsonlCell('{"id":1}\n{"id":2}');
 * // res.items.length === 2
 * ```
 */
export function parseJsonlCell(raw: string): {
  error: string | null;
  formatted: string;
  items: Record<string, unknown>[];
  preview: string;
} {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { error: null, formatted: '', items: [], preview: '0 items' };

  try {
    const items = parseJsonLinesList(lines);
    const formatted = items.map((item) => JSON.stringify(item, null, 2)).join('\n---\n');

    return {
      error: null,
      formatted,
      items,
      preview: formatJsonlPreview(items, lines[0]!),
    };
  } catch (err) {
    const msg = getErrorMessage(err, 'Invalid JSONL');

    return { error: msg, formatted: raw, items: [], preview: truncatePreview(raw) };
  }
}

/**
 * Resolves the active `CsvColumnSchema` for `colIndex` from a `CsvFileSchemaConfig`.
 *
 * @param fileSchema - Per-file schema configuration.
 * @param rows - Two-dimensional CSV cell matrix.
 * @param colIndex - Zero-based column index.
 * @returns Resolved `CsvColumnSchema` with defaults applied.
 *
 * @example
 * ```ts
 * const schema = resolveColumnSchema(fileSchema, rows, 0);
 * ```
 */
export function resolveColumnSchema(
  fileSchema: CsvFileSchemaConfig,
  rows: string[][],
  colIndex: number,
): CsvColumnSchema {
  const headerCount = fileSchema.headerRowCount ?? 1;
  const key = buildColumnSchemaKey(rows, headerCount, colIndex);
  const columns: Record<string, CsvColumnSchema | undefined> = fileSchema.columns;
  const saved = lookupSavedColumnSchema(columns, key, colIndex);

  return {
    ...DEFAULT_COLUMN_SCHEMA,
    ...saved,
  };
}

/**
 * Serializes an array of object records into a newline-delimited JSONL cell string.
 *
 * @param items - Array of JSON object records.
 * @returns Newline-delimited JSONL string.
 *
 * @example
 * ```ts
 * const raw = serializeJsonlItems([{ id: 1 }, { id: 2 }]);
 * // '{"id":1}\n{"id":2}'
 * ```
 */
export function serializeJsonlItems(items: Record<string, unknown>[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}

/**
 * Determines whether selecting a cell should automatically open the right-side Inspector Drawer.
 *
 * @param raw - Raw CSV cell value.
 * @param dataType - Configured semantic column data type.
 * @returns `true` when the cell is `json`, `jsonl`, multiline, or exceeds 60 characters.
 *
 * @example
 * ```ts
 * shouldAutoOpenInspector('{"a":1}', 'json'); // true
 * ```
 */
export function shouldAutoOpenInspector(raw: string, dataType: CsvColumnDataType): boolean {
  if (STRUCTURED_TYPES.has(dataType)) return true;

  return raw.length > 60 || raw.includes('\n');
}
