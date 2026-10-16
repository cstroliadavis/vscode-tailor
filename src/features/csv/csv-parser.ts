import type { CsvCellToken, CsvDocumentModel, CsvLineEnding } from '../../types.ts';

/**
 * Advances scanner line and character counters for a single character and increments offset.
 */
function advanceCursor(state: ScannerState, char: string): void {
  state.offset += 1;

  if (char === '\n') {
    state.line += 1;
    state.char = 0;

    return;
  }

  if (char !== '\r') {
    state.char += 1;
  }
}

/**
 * Appends a completed cell token to the scanner state and advances to the next column.
 */
function commitCellToken(state: ScannerState): void {
  const rawText = state.source.slice(state.tokenStartOffset, state.offset);

  state.tokens.push({
    colIndex: state.colIndex,
    endChar: state.char,
    endLine: state.line,
    rawText,
    rowIndex: state.rowIndex,
    startChar: state.tokenStartChar,
    startLine: state.tokenStartLine,
    value: state.cellBuffer,
  });
  state.currentRow.push(state.cellBuffer);
  state.cellBuffer = '';
  state.colIndex += 1;
}

/**
 * Completes the current row in the scanner state and resets column counters.
 */
function commitRow(state: ScannerState): void {
  commitCellToken(state);
  state.rows.push(state.currentRow);
  state.currentRow = [];
  state.rowIndex += 1;
  state.colIndex = 0;
}

/**
 * Creates a fresh mutable scanner state for a CSV text input.
 */
function createScannerState(source: string): ScannerState {
  return {
    cellBuffer: '',
    char: 0,
    colIndex: 0,
    currentRow: [],
    inQuotes: false,
    line: 0,
    offset: 0,
    rowIndex: 0,
    rows: [],
    source,
    tokenStartChar: 0,
    tokenStartLine: 0,
    tokenStartOffset: 0,
    tokens: [],
  };
}

/**
 * Detects whether the raw CSV text uses CRLF or LF line endings.
 */
function detectLineEnding(text: string): CsvLineEnding {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Flushes any trailing un-committed row at the end of scanning.
 */
function finalizeScannerRows(state: ScannerState): void {
  if (!hasPendingFinalRow(state)) return;

  commitRow(state);
}

/**
 * Checks whether the scanner has buffered row or cell data after reaching EOF.
 */
function hasPendingFinalRow(state: ScannerState): boolean {
  if (state.currentRow.length > 0) return true;

  return state.cellBuffer.length > 0 || state.source.endsWith(',');
}

/**
 * Detects whether the raw CSV text ends with a newline sequence.
 */
function hasTrailingNewline(text: string): boolean {
  return text.endsWith('\n');
}

/**
 * Checks whether the current character and next character form an escaped quote pair (`""`).
 */
function isEscapedQuotePair(state: ScannerState, char: string): boolean {
  if (char !== '"') return false;

  return state.source[state.offset + 1] === '"';
}

/**
 * Checks whether a token spans the given zero-based line and character coordinates.
 */
function isPositionInsideToken(token: CsvCellToken, line: number, character: number): boolean {
  if (line !== token.startLine) return false;

  return character >= token.startChar && character <= token.endChar;
}

/**
 * Checks whether an unquoted character starts a quoted field.
 */
function isQuoteStart(state: ScannerState, char: string): boolean {
  if (char !== '"') return false;

  return state.cellBuffer.length === 0;
}

/**
 * Marks the start coordinates of the next cell token in the scanner state.
 */
function markNextTokenStart(state: ScannerState): void {
  state.tokenStartOffset = state.offset;
  state.tokenStartLine = state.line;
  state.tokenStartChar = state.char;
}

/**
 * Pads shorter rows with empty strings so all rows in the matrix share the same column count.
 */
function normalizeRowWidths(rows: string[][]): string[][] {
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);

  if (maxCols === 0) return [];

  return rows.map((row) => padRowToWidth(row, maxCols));
}

/**
 * Pads a single row with empty strings up to `targetWidth`.
 */
function padRowToWidth(row: string[], targetWidth: number): string[] {
  if (row.length >= targetWidth) return [...row];

  const padding = Array.from({ length: targetWidth - row.length }, () => '');

  return [...row, ...padding];
}

/**
 * Processes a comma delimiter outside of double quotes.
 */
function processDelimiterStep(state: ScannerState, char: string): void {
  commitCellToken(state);
  advanceCursor(state, char);
  markNextTokenStart(state);
}

/**
 * Processes a character while inside a double-quoted CSV field.
 */
function processQuotedChar(state: ScannerState, char: string): void {
  if (isEscapedQuotePair(state, char)) {
    state.cellBuffer += '"';
    advanceCursor(state, '"');
    advanceCursor(state, '"');

    return;
  }

  if (char === '"') {
    state.inQuotes = false;
  } else {
    state.cellBuffer += char;
  }

  advanceCursor(state, char);
}

/**
 * Processes a single character step in the scanner state machine.
 */
function processScannerStep(state: ScannerState): void {
  const char = state.source[state.offset]!;

  if (state.inQuotes) {
    processQuotedChar(state, char);

    return;
  }

  if ('\r\n'.includes(char)) {
    processUnquotedNewline(state, char);

    return;
  }

  processUnquotedStep(state, char);
}

/**
 * Processes a newline sequence outside of quotes and commits the current row.
 */
function processUnquotedNewline(state: ScannerState, char: string): void {
  commitRow(state);
  advanceCursor(state, char);

  if (char === '\r' && state.source[state.offset] === '\n') {
    advanceCursor(state, '\n');
  }

  markNextTokenStart(state);
}

/**
 * Processes a single character while outside of double quotes.
 */
function processUnquotedStep(state: ScannerState, char: string): void {
  if (isQuoteStart(state, char)) {
    state.inQuotes = true;
    advanceCursor(state, char);

    return;
  }

  if (char === ',') {
    processDelimiterStep(state, char);

    return;
  }

  state.cellBuffer += char;
  advanceCursor(state, char);
}

/**
 * Runs the character-by-character RFC 4180 state machine over the source text.
 */
function runCsvScanner(source: string): ScannerState {
  const state = createScannerState(source);

  if (source.length === 0) return state;

  while (state.offset < source.length) {
    processScannerStep(state);
  }

  finalizeScannerRows(state);

  return state;
}

/**
 * Formats a single cell value according to RFC 4180 quoting rules.
 */
function serializeCellValue(value: string): string {
  const needsQuotes = [',', '"', '\n', '\r'].some((ch) => value.includes(ch));

  if (!needsQuotes) return value;

  const escaped = value.replaceAll('"', '""');

  return `"${escaped}"`;
}

/**
 * Finds the CSV cell token located at the specified zero-based line and character offset.
 *
 * @param tokens - Scanned cell tokens for the document.
 * @param line - Zero-based line number.
 * @param character - Zero-based character offset on the line.
 * @returns The matching `CsvCellToken`, or `undefined` if no token matches.
 *
 * @example
 * ```ts
 * const tokens = scanCsvCellTokens('name,age\nAlice,30');
 * const token = findTokenAtPosition(tokens, 1, 6);
 * // token?.value === '30'
 * ```
 */
export function findTokenAtPosition(
  tokens: CsvCellToken[],
  line: number,
  character: number,
): CsvCellToken | undefined {
  return tokens.find((token) => isPositionInsideToken(token, line, character));
}

/**
 * Parses a raw RFC 4180 CSV string into a normalized `CsvDocumentModel`.
 *
 * @param text - Raw CSV file contents.
 * @param headerRowCount - Number of top contiguous header rows (defaults to `1`).
 * @returns Normalized `CsvDocumentModel` containing rectangular rows and line-ending metadata.
 *
 * @example
 * ```ts
 * const model = parseCsvDocument('id,name\n1,Alice\n', 1);
 * // model.rows => [['id', 'name'], ['1', 'Alice']]
 * ```
 */
export function parseCsvDocument(text: string, headerRowCount = 1): CsvDocumentModel {
  const state = runCsvScanner(text);
  const normalizedRows = normalizeRowWidths(state.rows);
  const clampedHeaders = Math.max(0, Math.min(headerRowCount, normalizedRows.length));

  return {
    headerRowCount: clampedHeaders,
    lineEnding: detectLineEnding(text),
    rows: normalizedRows,
    trailingNewline: hasTrailingNewline(text),
  };
}

/**
 * Scans a raw CSV string and returns positional `CsvCellToken` metadata for every cell.
 *
 * @param text - Raw CSV file contents.
 * @returns Array of `CsvCellToken` entries with line, character, row, and column indices.
 *
 * @example
 * ```ts
 * const tokens = scanCsvCellTokens('a,b\n1,2');
 * // tokens.length === 4
 * ```
 */
export function scanCsvCellTokens(text: string): CsvCellToken[] {
  return runCsvScanner(text).tokens;
}

/**
 * Serializes a `CsvDocumentModel` back into an RFC 4180 CSV string preserving line endings.
 *
 * @param model - Structured CSV document model to serialize.
 * @returns Formatted CSV string.
 *
 * @example
 * ```ts
 * const csv = serializeCsvDocument(model);
 * // 'id,name\n1,Alice\n'
 * ```
 */
export function serializeCsvDocument(model: CsvDocumentModel): string {
  if (model.rows.length === 0) return '';

  const lines = model.rows.map((row) => row.map(serializeCellValue).join(','));
  const joined = lines.join(model.lineEnding);

  return model.trailingNewline ? `${joined}${model.lineEnding}` : joined;
}

/**
 * Mutable state used by the internal RFC 4180 character scanner.
 */
interface ScannerState {
  cellBuffer: string;
  char: number;
  colIndex: number;
  currentRow: string[];
  inQuotes: boolean;
  line: number;
  offset: number;
  rowIndex: number;
  rows: string[][];
  source: string;
  tokenStartChar: number;
  tokenStartLine: number;
  tokenStartOffset: number;
  tokens: CsvCellToken[];
}
