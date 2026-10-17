import type {
  HttpAssertionResult,
  HttpKeyValueRow,
  HttpRequestBlock,
  HttpResponseSnapshot,
} from './http-types.ts';
import { createButton } from './http-webview-tables.ts';

const RESPONSE_SUBTABS: readonly { id: HttpResponseSubTab; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'tests', label: 'Tests' },
];

/**
 * Formats byte size as B or KB.
 */
function formatByteSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Pretty-prints JSON response body if valid JSON; otherwise returns raw body.
 */
function formatResponseBodyText(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * Formats the HTTP status badge text (`200 OK` or `ERROR`).
 */
function formatStatusBadgeText(res: HttpResponseSnapshot): string {
  return res.status > 0 ? `${res.status} ${res.statusText}` : 'ERROR';
}

/**
 * Formats the short status tag (`200` or `ERR`) for batch pills.
 */
function formatStatusShortTag(status: number): string {
  return status > 0 ? String(status) : 'ERR';
}

/**
 * Formats the label text for a single test result.
 */
function formatTestResultLabel(tr: HttpAssertionResult): string {
  return tr.message ? `${tr.label} — ${tr.message}` : tr.label;
}

/**
 * Checks whether an HTTP status code is in the 2xx–3xx success range.
 */
function isHttpSuccessStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

/**
 * Renders the batch result selector bar when multiple requests were executed.
 */
function renderBatchResultPills(
  ctx: HttpResponsePaneContext,
  requestsById: Map<string, HttpRequestBlock>,
): HTMLElement {
  const bar = document.createElement('div');

  bar.className = 'batch-pills';

  for (const res of ctx.results) {
    bar.appendChild(renderSingleBatchPill(res, ctx, requestsById.get(res.requestId)));
  }

  return bar;
}

/**
 * Renders an empty placeholder state when no execution result is available.
 */
function renderEmptyResponseState(isRunning: boolean): HTMLElement {
  const empty = document.createElement('div');

  empty.className = 'pane-content';
  empty.textContent = isRunning
    ? 'Executing HTTP request(s)...'
    : 'Click ▶ Send or ▶▶ Run All to inspect the HTTP response and test results.';

  return empty;
}

/**
 * Renders a two-column key/value table for read-only headers or cookies.
 */
function renderReadOnlyPairsList(rows: readonly HttpKeyValueRow[]): HTMLElement {
  const box = document.createElement('div');

  Object.assign(box.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

  for (const row of rows) {
    box.appendChild(renderSinglePairRow(row.key, row.value));
  }

  return box;
}

/**
 * Renders the active response sub-tab content (`body`, `headers`, `cookies`, or `tests`).
 */
function renderResponseActiveTab(
  res: HttpResponseSnapshot,
  activeTab: HttpResponseSubTab,
): HTMLElement {
  const renderers = new Map<HttpResponseSubTab, (r: HttpResponseSnapshot) => HTMLElement>([
    ['body', renderResponseBodyBox],
    ['cookies', (r) => renderReadOnlyPairsList(r.cookies)],
    ['headers', (r) => renderReadOnlyPairsList(r.headers)],
    ['tests', (r) => renderTestResultsList(r.assertionResults)],
  ]);
  const fn = renderers.get(activeTab) ?? renderResponseBodyBox;

  return fn(res);
}

/**
 * Renders the formatted response body `<pre>` block (including any error banner).
 */
function renderResponseBodyBox(res: HttpResponseSnapshot): HTMLElement {
  const pre = document.createElement('pre');

  pre.className = 'response-body';
  pre.textContent = res.error
    ? `Request Error: ${res.error}\n\n${res.body}`
    : formatResponseBodyText(res.body);

  return pre;
}

/**
 * Renders the `.pane-content` wrapper containing the active response sub-tab.
 */
function renderResponseBodyWrapper(
  res: HttpResponseSnapshot,
  activeTab: HttpResponseSubTab,
): HTMLElement {
  const bodyWrap = document.createElement('div');

  bodyWrap.className = 'pane-content';
  bodyWrap.appendChild(renderResponseActiveTab(res, activeTab));

  return bodyWrap;
}

/**
 * Renders the response status badge, duration, and byte size summary header.
 */
function renderResponseMetaBar(res: HttpResponseSnapshot): HTMLElement {
  const meta = document.createElement('div');
  const pill = document.createElement('span');
  const stats = document.createElement('span');

  meta.className = 'pane-header';
  pill.className = isHttpSuccessStatus(res.status)
    ? 'status-pill status-ok'
    : 'status-pill status-err';
  pill.textContent = formatStatusBadgeText(res);
  Object.assign(stats, {
    className: 'mono',
    textContent: `${res.durationMs} ms • ${formatByteSize(res.sizeBytes)}`,
  });
  meta.append(pill, stats);

  return meta;
}

/**
 * Renders the sub-tab navigation strip for the Response Pane.
 */
function renderResponseSubTabBar(
  res: HttpResponseSnapshot,
  ctx: HttpResponsePaneContext,
): HTMLElement {
  const bar = document.createElement('div');

  bar.className = 'tab-bar';

  for (const tab of RESPONSE_SUBTABS) {
    const label = resolveResponseTabLabel(tab, res);
    const btn = createButton(
      label,
      ctx.activeSubTab === tab.id ? 'tab-btn is-active' : 'tab-btn',
      () => ctx.onSelectSubTab(tab.id),
    );

    bar.appendChild(btn);
  }

  return bar;
}

/**
 * Renders a single pill in the batch result selector bar.
 */
function renderSingleBatchPill(
  res: HttpResponseSnapshot,
  ctx: HttpResponsePaneContext,
  req: HttpRequestBlock | undefined,
): HTMLElement {
  const pill = document.createElement('span');
  const statusTag = formatStatusShortTag(res.status);

  pill.className = res.requestId === ctx.activeResultId ? 'batch-pill is-active' : 'batch-pill';
  pill.textContent = `${resolveRequestLabel(req, res.requestName)} (${statusTag})`;
  pill.style.borderLeft = isHttpSuccessStatus(res.status)
    ? '3px solid #2ea043'
    : '3px solid #f85149';
  pill.addEventListener('click', () => ctx.onSelectResultId(res.requestId));

  return pill;
}

/**
 * Renders a single read-only key/value pair row.
 */
function renderSinglePairRow(key: string, val: string): HTMLElement {
  const row = document.createElement('div');
  const keyEl = document.createElement('span');
  const valEl = document.createElement('span');

  Object.assign(row.style, { display: 'grid', gap: '8px', gridTemplateColumns: '180px 1fr' });
  Object.assign(keyEl, { className: 'mono', textContent: key });
  Object.assign(valEl, { className: 'mono', textContent: val });
  keyEl.style.fontWeight = '600';
  valEl.style.wordBreak = 'break-all';
  row.append(keyEl, valEl);

  return row;
}

/**
 * Renders a single test/assertion result row with `[PASS]` or `[FAIL]` badge.
 */
function renderSingleTestResultRow(tr: HttpAssertionResult): HTMLElement {
  const row = document.createElement('div');
  const badge = document.createElement('span');
  const label = document.createElement('span');

  row.className = tr.passed ? 'test-row is-pass' : 'test-row is-fail';
  badge.className = 'mono';
  badge.style.fontWeight = '700';
  badge.textContent = tr.passed ? 'PASS' : 'FAIL';
  label.textContent = formatTestResultLabel(tr);
  row.append(badge, label);

  return row;
}

/**
 * Renders the list of declarative and script test results.
 */
function renderTestResultsList(testResults: readonly HttpAssertionResult[]): HTMLElement {
  const box = document.createElement('div');

  Object.assign(box.style, { display: 'flex', flexDirection: 'column', gap: '4px' });

  if (testResults.length === 0) {
    box.textContent = 'No assertions or client.test() blocks executed for this request.';

    return box;
  }

  for (const tr of testResults) {
    box.appendChild(renderSingleTestResultRow(tr));
  }

  return box;
}

/**
 * Resolves the active `HttpResponseSnapshot` from `ctx`.
 */
function resolveActiveResult(ctx: HttpResponsePaneContext): HttpResponseSnapshot | undefined {
  const found = ctx.results.find((r) => r.requestId === ctx.activeResultId);

  return found ?? ctx.results[0];
}

/**
 * Resolves a human-readable label for a request in the batch selector bar.
 */
function resolveRequestLabel(req: HttpRequestBlock | undefined, fallbackName: string): string {
  return req ? req.name : fallbackName;
}

/**
 * Computes the sub-tab button label with counts for Headers, Cookies, and Tests.
 */
function resolveResponseTabLabel(
  tab: { id: HttpResponseSubTab; label: string },
  res: HttpResponseSnapshot,
): string {
  const passed = res.assertionResults.filter((t) => t.passed).length;
  const labels = new Map<HttpResponseSubTab, string>([
    ['body', tab.label],
    ['cookies', `Cookies (${res.cookies.length})`],
    ['headers', `Headers (${res.headers.length})`],
    ['tests', `Tests (${passed}/${res.assertionResults.length})`],
  ]);

  return labels.get(tab.id) ?? tab.label;
}

/**
 * Renders the right-hand Response & Batch Results Pane.
 *
 * @param ctx - Current execution results and UI state for the response pane.
 * @param requests - Request blocks from the parsed document (for batch pill labels).
 * @returns Configured `HTMLElement` representing the response pane.
 *
 * @example
 * ```ts
 * const pane = renderResponsePane(ctx, doc.requests);
 * ```
 */
export function renderResponsePane(
  ctx: HttpResponsePaneContext,
  requests: readonly HttpRequestBlock[],
): HTMLElement {
  const pane = document.createElement('aside');
  const activeRes = resolveActiveResult(ctx);

  pane.className = 'response-pane';

  if (!activeRes) {
    pane.appendChild(renderEmptyResponseState(ctx.isRunning));

    return pane;
  }

  if (ctx.results.length > 1) {
    pane.appendChild(renderBatchResultPills(ctx, new Map(requests.map((r) => [r.id, r]))));
  }

  pane.append(
    renderResponseMetaBar(activeRes),
    renderResponseSubTabBar(activeRes, ctx),
    renderResponseBodyWrapper(activeRes, ctx.activeSubTab),
  );

  return pane;
}

/**
 * Sub-tabs available in the Right Response Pane.
 */
export type HttpResponseSubTab = 'body' | 'cookies' | 'headers' | 'tests';

/**
 * Context passed to `renderResponsePane`.
 */
export interface HttpResponsePaneContext {
  /** Currently selected request ID in the response viewer. */
  activeResultId: string | null;
  /** Currently selected response sub-tab. */
  activeSubTab: HttpResponseSubTab;
  /** Whether a request or batch execution is currently in flight. */
  isRunning: boolean;
  /** Callback invoked when the user clicks a batch result pill. */
  onSelectResultId: (requestId: string) => void;
  /** Callback invoked when the user clicks a response sub-tab. */
  onSelectSubTab: (subTab: HttpResponseSubTab) => void;
  /** All execution results from the latest run. */
  results: readonly HttpResponseSnapshot[];
}
