import { resolveColumnSchema } from './csv-column-types.ts';
import { filterCsvRows } from './csv-operations.ts';
import type { CellLayoutSpec } from './webview-cell-renderer.ts';
import { isCoordinateMatch, resolveCellInnerContent } from './webview-cell-renderer.ts';
import {
  applyColumnLayoutStyles,
  computePinnedLeftOffsets,
  createAgHeaderRows,
} from './webview-header.ts';
import { createCellInspectorDrawer } from './webview-inspector.ts';
import type { GridViewActions, GridViewState } from './webview-toolbar.ts';
import {
  createCsvStatusBarElement,
  createCsvToolbarElement,
  createUiButton,
} from './webview-toolbar.ts';

/**
 * Appends all pinned header rows (`0 .. headerRowCount - 1`) to the `<thead>` element.
 */
function appendPinnedHeaderRows(
  thead: HTMLTableSectionElement,
  state: GridViewState,
  actions: GridViewActions,
): void {
  const limit = Math.min(state.model.headerRowCount, state.model.rows.length);
  const pinnedOffsets = computePinnedLeftOffsets(state, getRowColumnCount(state.model.rows));

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    thead.appendChild(
      createGridRowElement(state, actions, { isHeader: true, pinnedOffsets, rowIndex }),
    );
  }
}

/**
 * Applies `.header-row-cell` and `.ag-cell-selected` classes to a `<td>` element.
 */
function applyCellSelectionClasses(
  td: HTMLTableCellElement,
  state: GridViewState,
  cellSpec: { colIndex: number; isHeader: boolean; rowIndex: number },
): void {
  if (cellSpec.isHeader) {
    td.classList.add('header-row-cell');
  }

  if (isCoordinateMatch(state.selectedCell, cellSpec.rowIndex, cellSpec.colIndex)) {
    td.classList.add('ag-cell-selected');
  }
}

/**
 * Builds the split `.ag-workspace` container holding the scrollable grid and optional drawer.
 */
function buildAgWorkspace(
  state: GridViewState,
  actions: GridViewActions,
  visibleRowIndices: number[],
): HTMLDivElement {
  const workspace = document.createElement('div');
  const wrapper = document.createElement('div');
  const table = document.createElement('table');
  const drawer = createCellInspectorDrawer(state, actions);

  workspace.className = 'ag-workspace';
  wrapper.className = 'grid-wrapper';
  table.append(buildTableHead(state, actions), buildTableBody(state, actions, visibleRowIndices));
  wrapper.appendChild(table);
  workspace.append(wrapper, ...(drawer ? [drawer] : []));

  return workspace;
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
  const pinnedOffsets = computePinnedLeftOffsets(state, getRowColumnCount(state.model.rows));

  for (const rowIndex of visibleRowIndices) {
    tbody.appendChild(
      createGridRowElement(state, actions, { isHeader: false, pinnedOffsets, rowIndex }),
    );
  }

  return tbody;
}

/**
 * Builds the `<thead>` element with AG Grid column controls, floating filters, and pinned headers.
 */
function buildTableHead(state: GridViewState, actions: GridViewActions): HTMLTableSectionElement {
  const thead = document.createElement('thead');
  const pinnedOffsets = computePinnedLeftOffsets(state, getRowColumnCount(state.model.rows));
  const [controlRow, filterRow] = createAgHeaderRows(state, actions, pinnedOffsets);

  thead.append(controlRow, filterRow);
  appendPinnedHeaderRows(thead, state, actions);

  return thead;
}

/**
 * Creates a single `<td>` cell with selection, inline-edit, and typed display rendering.
 */
function createCellElement(
  state: GridViewState,
  actions: GridViewActions,
  cellSpec: CellLayoutSpec,
): HTMLTableCellElement {
  const td = document.createElement('td');
  const schema = resolveColumnSchema(state.fileSchema, state.model.rows, cellSpec.colIndex);

  applyColumnLayoutStyles(td, schema, cellSpec.pinnedLeftOffset);
  applyCellSelectionClasses(td, state, cellSpec);
  td.addEventListener('click', () => actions.onSelectCell(cellSpec.rowIndex, cellSpec.colIndex));
  td.addEventListener('dblclick', () =>
    actions.onStartEditingCell({ colIndex: cellSpec.colIndex, rowIndex: cellSpec.rowIndex }),
  );
  td.appendChild(resolveCellInnerContent(state, actions, { ...cellSpec, schema }));

  return td;
}

/**
 * Creates a single `<tr>` for either a pinned header row or a data row.
 */
function createGridRowElement(
  state: GridViewState,
  actions: GridViewActions,
  rowSpec: { isHeader: boolean; pinnedOffsets: (number | null)[]; rowIndex: number },
): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const rowCells = state.model.rows[rowSpec.rowIndex]!;

  tr.className = isSelectedDataRow(state, rowSpec) ? 'ag-row-selected' : '';
  tr.appendChild(createRowGutterCell(actions, rowSpec));

  for (let colIndex = 0; colIndex < rowCells.length; colIndex += 1) {
    tr.appendChild(
      createCellElement(state, actions, {
        colIndex,
        isHeader: rowSpec.isHeader,
        pinnedLeftOffset: rowSpec.pinnedOffsets[colIndex]!,
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
  const pinClass = rowSpec.isHeader ? 'icon-btn is-active' : 'icon-btn';

  btnGroup.className = 'col-actions';
  btnGroup.append(
    createUiButton({
      className: pinClass,
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
 * Returns the column count of the CSV row matrix.
 */
function getRowColumnCount(rows: string[][]): number {
  return rows.at(0)?.length ?? 0;
}

/**
 * Checks whether a row is a selected non-header data row.
 */
function isSelectedDataRow(
  state: GridViewState,
  rowSpec: { isHeader: boolean; rowIndex: number },
): boolean {
  if (rowSpec.isHeader) return false;

  return state.selectedCell?.rowIndex === rowSpec.rowIndex;
}

/**
 * Builds the complete AG Grid-inspired CSV DOM tree (`toolbar` + `ag-workspace` + `status-bar`).
 *
 * @param state - Current CSV Grid view state including model, schema, selection, and filters.
 * @param actions - Callback handlers for user interactions in the grid.
 * @returns DocumentFragment containing the toolbar, split workspace, and bottom status bar.
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

  fragment.append(
    createCsvToolbarElement(state, actions, visibleRowIndices.length),
    buildAgWorkspace(state, actions, visibleRowIndices),
    createCsvStatusBarElement(state, visibleRowIndices.length),
  );

  return fragment;
}
