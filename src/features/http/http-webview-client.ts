import type {
  HttpDocumentModel,
  HttpExtensionToWebviewMessage,
  HttpResponseSnapshot,
  HttpWebviewToExtensionMessage,
} from './http-types.ts';
import { renderHttpWorkbench } from './http-webview-dom.ts';
import type { HttpInspectorTabId } from './http-webview-inspector.ts';
import type { HttpResponseSubTab } from './http-webview-response.ts';

declare function acquireVsCodeApi(): {
  postMessage(message: HttpWebviewToExtensionMessage): void;
};

/**
 * Applies an incoming `executionResults` message to the local client state.
 */
function applyExecutionResultsMessage(
  state: HttpClientState,
  results: readonly HttpResponseSnapshot[],
): void {
  const last = results.at(-1);

  state.isRunning = false;
  state.results = results;
  state.activeResultId = last ? last.requestId : null;
}

/**
 * Applies an incoming `syncDocument` message to the local client state.
 */
function applySyncDocumentMessage(
  state: HttpClientState,
  msg: Extract<HttpExtensionToWebviewMessage, { type: 'syncDocument' }>,
): void {
  Object.assign(state, {
    activeEnvironment: msg.activeEnv,
    document: msg.model,
    environments: msg.availableEnvs,
    fileName: msg.fileName,
  });

  if (!state.selectedRequestId && msg.model.requests.length > 0) {
    state.selectedRequestId = msg.model.requests[0]!.id;
  }
}

/**
 * Creates the initial `HttpClientState` before the first extension sync message arrives.
 */
function createInitialClientState(): HttpClientState {
  return {
    activeEnvironment: null,
    activeInspectorTab: 'params',
    activeResponseTab: 'body',
    activeResultId: null,
    document: { requests: [], variables: [] },
    environments: ['default'],
    fileName: 'Requests.http',
    isRunning: false,
    results: [],
    selectedRequestId: null,
  };
}

/**
 * Handles an incoming `HttpExtensionToWebviewMessage` from the extension host.
 */
function handleExtensionMessage(
  state: HttpClientState,
  msg: HttpExtensionToWebviewMessage,
  rerender: () => void,
): void {
  if (msg.type === 'syncDocument') {
    applySyncDocumentMessage(state, msg);
  } else if (msg.type === 'executionState') {
    state.isRunning = msg.isRunning;
  } else {
    applyExecutionResultsMessage(state, msg.results);
  }

  rerender();
}

/**
 * Mounts and renders the HTTP Client Workbench inside `#app`.
 */
function mountWorkbench(
  container: HTMLElement | null,
  state: HttpClientState,
  postMessage: (msg: HttpWebviewToExtensionMessage) => void,
): void {
  if (!container) return;

  const rerender = (): void => mountWorkbench(container, state, postMessage);

  renderHttpWorkbench(container, {
    ...state,
    onClearCookies: () => postMessage({ type: 'clearCookieJar' }),
    onMutateDocument(nextDoc) {
      state.document = nextDoc;
      postMessage({ model: nextDoc, type: 'updateDocument' });
      rerender();
    },
    onRunAll: () => postMessage({ type: 'runAllRequests' }),
    onRunRequest: (requestId) => postMessage({ requestId, type: 'runRequest' }),
    onSelectEnvironment(envName) {
      state.activeEnvironment = envName;
      postMessage({ envName, type: 'selectEnvironment' });
      rerender();
    },
    onSelectInspectorTab(tab) {
      state.activeInspectorTab = tab;
      rerender();
    },
    onSelectRequest(requestId) {
      state.selectedRequestId = requestId;
      rerender();
    },
    onSelectResponseTab(tab) {
      state.activeResponseTab = tab;
      rerender();
    },
    onSelectResultId(requestId) {
      state.activeResultId = requestId;
      rerender();
    },
    onSwitchToText: () => postMessage({ type: 'switchToText' }),
  });
}

/**
 * Initializes the HTTP Client Workbench Webview and connects message listeners to VS Code.
 *
 * @example
 * ```ts
 * startHttpWebviewClient();
 * ```
 */
export function startHttpWebviewClient(): void {
  const vscodeApi = acquireVsCodeApi();
  const _ = {
    container: document.getElementById('app'),
    state: createInitialClientState(),
  };
  const postMessage = (msg: HttpWebviewToExtensionMessage): void => vscodeApi.postMessage(msg);
  const rerender = (): void => mountWorkbench(_.container, _.state, postMessage);

  window.addEventListener('message', (event: MessageEvent<HttpExtensionToWebviewMessage>) => {
    handleExtensionMessage(_.state, event.data, rerender);
  });
  rerender();
  postMessage({ type: 'ready' });
}

/**
 * Mutable client state held inside the HTTP Workbench Webview closure.
 */
interface HttpClientState {
  activeEnvironment: string | null;
  activeInspectorTab: HttpInspectorTabId;
  activeResponseTab: HttpResponseSubTab;
  activeResultId: string | null;
  document: HttpDocumentModel;
  environments: readonly string[];
  fileName: string;
  isRunning: boolean;
  results: readonly HttpResponseSnapshot[];
  selectedRequestId: string | null;
}

if (typeof window !== 'undefined') {
  startHttpWebviewClient();
}
