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
 * Creates the `GridViewActions` callbacks wired to the webview controller context.
 */
function createClientActions(ctx: {
  postMessage: (msg: CsvWebviewToExtensionMessage) => void;
  rerender: () => void;
  sendMutation: (msg: CsvMutationMessage) => void;
  state: GridViewState;
}): GridViewActions {
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
    onSetHeaderRows: (headerRowCount) =>
      ctx.sendMutation({ headerRowCount, type: 'setHeaderRowCount' }),
    onSortColumn(colIndex, direction) {
      ctx.state.activeSort = { colIndex, direction };
      ctx.sendMutation({
        colIndex,
        direction,
        headerRowCount: ctx.state.model.headerRowCount,
        type: 'sortColumn',
      });
    },
    onSwitchToText: () => ctx.postMessage({ type: 'switchToText' }),
  };
}

/**
 * Checks whether a DOM element is an `HTMLInputElement` of type `'search'`.
 */
function isSearchInputElement(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) return false;

  return element.type === 'search';
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
    state: {
      activeSort: null,
      columnFilters: {},
      fileName: 'CSV Grid',
      globalQuery: '',
      model: {
        headerRowCount: 1,
        lineEnding: '\n',
        rows: [],
        trailingNewline: true,
      },
    } as GridViewState,
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

  const actions = createClientActions({
    postMessage: (msg) => vscodeApi.postMessage(msg),
    rerender,
    sendMutation,
    state: _.state,
  });

  window.addEventListener('message', (event: MessageEvent<CsvExtensionToWebviewMessage>) => {
    _.state.fileName = event.data.fileName;
    _.state.model = event.data.model;
    rerender();
  });

  vscodeApi.postMessage({ type: 'ready' });
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

