import type { CsvColumnSchema } from '../../types.ts';
import {
  buildColumnSchemaKey,
  resolveColumnSchema,
  shouldAutoOpenInspector,
} from './csv-column-types.ts';
import type {
  CsvExtensionToWebviewMessage,
  CsvMutationMessage,
  CsvWebviewToExtensionMessage,
} from './csv-messages.ts';
import { applyWebviewMutation } from './csv-messages.ts';
import { renderCsvGridDom } from './webview-dom.ts';
import type { GridViewActions, GridViewState } from './webview-toolbar.ts';

declare function acquireVsCodeApi(): {
  postMessage(message: CsvWebviewToExtensionMessage): void;
};

const ARROW_DELTAS: Record<string, { dCol: number; dRow: number } | undefined> = {
  ArrowDown: { dCol: 0, dRow: 1 },
  ArrowLeft: { dCol: -1, dRow: 0 },
  ArrowRight: { dCol: 1, dRow: 0 },
  ArrowUp: { dCol: 0, dRow: -1 },
};

/**
 * Applies a partial column schema update to `state.fileSchema` and posts it to the extension host.
 */
function applyColumnSchemaPatch(
  ctx: ClientControllerContext,
  colIndex: number,
  patch: Partial<CsvColumnSchema>,
): void {
  const current = resolveColumnSchema(ctx.state.fileSchema, ctx.state.model.rows, colIndex);
  const nextSchema: CsvColumnSchema = { ...current, ...patch };
  const columnKey = buildColumnSchemaKey(
    ctx.state.model.rows,
    ctx.state.model.headerRowCount,
    colIndex,
  );

  ctx.state.fileSchema = {
    ...ctx.state.fileSchema,
    columns: {
      ...ctx.state.fileSchema.columns,
      [columnKey]: nextSchema,
    },
  };
  ctx.postMessage({ columnKey, schema: nextSchema, type: 'updateColumnSchema' });
  ctx.rerender();
}

/**
 * Checks whether keyboard cell navigation is currently allowed.
 */
function canNavigateGridCells(ctx: ClientControllerContext): boolean {
  if (isEditableElementFocused()) return false;

  return ctx.state.selectedCell !== null;
}

/**
 * Captures the currently focused search input's index and cursor offset before re-rendering.
 */
function captureSearchFocus(): SearchFocusSnapshot | null {
  const active = document.activeElement;

  if (!isSearchInputElement(active)) return null;

  const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="search"]'));

  return {
    cursor: active.selectionStart ?? active.value.length,
    index: allInputs.indexOf(active),
  };
}

/**
 * Clamps a numeric coordinate within `[0, maxIndex]`.
 */
function clampIndex(value: number, maxIndex: number): number {
  return Math.max(0, Math.min(maxIndex, value));
}

/**
 * Creates the `GridViewActions` callbacks wired to the webview controller context.
 */
function createClientActions(ctx: ClientControllerContext): GridViewActions {
  return {
    onClearFilters() {
      ctx.state.globalQuery = '';
      ctx.state.columnFilters = {};
      ctx.rerender();
    },
    onColumnFilterChange(colIndex, value) {
      ctx.state.columnFilters = { ...ctx.state.columnFilters, [colIndex]: value };
      ctx.rerender();
    },
    onEditCell: (rowIndex, colIndex, value) =>
      ctx.sendMutation({ colIndex, rowIndex, type: 'editCell', value }),
    onGlobalQueryChange(value) {
      ctx.state.globalQuery = value;
      ctx.rerender();
    },
    onInsertColumn: (atColIndex) =>
      ctx.sendMutation({
        atColIndex,
        headerLabel: `Column ${atColIndex + 1}`,
        type: 'insertColumn',
      }),
    onInsertRow: (atRowIndex) => ctx.sendMutation({ atRowIndex, type: 'insertRow' }),
    onRemoveColumn: (colIndex) => ctx.sendMutation({ colIndex, type: 'removeColumn' }),
    onRemoveRow: (rowIndex) => ctx.sendMutation({ rowIndex, type: 'removeRow' }),
    onSelectCell: (rowIndex, colIndex) => selectGridCell(ctx, rowIndex, colIndex),
    onSetHeaderRows: (headerRowCount) =>
      ctx.sendMutation({ headerRowCount, type: 'setHeaderRowCount' }),
    onSetInspectorMode(mode) {
      ctx.state.inspectorMode = mode;
      ctx.rerender();
    },
    onSortColumn: (colIndex, direction) => sortGridColumn(ctx, colIndex, direction),
    onStartEditingCell(cell) {
      ctx.state.editingCell = cell;
      ctx.rerender();
    },
    onSwitchToText: () => ctx.postMessage({ type: 'switchToText' }),
    onToggleInspector: () => toggleInspectorDrawer(ctx),
    onUpdateColumnSchema: (colIndex, patch) => applyColumnSchemaPatch(ctx, colIndex, patch),
  };
}

/**
 * Creates the initial `GridViewState` before the first document sync arrives.
 */
function createInitialGridState(): GridViewState {
  return {
    activeSort: null,
    columnFilters: {},
    editingCell: null,
    fileName: 'CSV Grid',
    fileSchema: { columns: {}, headerRowCount: 1 },
    globalQuery: '',
    inspectorMode: 'form',
    inspectorOpen: false,
    model: {
      headerRowCount: 1,
      lineEnding: '\n',
      rows: [],
      trailingNewline: true,
    },
    selectedCell: null,
  };
}

/**
 * Ensures `selectedCell` is initialized when the Inspector Drawer is opened on a non-empty grid.
 */
function ensureDefaultSelectedCell(state: GridViewState): void {
  if (state.selectedCell || state.model.rows.length === 0) return;

  const defaultRow = Math.min(state.model.headerRowCount, state.model.rows.length - 1);

  state.selectedCell = { colIndex: 0, rowIndex: defaultRow };
}

/**
 * Reads a raw cell value from the CSV row matrix, returning `''` when out of bounds.
 */
function getCellText(rows: string[][], rowIndex: number, colIndex: number): string {
  return rows[rowIndex]?.[colIndex] ?? '';
}

/**
 * Starts inline editing on the selected cell when `Enter` is pressed.
 */
function handleEnterKeyEdit(ctx: ClientControllerContext, event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  ctx.state.editingCell = { ...ctx.state.selectedCell! };
  ctx.rerender();
}

/**
 * Handles keyboard arrow navigation and `Enter` inline edit activation when no input is focused.
 */
function handleGridKeydown(ctx: ClientControllerContext, event: KeyboardEvent): void {
  if (!canNavigateGridCells(ctx)) return;

  const delta = ARROW_DELTAS[event.key];

  if (delta) {
    event.preventDefault();
    moveSelectedCell(ctx, delta.dRow, delta.dCol);

    return;
  }

  handleEnterKeyEdit(ctx, event);
}

/**
 * Checks whether an `<input>`, `<textarea>`, or `<select>` element currently holds DOM focus.
 */
function isEditableElementFocused(): boolean {
  const tag = document.activeElement?.tagName ?? '';

  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
}

/**
 * Checks whether a DOM element is an `HTMLInputElement` of type `'search'`.
 */
function isSearchInputElement(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) return false;

  return element.type === 'search';
}

/**
 * Moves `selectedCell` by `(dRow, dCol)` clamped within the CSV matrix bounds.
 */
function moveSelectedCell(ctx: ClientControllerContext, dRow: number, dCol: number): void {
  const sel = ctx.state.selectedCell;
  const firstRow = ctx.state.model.rows.at(0);

  if (!sel || !firstRow) return;

  const nextRow = clampIndex(sel.rowIndex + dRow, ctx.state.model.rows.length - 1);
  const nextCol = clampIndex(sel.colIndex + dCol, firstRow.length - 1);

  selectGridCell(ctx, nextRow, nextCol);
}

/**
 * Restores focus and cursor selection to a previously focused search input after DOM replacement.
 */
function restoreSearchFocus(snapshot: SearchFocusSnapshot | null): void {
  if (!snapshot) return;

  const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="search"]'));
  const target = allInputs.at(snapshot.index);

  if (!target) return;

  target.focus();
  target.setSelectionRange(snapshot.cursor, snapshot.cursor);
}

/**
 * Selects `(rowIndex, colIndex)` and auto-opens the Inspector Drawer for structured/long cells.
 */
function selectGridCell(ctx: ClientControllerContext, rowIndex: number, colIndex: number): void {
  const rawVal = getCellText(ctx.state.model.rows, rowIndex, colIndex);
  const schema = resolveColumnSchema(ctx.state.fileSchema, ctx.state.model.rows, colIndex);

  ctx.state.selectedCell = { colIndex, rowIndex };

  if (shouldAutoOpenInspector(rawVal, schema.dataType)) {
    ctx.state.inspectorOpen = true;
  }

  ctx.rerender();
}

/**
 * Updates `activeSort` and dispatches a `sortColumn` mutation to the extension host.
 */
function sortGridColumn(
  ctx: ClientControllerContext,
  colIndex: number,
  direction: 'asc' | 'desc',
): void {
  ctx.state.activeSort = { colIndex, direction };
  ctx.sendMutation({
    colIndex,
    direction,
    headerRowCount: ctx.state.model.headerRowCount,
    type: 'sortColumn',
  });
}

/**
 * Toggles the right-side Inspector Drawer and ensures a default cell is selected when opening.
 */
function toggleInspectorDrawer(ctx: ClientControllerContext): void {
  ctx.state.inspectorOpen = !ctx.state.inspectorOpen;

  if (ctx.state.inspectorOpen) {
    ensureDefaultSelectedCell(ctx.state);
  }

  ctx.rerender();
}

/**
 * Initializes the CSV Grid Webview client and connects message listeners to VS Code.
 *
 * @example
 * ```ts
 * startCsvWebviewClient();
 * ```
 */
export function startCsvWebviewClient(): void {
  const vscodeApi = acquireVsCodeApi();
  const _ = {
    container: document.getElementById('app'),
    state: createInitialGridState(),
  };

  const rerender = (): void => {
    if (!_.container) return;

    const focusSnapshot = captureSearchFocus();
    const dom = renderCsvGridDom(_.state, actions);

    _.container.replaceChildren(dom);
    restoreSearchFocus(focusSnapshot);
  };

  const sendMutation = (msg: CsvMutationMessage): void => {
    _.state.model = applyWebviewMutation(_.state.model, msg);
    vscodeApi.postMessage(msg);
    rerender();
  };

  const ctx: ClientControllerContext = {
    postMessage: (msg) => vscodeApi.postMessage(msg),
    rerender,
    sendMutation,
    state: _.state,
  };
  const actions = createClientActions(ctx);

  window.addEventListener('keydown', (event) => handleGridKeydown(ctx, event));
  window.addEventListener('message', (event: MessageEvent<CsvExtensionToWebviewMessage>) => {
    _.state.fileName = event.data.fileName;
    _.state.fileSchema = event.data.fileSchema;
    _.state.model = event.data.model;
    rerender();
  });

  vscodeApi.postMessage({ type: 'ready' });
}

/**
 * Internal controller context passed to webview action handlers.
 */
interface ClientControllerContext {
  postMessage: (msg: CsvWebviewToExtensionMessage) => void;
  rerender: () => void;
  sendMutation: (msg: CsvMutationMessage) => void;
  state: GridViewState;
}

/**
 * Snapshot of active search input focus and cursor offset across DOM re-renders.
 */
interface SearchFocusSnapshot {
  cursor: number;
  index: number;
}

if (typeof window !== 'undefined') {
  startCsvWebviewClient();
}
