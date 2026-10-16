import type {
  CsvCellEditSpec,
  CsvDocumentModel,
  CsvFilterSpec,
  CsvSortDirection,
  CsvSortSpec,
} from '../../types.ts';

/**
 * Collects non-empty trimmed header strings for a column across the top `limit` rows.
 */
function collectHeaderParts(rows: string[][], limit: number, colIndex: number): string[] {
  const parts: string[] = [];

  for (let i = 0; i < limit; i += 1) {
    const cell = extractHeaderCell(rows, i, colIndex);

    if (cell.length === 0) continue;

    parts.push(cell);
  }

  return parts;
}

/**
 * Compares two cell values with empty values always pushed to the end regardless of direction.
 */
function compareCellValues(leftRaw: string, rightRaw: string, direction: CsvSortDirection): number {
  const left = leftRaw.trim();
  const right = rightRaw.trim();

  if (hasEmptyOperand(left, right)) return compareEmptyValues(left, right);

  const baseOrder = compareNonEmptyValues(left, right);

  return direction === 'asc' ? baseOrder : -baseOrder;
}

/**
 * Orders empty cell strings after non-empty cell strings.
 */
function compareEmptyValues(left: string, right: string): number {
  if (left.length === right.length) return 0;

  return left.length === 0 ? 1 : -1;
}

/**
 * Compares two non-empty strings numerically when both represent finite numbers, or lexically.
 */
function compareNonEmptyValues(left: string, right: string): number {
  const numericDiff = tryNumericComparison(left, right);

  if (numericDiff !== null) return numericDiff;

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Safely extracts and trims a cell string from a row and column coordinate.
 */
function extractHeaderCell(rows: string[][], rowIndex: number, colIndex: number): string {
  const row = rows.at(rowIndex);

  if (!row) return '';

  return (row.at(colIndex) ?? '').trim();
}

/**
 * Converts a zero-based column index into spreadsheet column letters (`0 -> 'A'`, `25 -> 'Z'`).
 */
function formatSpreadsheetColumnLetter(colIndex: number): string {
  let current = colIndex;
  let label = '';

  while (current >= 0) {
    label = String.fromCharCode((current % 26) + 65) + label;
    current = Math.floor(current / 26) - 1;
  }

  return label;
}

/**
 * Returns the column count of the first row in a CSV document model, or `0` if empty.
 */
function getMatrixWidth(model: CsvDocumentModel): number {
  const firstRow = model.rows.at(0);

  return firstRow ? firstRow.length : 0;
}

/**
 * Checks whether either operand string is empty.
 */
function hasEmptyOperand(left: string, right: string): boolean {
  if (left.length === 0) return true;

  return right.length === 0;
}

/**
 * Inserts a new cell into a single row at `clampedCol`, populating `headerLabel` on row 0.
 */
function insertCellIntoRow(
  row: string[],
  rowIndex: number,
  spec: { clampedCol: number; hasHeaders: boolean; headerLabel: string },
): string[] {
  const isFirstHeader = rowIndex === 0 && spec.hasHeaders;
  const cellValue = isFirstHeader ? spec.headerLabel : '';

  return row.toSpliced(spec.clampedCol, 0, cellValue);
}

/**
 * Checks whether a column index is removable from a matrix of width `width`.
 */
function isRemovableColumn(width: number, colIndex: number): boolean {
  if (width <= 1) return false;

  return colIndex >= 0 && colIndex < width;
}

/**
 * Checks whether a column index lies within the bounds of `row`.
 */
function isValidColumnIndex(row: string[], colIndex: number): boolean {
  if (colIndex < 0) return false;

  return colIndex < row.length;
}

/**
 * Checks whether a row satisfies all active per-column substring filters.
 */
function matchesAllColumnFilters(row: string[], columnFilters: Record<number, string>): boolean {
  return Object.entries(columnFilters).every(([colKey, rawFilter]) =>
    matchesSingleColumnFilter(row, Number(colKey), rawFilter),
  );
}

/**
 * Checks whether any cell in a row matches a case-insensitive global search query.
 */
function matchesGlobalQuery(row: string[], query: string): boolean {
  const normalized = query.trim().toLowerCase();

  if (normalized.length === 0) return true;

  return row.some((cell) => cell.toLowerCase().includes(normalized));
}

/**
 * Checks whether a single data row satisfies both global and per-column filter criteria.
 */
function matchesRowFilter(row: string[], spec: CsvFilterSpec): boolean {
  if (!matchesGlobalQuery(row, spec.globalQuery)) return false;

  return matchesAllColumnFilters(row, spec.columnFilters);
}

/**
 * Checks whether a single cell in `row` matches a column's filter string.
 */
function matchesSingleColumnFilter(row: string[], colIndex: number, rawFilter: string): boolean {
  const filterText = rawFilter.trim().toLowerCase();

  if (filterText.length === 0) return true;

  const cellText = (row.at(colIndex) ?? '').toLowerCase();

  return cellText.includes(filterText);
}

/**
 * Attempts a numeric comparison between two strings, returning `null` if either is non-numeric.
 */
function tryNumericComparison(left: string, right: string): number | null {
  const leftNum = Number(left);
  const rightNum = Number(right);

  if (Number.isNaN(leftNum)) return null;

  if (Number.isNaN(rightNum)) return null;

  return leftNum - rightNum;
}

/**
 * Builds a composite display header label for a column from the top `headerRowCount` rows.
 *
 * @param rows - Two-dimensional CSV cell matrix.
 * @param headerRowCount - Number of top contiguous rows treated as headers.
 * @param colIndex - Zero-based column index.
 * @returns Composite header title (e.g. `'Region / Q1'`) or fallback spreadsheet column name.
 *
 * @example
 * ```ts
 * const label = buildColumnHeaderLabel([['Name', 'Age'], ['Alice', '30']], 1, 0);
 * // 'Name'
 * ```
 */
export function buildColumnHeaderLabel(
  rows: string[][],
  headerRowCount: number,
  colIndex: number,
): string {
  const limit = Math.min(headerRowCount, rows.length);
  const parts = collectHeaderParts(rows, limit, colIndex);
  const fallback = `Column ${colIndex + 1} (${formatSpreadsheetColumnLetter(colIndex)})`;

  return parts.length > 0 ? parts.join(' / ') : fallback;
}

/**
 * Updates a single cell value in a `CsvDocumentModel` without mutating the input model.
 *
 * @param model - Source CSV document model.
 * @param spec - Target row index, column index, and replacement string value.
 * @returns New `CsvDocumentModel` with the updated cell value.
 *
 * @example
 * ```ts
 * const updated = editCsvCell(model, { rowIndex: 1, colIndex: 0, value: 'Bob' });
 * // updated.rows[1][0] === 'Bob'
 * ```
 */
export function editCsvCell(model: CsvDocumentModel, spec: CsvCellEditSpec): CsvDocumentModel {
  const targetRow = model.rows.at(spec.rowIndex);

  if (!targetRow) return model;

  if (!isValidColumnIndex(targetRow, spec.colIndex)) return model;

  const updatedRow = targetRow.with(spec.colIndex, spec.value);

  return {
    ...model,
    rows: model.rows.with(spec.rowIndex, updatedRow),
  };
}

/**
 * Returns the original row indices of data rows (below the header block) matching `spec`.
 *
 * @param model - Source CSV document model.
 * @param spec - Filter specification containing header count, global query, and column filters.
 * @returns Array of zero-based row indices into `model.rows` for visible data rows.
 *
 * @example
 * ```ts
 * const visibleIndices = filterCsvRows(model, {
 *   headerRowCount: 1,
 *   globalQuery: 'alice',
 *   columnFilters: {},
 * });
 * ```
 */
export function filterCsvRows(model: CsvDocumentModel, spec: CsvFilterSpec): number[] {
  const matchingIndices: number[] = [];
  const startRow = Math.max(0, Math.min(spec.headerRowCount, model.rows.length));

  for (let rowIndex = startRow; rowIndex < model.rows.length; rowIndex += 1) {
    const row = model.rows[rowIndex]!;

    if (!matchesRowFilter(row, spec)) continue;

    matchingIndices.push(rowIndex);
  }

  return matchingIndices;
}

/**
 * Inserts a new empty column at `atColIndex` across all rows in the CSV document model.
 *
 * @param model - Source CSV document model.
 * @param atColIndex - Zero-based column index at which to insert the new column.
 * @param headerLabel - Optional label to populate in the first header row.
 * @returns New `CsvDocumentModel` with the inserted column.
 *
 * @example
 * ```ts
 * const next = insertCsvColumn(model, 2, 'Notes');
 * ```
 */
export function insertCsvColumn(
  model: CsvDocumentModel,
  atColIndex: number,
  headerLabel = '',
): CsvDocumentModel {
  if (model.rows.length === 0) return { ...model, rows: [[headerLabel]] };

  const width = getMatrixWidth(model);
  const clampedCol = Math.max(0, Math.min(atColIndex, width));
  const hasHeaders = model.headerRowCount > 0;
  const nextRows = model.rows.map((row, rowIndex) =>
    insertCellIntoRow(row, rowIndex, { clampedCol, hasHeaders, headerLabel }),
  );

  return { ...model, rows: nextRows };
}

/**
 * Inserts a new empty row at `atRowIndex` in the CSV document model.
 *
 * @param model - Source CSV document model.
 * @param atRowIndex - Zero-based row index at which to insert the new row.
 * @returns New `CsvDocumentModel` with the inserted row.
 *
 * @example
 * ```ts
 * const next = insertCsvRow(model, model.rows.length);
 * ```
 */
export function insertCsvRow(model: CsvDocumentModel, atRowIndex: number): CsvDocumentModel {
  const width = Math.max(1, getMatrixWidth(model));
  const emptyRow = Array.from({ length: width }, () => '');
  const clampedIndex = Math.max(0, Math.min(atRowIndex, model.rows.length));

  return {
    ...model,
    rows: model.rows.toSpliced(clampedIndex, 0, emptyRow),
  };
}

/**
 * Removes the column at `colIndex` across all rows in the CSV document model.
 *
 * @param model - Source CSV document model.
 * @param colIndex - Zero-based column index to remove.
 * @returns New `CsvDocumentModel` without the specified column.
 *
 * @example
 * ```ts
 * const next = removeCsvColumn(model, 1);
 * ```
 */
export function removeCsvColumn(model: CsvDocumentModel, colIndex: number): CsvDocumentModel {
  const width = getMatrixWidth(model);

  if (!isRemovableColumn(width, colIndex)) return model;

  return {
    ...model,
    rows: model.rows.map((row) => row.toSpliced(colIndex, 1)),
  };
}

/**
 * Removes the row at `rowIndex` from the CSV document model.
 *
 * @param model - Source CSV document model.
 * @param rowIndex - Zero-based row index to remove.
 * @returns New `CsvDocumentModel` without the specified row.
 *
 * @example
 * ```ts
 * const next = removeCsvRow(model, 2);
 * ```
 */
export function removeCsvRow(model: CsvDocumentModel, rowIndex: number): CsvDocumentModel {
  if (rowIndex < 0 || rowIndex >= model.rows.length) return model;

  const nextRows = model.rows.toSpliced(rowIndex, 1);
  const nextHeaderCount = Math.min(model.headerRowCount, nextRows.length);

  return {
    ...model,
    headerRowCount: nextHeaderCount,
    rows: nextRows,
  };
}

/**
 * Updates the number of top contiguous rows treated as sticky headers.
 *
 * @param model - Source CSV document model.
 * @param headerRowCount - Desired header row count (`0..model.rows.length`).
 * @returns New `CsvDocumentModel` with clamped `headerRowCount`.
 *
 * @example
 * ```ts
 * const next = setCsvHeaderRowCount(model, 2);
 * // next.headerRowCount === 2
 * ```
 */
export function setCsvHeaderRowCount(
  model: CsvDocumentModel,
  headerRowCount: number,
): CsvDocumentModel {
  const clamped = Math.max(0, Math.min(headerRowCount, model.rows.length));

  return {
    ...model,
    headerRowCount: clamped,
  };
}

/**
 * Sorts the data rows below `spec.headerRowCount` by `spec.colIndex` while keeping headers pinned.
 *
 * @param model - Source CSV document model.
 * @param spec - Sort column index, direction (`'asc'` or `'desc'`), and pinned header row count.
 * @returns New `CsvDocumentModel` with sorted data rows ready to persist to the `.csv` document.
 *
 * @example
 * ```ts
 * const sorted = sortCsvDataRows(model, { colIndex: 1, direction: 'asc', headerRowCount: 1 });
 * ```
 */
export function sortCsvDataRows(model: CsvDocumentModel, spec: CsvSortSpec): CsvDocumentModel {
  const headerCount = Math.max(0, Math.min(spec.headerRowCount, model.rows.length));
  const headerRows = model.rows.slice(0, headerCount);
  const dataRows = model.rows.slice(headerCount);

  const sortedDataRows = dataRows.toSorted((leftRow, rightRow) =>
    compareCellValues(
      leftRow.at(spec.colIndex) ?? '',
      rightRow.at(spec.colIndex) ?? '',
      spec.direction,
    ),
  );

  return {
    ...model,
    headerRowCount: headerCount,
    rows: [...headerRows, ...sortedDataRows],
  };
}
