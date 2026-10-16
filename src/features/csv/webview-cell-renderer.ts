import type { CsvColumnSchema } from '../../types.ts';
import {
  formatDateCell,
  formatNumberCell,
  parseBooleanCell,
  parseJsonCell,
  parseJsonlCell,
} from './csv-column-types.ts';
import { RAINBOW_COLORS } from './rainbow-helpers.ts';
import type { GridViewActions, GridViewState } from './webview-toolbar.ts';

/**
 * Creates a badge + preview cell display for `date`, `json`, or `jsonl` columns.
 */
function createBadgePreviewDisplay(
  badgeText: string,
  previewText: string,
  color: string,
): HTMLDivElement {
  const div = document.createElement('div');
  const badge = document.createElement('span');
  const text = document.createElement('span');

  div.className = 'ag-cell-display';
  div.style.color = color;
  Object.assign(badge, { className: 'badge', textContent: badgeText });
  text.textContent = previewText;
  div.append(badge, text);

  return div;
}

/**
 * Creates a boolean cell display (interactive checkbox when boolean, or raw text fallback).
 */
function createBooleanCellDisplay(
  actions: GridViewActions,
  cellSpec: { colIndex: number; color: string; rowIndex: number; value: string },
): HTMLDivElement {
  const parsed = parseBooleanCell(cellSpec.value);

  if (!parsed.isBoolean) return createPlainCellDisplay(cellSpec.value, cellSpec.color, false);

  const div = document.createElement('div');
  const checkbox = document.createElement('input');

  div.className = 'ag-cell-display ag-cell-boolean';
  Object.assign(checkbox, { checked: parsed.truthy, type: 'checkbox' });
  checkbox.addEventListener('change', (event) => {
    event.stopPropagation();
    actions.onEditCell(cellSpec.rowIndex, cellSpec.colIndex, parsed.nextValue);
  });
  div.appendChild(checkbox);

  return div;
}

/**
 * Creates an inline `<input class="cell-input">` for active double-click editing.
 */
function createInlineEditInput(
  actions: GridViewActions,
  cellSpec: { colIndex: number; rowIndex: number; value: string },
): HTMLInputElement {
  const input = document.createElement('input');

  Object.assign(input, { className: 'cell-input', type: 'text', value: cellSpec.value });
  input.addEventListener('blur', () => {
    actions.onEditCell(cellSpec.rowIndex, cellSpec.colIndex, input.value);
    actions.onStartEditingCell(null);
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      actions.onEditCell(cellSpec.rowIndex, cellSpec.colIndex, input.value);
      actions.onStartEditingCell(null);
    } else if (event.key === 'Escape') {
      actions.onStartEditingCell(null);
    }
  });
  queueMicrotask(() => input.focus());

  return input;
}

/**
 * Creates a plain or right-aligned numeric cell display `<div>`.
 */
function createPlainCellDisplay(text: string, color: string, rightAlign: boolean): HTMLDivElement {
  const div = document.createElement('div');

  Object.assign(div, {
    className: rightAlign ? 'ag-cell-display ag-cell-number' : 'ag-cell-display',
    textContent: text,
    title: text,
  });
  div.style.color = color;

  return div;
}

/**
 * Creates a formatted display element for `number`, `date`, `json`, or `jsonl` cells.
 */
function createSpecializedTypeDisplay(
  value: string,
  schema: CsvColumnSchema,
  color: string,
): HTMLDivElement {
  if (schema.dataType === 'number') {
    return createPlainCellDisplay(formatNumberCell(value, schema.decimals).formatted, color, true);
  }

  if (schema.dataType === 'date') {
    return createPlainCellDisplay(formatDateCell(value, schema.dateFormat).formatted, color, false);
  }

  return createStructuredBadgeDisplay(value, schema.dataType === 'jsonl', color);
}

/**
 * Creates a badge preview display for `json` or `jsonl` cells.
 */
function createStructuredBadgeDisplay(
  value: string,
  isJsonl: boolean,
  color: string,
): HTMLDivElement {
  const parsed = isJsonl ? parseJsonlCell(value) : parseJsonCell(value);
  const badgeLabel = getStructuredBadgeLabel(isJsonl, Boolean(parsed.error));

  return createBadgePreviewDisplay(badgeLabel, parsed.preview, color);
}

/**
 * Returns the badge text for a JSON or JSONL cell.
 */
function getStructuredBadgeLabel(isJsonl: boolean, hasError: boolean): string {
  const baseName = isJsonl ? 'JSONL' : 'JSON';

  return hasError ? `!${baseName}` : baseName;
}

/**
 * Checks whether a data row should display as Plain text (either a header row or `text` column).
 */
function isPlainDisplayCell(isHeader: boolean, schema: CsvColumnSchema): boolean {
  if (isHeader) return true;

  return schema.dataType === 'text';
}

/**
 * Resolves the non-editing display `<div>` for a cell based on its column schema.
 */
function resolveTypedDisplayElement(
  actions: GridViewActions,
  cellSpec: CellRenderSpec,
): HTMLDivElement {
  const color = RAINBOW_COLORS[cellSpec.colIndex % RAINBOW_COLORS.length]!;

  if (isPlainDisplayCell(cellSpec.isHeader, cellSpec.schema)) {
    return createPlainCellDisplay(cellSpec.value, color, false);
  }

  if (cellSpec.schema.dataType === 'boolean') {
    return createBooleanCellDisplay(actions, { ...cellSpec, color });
  }

  return createSpecializedTypeDisplay(cellSpec.value, cellSpec.schema, color);
}

/**
 * Checks whether a nullable cell coordinate matches `(rowIndex, colIndex)`.
 *
 * @param coord - Nullable coordinate object.
 * @param rowIndex - Zero-based row index.
 * @param colIndex - Zero-based column index.
 * @returns `true` if `coord` matches `(rowIndex, colIndex)`.
 *
 * @example
 * ```ts
 * isCoordinateMatch({ rowIndex: 1, colIndex: 2 }, 1, 2); // true
 * ```
 */
export function isCoordinateMatch(
  coord: { colIndex: number; rowIndex: number } | null,
  rowIndex: number,
  colIndex: number,
): boolean {
  if (coord?.rowIndex !== rowIndex) return false;

  return coord.colIndex === colIndex;
}

/**
 * Resolves either the inline `<input>` or the typed display `<div>` for a cell.
 *
 * @param state - Current CSV Grid view state.
 * @param actions - User interaction callbacks.
 * @param cellSpec - Cell coordinates, value, and resolved schema.
 * @returns Configured `HTMLElement` to mount inside `<td>`.
 *
 * @example
 * ```ts
 * const el = resolveCellInnerContent(state, actions, cellSpec);
 * ```
 */
export function resolveCellInnerContent(
  state: GridViewState,
  actions: GridViewActions,
  cellSpec: CellRenderSpec,
): HTMLElement {
  if (isCoordinateMatch(state.editingCell, cellSpec.rowIndex, cellSpec.colIndex)) {
    return createInlineEditInput(actions, cellSpec);
  }

  return resolveTypedDisplayElement(actions, cellSpec);
}

/**
 * Layout specification for creating a `<td>` cell element.
 */
export interface CellLayoutSpec {
  /**
   * Zero-based column index.
   */
  colIndex: number;

  /**
   * Whether the cell belongs to a sticky header row.
   */
  isHeader: boolean;

  /**
   * Sticky left offset in pixels when pinned, or `null` when unpinned.
   */
  pinnedLeftOffset: number | null;

  /**
   * Zero-based row index.
   */
  rowIndex: number;

  /**
   * Raw string value of the cell.
   */
  value: string;
}

/**
 * Resolved cell specification including column schema for rendering inner content.
 */
export interface CellRenderSpec extends CellLayoutSpec {
  /**
   * Resolved column schema for `colIndex`.
   */
  schema: CsvColumnSchema;
}

