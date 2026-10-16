import type { CsvColumnSchema, CsvSortDirection } from '../../types.ts';
import { resolveColumnSchema } from './csv-column-types.ts';
import { buildColumnHeaderLabel } from './csv-operations.ts';
import { RAINBOW_COLORS } from './rainbow-helpers.ts';
import { createDataTypeSelect, createFormatSelect } from './webview-header-selects.ts';
import type { GridViewActions, GridViewState } from './webview-toolbar.ts';
import { createUiButton } from './webview-toolbar.ts';

/**
 * Attaches drag-to-resize mouse handlers to a column header's `.ag-resizer` handle.
 */
function attachResizeListeners(
  handle: HTMLDivElement,
  th: HTMLTableCellElement,
  spec: { actions: GridViewActions; colIndex: number; initialWidth: number },
): void {
  handle.addEventListener('mousedown', (downEvent: MouseEvent) => {
    downEvent.preventDefault();
    downEvent.stopPropagation();
    const startX = downEvent.clientX;
    let nextWidth = spec.initialWidth;

    const onMove = (moveEvent: MouseEvent): void => {
      nextWidth = Math.max(90, Math.round(spec.initialWidth + (moveEvent.clientX - startX)));
      Object.assign(th.style, { minWidth: `${nextWidth}px`, width: `${nextWidth}px` });
    };

    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      spec.actions.onUpdateColumnSchema(spec.colIndex, { width: nextWidth });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

/**
 * Creates the pin, sort, and delete action buttons for a single column header.
 */
function createColumnActionGroup(
  state: GridViewState,
  actions: GridViewActions,
  colSpec: { colIndex: number; isPinned: boolean },
): HTMLDivElement {
  const group = document.createElement('div');
  const pinClass = colSpec.isPinned ? 'icon-btn is-active' : 'icon-btn';
  const ascClass = getSortButtonClass(state.activeSort, colSpec.colIndex, 'asc');
  const descClass = getSortButtonClass(state.activeSort, colSpec.colIndex, 'desc');

  group.className = 'col-actions';
  group.append(
    createUiButton({
      className: pinClass,
      label: '📌',
      onClick: () => actions.onUpdateColumnSchema(colSpec.colIndex, { pinned: !colSpec.isPinned }),
      title: 'Pin or unpin column',
    }),
    createUiButton({
      className: ascClass,
      label: '▲',
      onClick: () => actions.onSortColumn(colSpec.colIndex, 'asc'),
      title: 'Sort ascending (modifies CSV)',
    }),
    createUiButton({
      className: descClass,
      label: '▼',
      onClick: () => actions.onSortColumn(colSpec.colIndex, 'desc'),
      title: 'Sort descending (modifies CSV)',
    }),
    createUiButton({
      className: 'icon-btn',
      label: '×',
      onClick: () => actions.onRemoveColumn(colSpec.colIndex),
      title: 'Delete column',
    }),
  );

  return group;
}

/**
 * Creates a single column control `<th>` with Rainbow accent bar, type selector, and resizer.
 */
function createColumnControlCell(
  state: GridViewState,
  actions: GridViewActions,
  colSpec: { colIndex: number; pinnedLeftOffset: number | null },
): HTMLTableCellElement {
  const th = document.createElement('th');
  const wrapper = document.createElement('div');
  const schema = resolveColumnSchema(state.fileSchema, state.model.rows, colSpec.colIndex);

  applyColumnLayoutStyles(th, schema, colSpec.pinnedLeftOffset);
  th.style.borderTop = `3px solid ${RAINBOW_COLORS[colSpec.colIndex % RAINBOW_COLORS.length]!}`;
  wrapper.className = 'col-control-header';
  wrapper.append(
    createColumnTitleRow(state, actions, { colIndex: colSpec.colIndex, schema }),
    createColumnMetaRow(actions, colSpec.colIndex, schema),
  );
  th.append(wrapper, createColumnResizer(th, actions, { colIndex: colSpec.colIndex, schema }));

  return th;
}

/**
 * Creates the meta row inside a column header with data type and format `<select>` dropdowns.
 */
function createColumnMetaRow(
  actions: GridViewActions,
  colIndex: number,
  schema: CsvColumnSchema,
): HTMLDivElement {
  const row = document.createElement('div');
  const formatControl = createFormatSelect(actions, colIndex, schema);

  row.className = 'col-meta-row';
  row.appendChild(createDataTypeSelect(actions, colIndex, schema.dataType));

  if (formatControl) {
    row.appendChild(formatControl);
  }

  return row;
}

/**
 * Creates and wires the `.ag-resizer` drag handle for a column `<th>`.
 */
function createColumnResizer(
  th: HTMLTableCellElement,
  actions: GridViewActions,
  spec: { colIndex: number; schema: CsvColumnSchema },
): HTMLDivElement {
  const resizer = document.createElement('div');

  resizer.className = 'ag-resizer';
  attachResizeListeners(resizer, th, {
    actions,
    colIndex: spec.colIndex,
    initialWidth: spec.schema.width ?? 160,
  });

  return resizer;
}

/**
 * Creates the clickable column title `<span>` that cycles ascending/descending sort.
 */
function createColumnTitleElement(
  state: GridViewState,
  actions: GridViewActions,
  colIndex: number,
): HTMLSpanElement {
  const titleSpan = document.createElement('span');
  const label = buildColumnHeaderLabel(state.model.rows, state.model.headerRowCount, colIndex);
  const nextDir = getNextSortDirection(state.activeSort, colIndex);

  Object.assign(titleSpan, {
    className: 'col-title',
    textContent: label,
    title: `${label} (click to sort ${nextDir})`,
  });
  titleSpan.style.color = RAINBOW_COLORS[colIndex % RAINBOW_COLORS.length]!;
  titleSpan.addEventListener('click', () => actions.onSortColumn(colIndex, nextDir));

  return titleSpan;
}

/**
 * Creates the title and action button row inside a column control header.
 */
function createColumnTitleRow(
  state: GridViewState,
  actions: GridViewActions,
  colSpec: { colIndex: number; schema: CsvColumnSchema },
): HTMLDivElement {
  const titleRow = document.createElement('div');

  titleRow.className = 'col-title-row';
  titleRow.append(
    createColumnTitleElement(state, actions, colSpec.colIndex),
    createColumnActionGroup(state, actions, {
      colIndex: colSpec.colIndex,
      isPinned: Boolean(colSpec.schema.pinned),
    }),
  );

  return titleRow;
}

/**
 * Creates a sticky left-gutter header `<th>` cell.
 */
function createCornerHeaderCell(className: string, innerHtml: string): HTMLTableCellElement {
  const th = document.createElement('th');

  Object.assign(th, { className, innerHTML: innerHtml });

  return th;
}

/**
 * Creates a single floating filter `<th>` cell for `colIndex`.
 */
function createFloatingFilterCell(
  state: GridViewState,
  actions: GridViewActions,
  colSpec: { colIndex: number; pinnedLeftOffset: number | null },
): HTMLTableCellElement {
  const th = document.createElement('th');
  const input = document.createElement('input');
  const schema = resolveColumnSchema(state.fileSchema, state.model.rows, colSpec.colIndex);

  th.className = 'ag-floating-filter-cell';
  applyColumnLayoutStyles(th, schema, colSpec.pinnedLeftOffset);
  Object.assign(input, {
    className: 'input-field',
    placeholder: `Filter ${schema.dataType}...`,
    type: 'search',
    value: getColumnFilterText(state.columnFilters, colSpec.colIndex),
  });
  input.addEventListener('input', () => {
    actions.onColumnFilterChange(colSpec.colIndex, input.value);
  });
  th.appendChild(input);

  return th;
}

/**
 * Reads the filter string for `colIndex` from the column filters map.
 */
function getColumnFilterText(
  filters: Record<number, string | undefined>,
  colIndex: number,
): string {
  return filters[colIndex] ?? '';
}

/**
 * Computes the next sort direction when clicking a column header title.
 */
function getNextSortDirection(
  activeSort: GridViewState['activeSort'],
  colIndex: number,
): CsvSortDirection {
  if (isMatchingSort(activeSort, colIndex, 'asc')) return 'desc';

  return 'asc';
}

/**
 * Returns the CSS class name for a column sort button (`is-active` when matching `activeSort`).
 */
function getSortButtonClass(
  activeSort: GridViewState['activeSort'],
  colIndex: number,
  direction: CsvSortDirection,
): string {
  return isMatchingSort(activeSort, colIndex, direction) ? 'icon-btn is-active' : 'icon-btn';
}

/**
 * Checks whether `activeSort` matches the given column index and sort direction.
 */
function isMatchingSort(
  activeSort: GridViewState['activeSort'],
  colIndex: number,
  direction: CsvSortDirection,
): boolean {
  if (activeSort?.colIndex !== colIndex) return false;

  return activeSort.direction === direction;
}

/**
 * Resolves the sticky offset and next accumulated left pixel position for a single column.
 */
function stepPinnedOffset(
  currentLeft: number,
  schema: CsvColumnSchema,
): { nextLeft: number; offset: number | null } {
  if (!schema.pinned) return { nextLeft: currentLeft, offset: null };

  const colWidth = schema.width ?? 160;

  return { nextLeft: currentLeft + colWidth, offset: currentLeft };
}

/**
 * Applies width and optional sticky left-pinning styles to a table cell (`<th>` or `<td>`).
 *
 * @param cell - Target `<th>` or `<td>` element.
 * @param schema - Resolved column schema containing `width` and `pinned`.
 * @param pinnedLeftOffset - Sticky `left` pixel offset when pinned, or `null` when unpinned.
 *
 * @example
 * ```ts
 * applyColumnLayoutStyles(td, schema, 74);
 * ```
 */
export function applyColumnLayoutStyles(
  cell: HTMLTableCellElement,
  schema: CsvColumnSchema,
  pinnedLeftOffset: number | null,
): void {
  const widthPx = `${schema.width ?? 160}px`;

  Object.assign(cell.style, { maxWidth: widthPx, minWidth: widthPx, width: widthPx });

  if (pinnedLeftOffset !== null) {
    cell.classList.add('ag-pinned-cell');
    cell.style.left = `${pinnedLeftOffset}px`;
  }
}

/**
 * Computes sticky `left` pixel offsets for all left-pinned columns (or `null` when unpinned).
 *
 * @param state - Current CSV Grid view state.
 * @param colCount - Total number of columns in the dataset.
 * @returns Array mapping each `colIndex` to its sticky left pixel offset or `null`.
 *
 * @example
 * ```ts
 * const offsets = computePinnedLeftOffsets(state, 4);
 * ```
 */
export function computePinnedLeftOffsets(
  state: GridViewState,
  colCount: number,
): (number | null)[] {
  const offsets: (number | null)[] = [];
  let currentLeft = 74;

  for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
    const schema = resolveColumnSchema(state.fileSchema, state.model.rows, colIndex);
    const step = stepPinnedOffset(currentLeft, schema);

    offsets.push(step.offset);
    currentLeft = step.nextLeft;
  }

  return offsets;
}

/**
 * Creates the top-most column control `<tr>` and the floating filter `<tr>` for `<thead>`.
 *
 * @param state - Current CSV Grid view state.
 * @param actions - User interaction callbacks.
 * @param pinnedOffsets - Sticky left offsets for each column.
 * @returns Tuple of `[columnControlRow, floatingFilterRow]`.
 *
 * @example
 * ```ts
 * const [controlRow, filterRow] = createAgHeaderRows(state, actions, offsets);
 * ```
 */
export function createAgHeaderRows(
  state: GridViewState,
  actions: GridViewActions,
  pinnedOffsets: (number | null)[],
): [HTMLTableRowElement, HTMLTableRowElement] {
  const controlTr = document.createElement('tr');
  const filterTr = document.createElement('tr');

  controlTr.appendChild(
    createCornerHeaderCell(
      'gutter-cell',
      '<div class="row-gutter"><span>Row</span><span>Pin</span></div>',
    ),
  );
  filterTr.appendChild(
    createCornerHeaderCell(
      'gutter-cell ag-floating-filter-cell',
      '<div class="row-gutter"><span>Filter</span></div>',
    ),
  );

  for (let colIndex = 0; colIndex < pinnedOffsets.length; colIndex += 1) {
    const pinnedLeftOffset = pinnedOffsets[colIndex] ?? null;

    controlTr.appendChild(createColumnControlCell(state, actions, { colIndex, pinnedLeftOffset }));
    filterTr.appendChild(createFloatingFilterCell(state, actions, { colIndex, pinnedLeftOffset }));
  }

  return [controlTr, filterTr];
}
