import type { HttpDocumentModel, HttpRequestBlock, HttpResponseSnapshot } from './http-types.ts';
import type { HttpInspectorTabId } from './http-webview-inspector.ts';
import { renderRequestInspectorPane } from './http-webview-inspector.ts';
import type { HttpResponseSubTab } from './http-webview-response.ts';
import { renderResponsePane } from './http-webview-response.ts';
import { createButton } from './http-webview-tables.ts';

/**
 * Creates a single `<option>` element for the environment selector.
 */
function createEnvOption(envName: string, activeEnv: string): HTMLOptionElement {
  const opt = document.createElement('option');

  Object.assign(opt, {
    selected: envName === activeEnv,
    textContent: `env: ${envName}`,
    value: envName,
  });

  return opt;
}

/**
 * Creates a default `GET` `HttpRequestBlock` when the user clicks `+ New Request`.
 */
function createNewDefaultRequest(index: number): HttpRequestBlock {
  return {
    assertions: [],
    auth: { scheme: 'none' },
    body: '',
    cookies: [],
    endLine: 0,
    headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
    id: `req-${Date.now()}-${index}`,
    method: 'GET',
    name: `Request ${index}`,
    params: [],
    preComments: [],
    requestLine: 0,
    responseScript: '',
    startLine: 0,
    url: 'https://httpbin.org/get',
  };
}

/**
 * Renders the Center Request Inspector Column.
 */
function renderCenterColumn(state: HttpWorkbenchRenderState): HTMLElement {
  const selectedReq = resolveSelectedRequest(state);

  return renderRequestInspectorPane({
    activeTab: state.activeInspectorTab,
    onMutate: (next) => updateRequestInDoc(state.document, next, state.onMutateDocument),
    onMutateVariables: (variables) => state.onMutateDocument({ ...state.document, variables }),
    onRunRequest: state.onRunRequest,
    onSelectTab: state.onSelectInspectorTab,
    request: selectedReq,
    variables: state.document.variables,
  });
}

/**
 * Renders the environment `<select>` dropdown in the top toolbar.
 */
function renderEnvSelect(state: HttpWorkbenchRenderState): HTMLSelectElement {
  const select = document.createElement('select');
  const envs = resolveEnvList(state.environments);
  const activeEnv = state.activeEnvironment ?? envs[0]!;

  select.className = 'select-field mono';

  for (const envName of envs) {
    select.appendChild(createEnvOption(envName, activeEnv));
  }

  select.addEventListener('change', () => state.onSelectEnvironment(select.value));

  return select;
}

/**
 * Renders the Left Sidebar (Request Collection List).
 */
function renderSidebarPane(state: HttpWorkbenchRenderState): HTMLElement {
  const aside = document.createElement('aside');
  const header = document.createElement('div');
  const list = document.createElement('div');

  Object.assign(aside, { className: 'sidebar-pane' });
  Object.assign(header, {
    className: 'pane-header',
    textContent: `Requests (${state.document.requests.length})`,
  });
  Object.assign(list, { className: 'pane-content' });
  list.append(...state.document.requests.map((req) => renderSidebarRequestRow(req, state)));
  aside.append(header, list);

  return aside;
}

/**
 * Renders a single clickable request item in the Left Sidebar.
 */
function renderSidebarRequestRow(
  req: HttpRequestBlock,
  state: HttpWorkbenchRenderState,
): HTMLElement {
  const row = document.createElement('div');
  const badge = document.createElement('span');
  const title = document.createElement('span');
  const runBtn = createButton('▶', 'btn icon-btn', () => state.onRunRequest(req.id));

  Object.assign(row, {
    className: req.id === state.selectedRequestId ? 'request-item is-active' : 'request-item',
    onclick: () => state.onSelectRequest(req.id),
  });
  Object.assign(badge, { className: 'method-pill', textContent: req.method });
  Object.assign(title, { className: 'mono', textContent: req.name });
  runBtn.addEventListener('click', (ev) => ev.stopPropagation());
  row.append(badge, title, runBtn);

  return row;
}

/**
 * Renders the left toolbar group (`fileName`, Environment selector, `+ New Request`).
 */
function renderToolbarLeftGroup(state: HttpWorkbenchRenderState): HTMLElement {
  const left = document.createElement('div');
  const title = document.createElement('strong');

  Object.assign(left, { className: 'toolbar-group' });
  Object.assign(title, { className: 'mono', textContent: state.fileName });
  left.append(
    title,
    renderEnvSelect(state),
    createButton('+ New Request', 'btn', () => {
      const nextReq = createNewDefaultRequest(state.document.requests.length + 1);

      state.onSelectRequest(nextReq.id);
      state.onMutateDocument({
        ...state.document,
        requests: [...state.document.requests, nextReq],
      });
    }),
  );

  return left;
}

/**
 * Renders the Top Toolbar (`fileName`, Environment selector, `+ New Request`, `▶▶ Run All`, `Clear Cookies`, `Switch to Text`).
 */
function renderTopToolbar(state: HttpWorkbenchRenderState): HTMLElement {
  const bar = document.createElement('header');
  const right = document.createElement('div');

  Object.assign(bar, { className: 'toolbar' });
  Object.assign(right, { className: 'toolbar-group' });
  right.append(
    createButton('▶▶ Run All', 'btn btn-primary', () => state.onRunAll()),
    createButton('Clear Cookies', 'btn', () => state.onClearCookies()),
    createButton('Switch to Text', 'btn', () => state.onSwitchToText()),
  );
  bar.append(renderToolbarLeftGroup(state), right);

  return bar;
}

/**
 * Ensures at least `['default']` is returned for environment options.
 */
function resolveEnvList(environments: readonly string[]): readonly string[] {
  return environments.length > 0 ? environments : ['default'];
}

/**
 * Resolves the currently selected `HttpRequestBlock` or falls back to the first request.
 */
function resolveSelectedRequest(state: HttpWorkbenchRenderState): HttpRequestBlock | undefined {
  const found = state.document.requests.find((r) => r.id === state.selectedRequestId);

  return found ?? state.document.requests[0];
}

/**
 * Updates a single `HttpRequestBlock` inside `doc` and invokes `onMutateDocument`.
 */
function updateRequestInDoc(
  doc: HttpDocumentModel,
  updated: HttpRequestBlock,
  onMutateDocument: (next: HttpDocumentModel) => void,
): void {
  const requests = doc.requests.map((r) => (r.id === updated.id ? updated : r));

  onMutateDocument({ ...doc, requests });
}

/**
 * Renders the complete HTTP Client Workbench into `root`.
 *
 * @param root - Root container element (`#app`).
 * @param state - Full workbench state and action callbacks.
 *
 * @example
 * ```ts
 * renderHttpWorkbench(document.getElementById('app')!, state);
 * ```
 */
export function renderHttpWorkbench(root: HTMLElement, state: HttpWorkbenchRenderState): void {
  const grid = document.createElement('div');

  root.replaceChildren();
  grid.className = 'workbench';
  grid.append(
    renderSidebarPane(state),
    renderCenterColumn(state),
    renderResponsePane(
      {
        activeResultId: state.activeResultId,
        activeSubTab: state.activeResponseTab,
        isRunning: state.isRunning,
        onSelectResultId: state.onSelectResultId,
        onSelectSubTab: state.onSelectResponseTab,
        results: state.results,
      },
      state.document.requests,
    ),
  );
  root.append(renderTopToolbar(state), grid);
}

/**
 * State and event callbacks passed to `renderHttpWorkbench`.
 */
export interface HttpWorkbenchRenderState {
  /** Currently active environment name (`dev`, `prod`, etc.). */
  activeEnvironment: string | null;
  /** Currently selected sub-tab in the Request Inspector. */
  activeInspectorTab: HttpInspectorTabId;
  /** Currently selected response sub-tab. */
  activeResponseTab: HttpResponseSubTab;
  /** Currently selected request ID in the batch response viewer. */
  activeResultId: string | null;
  /** Parsed `.http` document model. */
  document: HttpDocumentModel;
  /** Available environment names from `http-client.env.json`. */
  environments: readonly string[];
  /** Display name of the `.http` file. */
  fileName: string;
  /** Whether a request execution is currently in flight. */
  isRunning: boolean;
  /** Callback invoked when the user clicks `Clear Cookies`. */
  onClearCookies: () => void;
  /** Callback invoked whenever any part of the `.http` document is edited. */
  onMutateDocument: (next: HttpDocumentModel) => void;
  /** Callback invoked when the user clicks `▶▶ Run All`. */
  onRunAll: () => void;
  /** Callback invoked when the user clicks `▶ Send` for a specific request. */
  onRunRequest: (requestId: string) => void;
  /** Callback invoked when the user picks an environment from the dropdown. */
  onSelectEnvironment: (envName: string) => void;
  /** Callback invoked when the user switches Request Inspector sub-tabs. */
  onSelectInspectorTab: (tab: HttpInspectorTabId) => void;
  /** Callback invoked when the user clicks a request in the Left Sidebar. */
  onSelectRequest: (requestId: string) => void;
  /** Callback invoked when the user switches Response Pane sub-tabs. */
  onSelectResponseTab: (tab: HttpResponseSubTab) => void;
  /** Callback invoked when the user selects a batch result pill. */
  onSelectResultId: (requestId: string) => void;
  /** Callback invoked when the user clicks `Switch to Text`. */
  onSwitchToText: () => void;
  /** Execution results from the latest run. */
  results: readonly HttpResponseSnapshot[];
  /** Currently selected request ID in the Left Sidebar. */
  selectedRequestId: string | null;
}
