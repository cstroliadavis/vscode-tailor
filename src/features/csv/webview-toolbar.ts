import type {
  CsvColumnSchema,
  CsvDocumentModel,
  CsvFileSchemaConfig,
  CsvSortDirection,
} from '../../types.ts';
import { resolveColumnSchema } from './csv-column-types.ts';
import { buildColumnHeaderLabel } from './csv-operations.ts';

/**
 * Formats the selected cell summary text for the bottom AG Grid status bar.
 */
function buildSelectedCellStatusText(state: GridViewState): string {
  const sel = state.selectedCell;

  if (!sel) return 'Selected: None (click any cell to inspect, double-click to edit)';

  const label = buildColumnHeaderLabel(state.model.rows, state.model.headerRowCount, sel.colIndex);
  const schema = resolveColumnSchema(state.fileSchema, state.model.rows, sel.colIndex);

  return `Selected: Row ${sel.rowIndex + 1}, ${label} [${schema.dataType}]`;
}

/**
 * Creates the right-side toolbar group containing filter controls, drawer toggle, and view switch.
 */
function createToolbarActionsGroup(state: GridViewState, actions: GridViewActions): HTMLDivElement {
  const group = document.createElement('div');
  const searchInput = createToolbarSearchInput(state.globalQuery, actions);
  const colCount = getColumnCount(state.model);
  const drawerBtnClass = state.inspectorOpen ? 'btn btn-primary' : 'btn';

  group.className = 'toolbar-group';
  group.append(
    searchInput,
    createUiButton({
      className: 'btn',
      label: 'Clear Filters',
      onClick: () => actions.onClearFilters(),
      title: 'Reset all view filters',
    }),
    createUiButton({
      className: 'btn',
      label: '+ Row',
      onClick: () => actions.onInsertRow(state.model.rows.length),
      title: 'Append a new row at the bottom',
    }),
    createUiButton({
      className: 'btn',
      label: '+ Column',
      onClick: () => actions.onInsertColumn(colCount),
      title: 'Append a new column on the right',
    }),
    createUiButton({
      className: drawerBtnClass,
      label: 'Inspector Drawer',
      onClick: () => actions.onToggleInspector(),
      title: 'Toggle the right-side Cell Inspector Drawer',
    }),
    createUiButton({
      className: 'btn btn-primary',
      label: 'Switch to Text View',
      onClick: () => actions.onSwitchToText(),
      title: 'Open this CSV in the standard VS Code Text Editor with Rainbow CSV coloring',
    }),
  );

  return group;
}

/**
 * Creates the left-side toolbar group with filename, header row stepper, and visible row counter.
 */
function createToolbarHeaderGroup(
  state: GridViewState,
  actions: GridViewActions,
  visibleCount: number,
): HTMLDivElement {
  const group = document.createElement('div');
  const title = createToolbarSpan('strong', state.fileName, '');
  const headerLabel = createToolbarSpan('span', `Header Rows: ${state.model.headerRowCount}`, '');
  const totalDataRows = Math.max(0, state.model.rows.length - state.model.headerRowCount);
  const countBadge = createToolbarSpan('span', `${visibleCount} / ${totalDataRows} rows`, 'badge');

  group.className = 'toolbar-group';
  group.append(
    title,
    createUiButton({
      className: 'btn',
      label: '−',
      onClick: () => actions.onSetHeaderRows(state.model.headerRowCount - 1),
      title: 'Decrease sticky header rows',
    }),
    headerLabel,
    createUiButton({
      className: 'btn',
      label: '+',
      onClick: () => actions.onSetHeaderRows(state.model.headerRowCount + 1),
      title: 'Increase sticky header rows',
    }),
    countBadge,
  );

  return group;
}

/**
 * Creates the global filter search `<input>` element for the toolbar.
 */
function createToolbarSearchInput(globalQuery: string, actions: GridViewActions): HTMLInputElement {
  const searchInput = document.createElement('input');

  Object.assign(searchInput, {
    className: 'input-field',
    placeholder: 'Quick filter all columns...',
    type: 'search',
    value: globalQuery,
  });
  searchInput.addEventListener('input', () => actions.onGlobalQueryChange(searchInput.value));

  return searchInput;
}

/**
 * Creates a text element (`span` or `strong`) with optional class name.
 */
function createToolbarSpan(
  tag: 'span' | 'strong',
  textContent: string,
  className: string,
): HTMLElement {
  const el = document.createElement(tag);

  Object.assign(el, { className, textContent });

  return el;
}

/**
 * Returns the column count of the CSV document model.
 */
function getColumnCount(model: CsvDocumentModel): number {
  return model.rows.at(0)?.length ?? 0;
}

/**
 * Creates the bottom AG Grid-style status bar showing row counts and selected cell metadata.
 *
 * @param state - Current CSV Grid view state.
 * @param visibleCount - Number of visible data rows after filtering.
 * @returns Configured status bar `HTMLDivElement`.
 *
 * @example
 * ```ts
 * const statusBar = createCsvStatusBarElement(state, 10);
 * ```
 */
export function createCsvStatusBarElement(
  state: GridViewState,
  visibleCount: number,
): HTMLDivElement {
  const bar = document.createElement('div');
  const left = document.createElement('span');
  const right = document.createElement('span');
  const totalData = Math.max(0, state.model.rows.length - state.model.headerRowCount);
  const colCount = state.model.rows.at(0)?.length ?? 0;

  bar.className = 'ag-status-bar';
  left.textContent = `Data Rows: ${visibleCount} of ${totalData} · Columns: ${colCount} · Sticky Headers: ${state.model.headerRowCount}`;
  right.textContent = buildSelectedCellStatusText(state);
  bar.append(left, right);

  return bar;
}

/**
 * Creates the top toolbar `<div>` element for the CSV Grid View.
 *
 * @param state - Current CSV Grid view state.
 * @param actions - User interaction callbacks.
 * @param visibleCount - Number of visible data rows after view filtering.
 * @returns Configured toolbar `HTMLDivElement`.
 *
 * @example
 * ```ts
 * const toolbar = createCsvToolbarElement(state, actions, 10);
 * ```
 */
export function createCsvToolbarElement(
  state: GridViewState,
  actions: GridViewActions,
  visibleCount: number,
): HTMLDivElement {
  const toolbar = document.createElement('div');

  toolbar.className = 'toolbar';
  toolbar.append(
    createToolbarHeaderGroup(state, actions, visibleCount),
    createToolbarActionsGroup(state, actions),
  );

  return toolbar;
}

/**
 * Creates a styled `<button>` element with text, tooltip title, and click listener.
 *
 * @param params - Button label, CSS class name, tooltip title, and click callback.
 * @returns Configured `HTMLButtonElement`.
 *
 * @example
 * ```ts
 * const btn = createUiButton({
 *   className: 'btn',
 *   label: '+ Row',
 *   onClick: () => {},
 *   title: 'Add row',
 * });
 * ```
 */
export function createUiButton(params: {
  className: string;
  label: string;
  onClick: () => void;
  title: string;
}): HTMLButtonElement {
  const btn = document.createElement('button');

  Object.assign(btn, {
    className: params.className,
    textContent: params.label,
    title: params.title,
    type: 'button',
  });
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    params.onClick();
  });

  return btn;
}

/**
 * User interaction callbacks dispatched by the CSV Grid DOM components.
 */
export interface GridViewActions {
  /**
   * Resets both global and per-column view filters.
   */
  onClearFilters(): void;

  /**
   * Updates the view filter query for a specific column index.
   */
  onColumnFilterChange(colIndex: number, value: string): void;

  /**
   * Commits a cell value edit to the underlying CSV document.
   */
  onEditCell(rowIndex: number, colIndex: number, value: string): void;

  /**
   * Updates the global substring filter query.
   */
  onGlobalQueryChange(value: string): void;

  /**
   * Inserts a new column at `atColIndex`.
   */
  onInsertColumn(atColIndex: number): void;

  /**
   * Inserts a new row at `atRowIndex`.
   */
  onInsertRow(atRowIndex: number): void;

  /**
   * Removes the column at `colIndex`.
   */
  onRemoveColumn(colIndex: number): void;

  /**
   * Removes the row at `rowIndex`.
   */
  onRemoveRow(rowIndex: number): void;

  /**
   * Selects a cell at `(rowIndex, colIndex)` and updates the Inspector Drawer.
   */
  onSelectCell(rowIndex: number, colIndex: number): void;

  /**
   * Updates the number of top contiguous sticky header rows.
   */
  onSetHeaderRows(headerRowCount: number): void;

  /**
   * Switches the Inspector Drawer view mode between `'form'` and `'code'`.
   */
  onSetInspectorMode(mode: 'code' | 'form'): void;

  /**
   * Performs a real sort on data rows below the header block and persists to the CSV document.
   */
  onSortColumn(colIndex: number, direction: CsvSortDirection): void;

  /**
   * Enters or exits inline cell editing mode.
   */
  onStartEditingCell(cell: { colIndex: number; rowIndex: number } | null): void;

  /**
   * Switches the active editor from the CSV Grid View to the standard VS Code Text Editor.
   */
  onSwitchToText(): void;

  /**
   * Toggles the right-side Cell Inspector Drawer open or closed.
   */
  onToggleInspector(): void;

  /**
   * Updates and persists the `CsvColumnSchema` for `colIndex` in `.vscode/settings.json`.
   */
  onUpdateColumnSchema(colIndex: number, patch: Partial<CsvColumnSchema>): void;
}

/**
 * Local UI state rendered by the CSV Grid Webview client.
 */
export interface GridViewState {
  /**
   * Last applied column sort indicator.
   */
  activeSort: { colIndex: number; direction: CsvSortDirection } | null;

  /**
   * Map of zero-based column index to active view-only filter string.
   */
  columnFilters: Record<number, string>;

  /**
   * Coordinates of the cell currently being edited inline in the grid, if any.
   */
  editingCell: { colIndex: number; rowIndex: number } | null;

  /**
   * Display name of the active CSV file.
   */
  fileName: string;

  /**
   * Per-file column schema configuration synced with `.vscode/settings.json`.
   */
  fileSchema: CsvFileSchemaConfig;

  /**
   * Global view-only search string across all columns.
   */
  globalQuery: string;

  /**
   * Active view mode inside the right-side Cell Inspector Drawer (`'form'` or `'code'`).
   */
  inspectorMode: 'code' | 'form';

  /**
   * Whether the right-side Cell Inspector Drawer is currently visible.
   */
  inspectorOpen: boolean;

  /**
   * Current parsed CSV document model.
   */
  model: CsvDocumentModel;

  /**
   * Coordinates of the currently selected cell in the grid, if any.
   */
  selectedCell: { colIndex: number; rowIndex: number } | null;
}
