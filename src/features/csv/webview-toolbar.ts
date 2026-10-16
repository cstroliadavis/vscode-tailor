import type { CsvDocumentModel, CsvSortDirection } from '../../types.ts';

/**
 * Creates the right-side toolbar group containing filter controls, row/col actions, and view switch.
 */
function createToolbarActionsGroup(state: GridViewState, actions: GridViewActions): HTMLDivElement {
  const group = document.createElement('div');
  const searchInput = createToolbarSearchInput(state.globalQuery, actions);
  const colCount = state.model.rows.at(0)?.length ?? 0;

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
  const countBadge = createToolbarSpan(
    'span',
    `(${visibleCount} of ${totalDataRows} data rows shown)`,
    'badge',
  );

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
    placeholder: 'Filter all columns (view only)...',
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
  btn.addEventListener('click', params.onClick);

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
   * Updates the number of top contiguous sticky header rows.
   */
  onSetHeaderRows(headerRowCount: number): void;

  /**
   * Performs a real sort on data rows below the header block and persists to the CSV document.
   */
  onSortColumn(colIndex: number, direction: CsvSortDirection): void;

  /**
   * Switches the active editor from the CSV Grid View to the standard VS Code Text Editor.
   */
  onSwitchToText(): void;
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
   * Display name of the active CSV file.
   */
  fileName: string;

  /**
   * Global view-only search string across all columns.
   */
  globalQuery: string;

  /**
   * Current parsed CSV document model.
   */
  model: CsvDocumentModel;
}
