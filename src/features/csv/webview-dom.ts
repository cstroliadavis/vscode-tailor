import type { CsvSortDirection } from '../../types.ts';
import { buildColumnHeaderLabel, filterCsvRows } from './csv-operations.ts';
import { RAINBOW_COLORS } from './rainbow-helpers.ts';
import type { GridViewActions, GridViewState } from './webview-toolbar.ts';
import { createCsvToolbarElement, createUiButton } from './webview-toolbar.ts';

/**
 * Appends all pinned header rows (`0 .. headerRowCount - 1`) to the `<thead>` element.
 */
function appendPinnedHeaderRows(
  thead: HTMLTableSectionElement,
  state: GridViewState,
  actions: GridViewActions,
): void {
  const limit = Math.min(state.model.headerRowCount, state.model.rows.length);

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    thead.appendChild(createGridRowElement(state, actions, { isHeader: true, rowIndex }));
  }
}

/**
 * Builds the `<tbody>` element populated with visible data rows.
 */
function buildTableBody(
  state: GridViewState,
  actions: GridViewActions,
  visibleRowIndices: number[],
): HTMLTableSectionElement {
  const tbody = document.createElement('tbody');

  for (const rowIndex of visibleRowIndices) {
    tbody.appendChild(createGridRowElement(state, actions, { isHeader: false, rowIndex }));
  }

  return tbody;
}

/**
 * Builds the `<thead>` element with column controls and pinned header rows.
 */
function buildTableHead(state: GridViewState, actions: GridViewActions): HTMLTableSectionElement {
  const thead = document.createElement('thead');
  const colCount = state.model.rows.at(0)?.length ?? 0;

  thead.appendChild(createColumnControlRow(state, actions, colCount));
  appendPinnedHeaderRows(thead, state, actions);

  return thead;
}

/**
 * Creates an editable cell `<td>` containing an `<input>` element bound to `(rowIndex, colIndex)`.
 */
function createCellElement(
  actions: GridViewActions,
  cellSpec: { colIndex: number; isHeader: boolean; rowIndex: number; value: string },
): HTMLTableCellElement {
  const td = document.createElement('td');
  const input = document.createElement('input');
  const color = RAINBOW_COLORS[cellSpec.colIndex % RAINBOW_COLORS.length]!;

  if (cellSpec.isHeader) {
    td.className = 'header-row-cell';
  }

  Object.assign(input, {
    className: 'cell-input',
    type: 'text',
    value: cellSpec.value,
  });
  input.style.color = color;
  input.addEventListener('change', () => {
    actions.onEditCell(cellSpec.rowIndex, cellSpec.colIndex, input.value);
  });
  td.appendChild(input);

  return td;
}

/**
 * Creates the sort and delete action buttons for a single column header.
 */
function createColumnActionGroup(
  state: GridViewState,
  actions: GridViewActions,
  colIndex: number,
): HTMLDivElement {
  const group = document.createElement('div');
  const ascClass = getSortButtonClass(state.activeSort, colIndex, 'asc');
  const descClass = getSortButtonClass(state.activeSort, colIndex, 'desc');

  group.className = 'col-actions';
  group.append(
    createUiButton({
      className: ascClass,
      label: '▲',
      onClick: () => actions.onSortColumn(colIndex, 'asc'),
      title: 'Sort data rows ascending (modifies CSV)',
    }),
    createUiButton({
      className: descClass,
      label: '▼',
      onClick: () => actions.onSortColumn(colIndex, 'desc'),
      title: 'Sort data rows descending (modifies CSV)',
    }),
    createUiButton({
      className: 'icon-btn',
      label: '×',
      onClick: () => actions.onRemoveColumn(colIndex),
      title: 'Delete column',
    }),
  );

  return group;
}

/**
 * Creates a single column control `<th>` with Rainbow accent bar, sort buttons, and column filter.
 */
function createColumnControlCell(
  state: GridViewState,
  actions: GridViewActions,
  colIndex: number,
): HTMLTableCellElement {
  const th = document.createElement('th');
  const wrapper = document.createElement('div');
  const color = RAINBOW_COLORS[colIndex % RAINBOW_COLORS.length]!;

  th.style.borderTop = `3px solid ${color}`;
  wrapper.className = 'col-control-header';
  wrapper.append(
    createColumnTitleRow(state, actions, colIndex),
    createColumnFilterInput(state, actions, colIndex),
  );
  th.appendChild(wrapper);

  return th;
}

/**
 * Creates the top-most `<tr>` inside `<thead>` containing sort and filter controls for each column.
 */
function createColumnControlRow(
  state: GridViewState,
  actions: GridViewActions,
  colCount: number,
): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const cornerTh = document.createElement('th');

  cornerTh.className = 'gutter-cell';
  cornerTh.innerHTML = '<div class="row-gutter"><span>Row</span><span>Pin</span></div>';
  tr.appendChild(cornerTh);

  for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
    tr.appendChild(createColumnControlCell(state, actions, colIndex));
  }

  return tr;
}

/**
 * Creates the per-column filter `<input>` element for `colIndex`.
 */
function createColumnFilterInput(
  state: GridViewState,
  actions: GridViewActions,
  colIndex: number,
): HTMLInputElement {
  const input = document.createElement('input');

  Object.assign(input, {
    className: 'input-field',
    placeholder: 'Filter column...',
    type: 'search',
    value: state.columnFilters[colIndex] ?? '',
  });
  input.addEventListener('input', () => {
    actions.onColumnFilterChange(colIndex, input.value);
  });

  return input;
}

/**
 * Creates the title and sort button row inside a column control header.
 */
function createColumnTitleRow(
  state: GridViewState,
  actions: GridViewActions,
  colIndex: number,
): HTMLDivElement {
  const titleRow = document.createElement('div');
  const titleSpan = document.createElement('span');
  const color = RAINBOW_COLORS[colIndex % RAINBOW_COLORS.length]!;
  const label = buildColumnHeaderLabel(state.model.rows, state.model.headerRowCount, colIndex);

  titleRow.className = 'col-title-row';
  Object.assign(titleSpan, { className: 'col-title', textContent: label, title: label });
  titleSpan.style.color = color;
  titleRow.append(titleSpan, createColumnActionGroup(state, actions, colIndex));

  return titleRow;
}

/**
 * Creates a single `<tr>` for either a pinned header row or a data row.
 */
function createGridRowElement(
  state: GridViewState,
  actions: GridViewActions,
  rowSpec: { isHeader: boolean; rowIndex: number },
): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const rowCells = state.model.rows[rowSpec.rowIndex]!;

  tr.appendChild(createRowGutterCell(actions, rowSpec));

  for (let colIndex = 0; colIndex < rowCells.length; colIndex += 1) {
    tr.appendChild(
      createCellElement(actions, {
        colIndex,
        isHeader: rowSpec.isHeader,
        rowIndex: rowSpec.rowIndex,
        value: rowCells[colIndex]!,
      }),
    );
  }

  return tr;
}

/**
 * Creates the pin and delete button container for a row gutter cell.
 */
function createRowGutterButtons(
  actions: GridViewActions,
  rowSpec: { isHeader: boolean; rowIndex: number },
): HTMLDivElement {
  const btnGroup = document.createElement('div');
  const targetHeaders = rowSpec.isHeader ? rowSpec.rowIndex : rowSpec.rowIndex + 1;

  btnGroup.className = 'col-actions';
  btnGroup.append(
    createUiButton({
      className: rowSpec.isHeader ? 'icon-btn is-active' : 'icon-btn',
      label: '📌',
      onClick: () => actions.onSetHeaderRows(targetHeaders),
      title: getPinButtonTooltip(rowSpec),
    }),
    createUiButton({
      className: 'icon-btn',
      label: '×',
      onClick: () => actions.onRemoveRow(rowSpec.rowIndex),
      title: `Delete row ${rowSpec.rowIndex + 1}`,
    }),
  );

  return btnGroup;
}

/**
 * Creates the sticky left gutter cell for a row with its row label, header-pin button, and delete.
 */
function createRowGutterCell(
  actions: GridViewActions,
  rowSpec: { isHeader: boolean; rowIndex: number },
): HTMLTableCellElement {
  const td = document.createElement('td');
  const gutter = document.createElement('div');
  const label = document.createElement('span');

  td.className = 'gutter-cell';
  gutter.className = 'row-gutter';
  label.textContent = rowSpec.isHeader ? `H${rowSpec.rowIndex + 1}` : `${rowSpec.rowIndex + 1}`;
  gutter.append(label, createRowGutterButtons(actions, rowSpec));
  td.appendChild(gutter);

  return td;
}

/**
 * Computes the tooltip text for a row's header-pin button.
 */
function getPinButtonTooltip(rowSpec: { isHeader: boolean; rowIndex: number }): string {
  if (rowSpec.isHeader) return `Unpin row ${rowSpec.rowIndex + 1} from headers`;

  return `Pin rows 1..${rowSpec.rowIndex + 1} as sticky headers`;
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
 * Builds the complete interactive CSV Grid DOM tree (`toolbar` + `grid-wrapper`) for `state`.
 *
 * @param state - Current CSV Grid view state including model, sort indicator, and view filters.
 * @param actions - Callback handlers for user interactions in the grid.
 * @returns DocumentFragment containing the toolbar and scrollable table.
 *
 * @example
 * ```ts
 * appContainer.replaceChildren(renderCsvGridDom(state, actions));
 * ```
 */
export function renderCsvGridDom(state: GridViewState, actions: GridViewActions): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const visibleRowIndices = filterCsvRows(state.model, {
    columnFilters: state.columnFilters,
    globalQuery: state.globalQuery,
    headerRowCount: state.model.headerRowCount,
  });
  const wrapper = document.createElement('div');
  const table = document.createElement('table');

  wrapper.className = 'grid-wrapper';
  table.append(buildTableHead(state, actions), buildTableBody(state, actions, visibleRowIndices));
  wrapper.appendChild(table);
  fragment.append(createCsvToolbarElement(state, actions, visibleRowIndices.length), wrapper);

  return fragment;
}
