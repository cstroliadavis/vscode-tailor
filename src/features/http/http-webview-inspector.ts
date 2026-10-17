import {
  HTTP_METHOD_SUGGESTIONS,
  getKnownHeaderNames,
  getSuggestionsForHeader,
} from './http-catalog.ts';
import { buildUrlWithParams } from './http-decomposition.ts';
import type { HttpKeyValueRow, HttpRequestBlock } from './http-types.ts';
import {
  renderAuthTab,
  renderBodyTab,
  renderTestsAndAssertionsTab,
} from './http-webview-subtabs.ts';
import { createButton, createComboBoxInput, renderKeyValueTable } from './http-webview-tables.ts';

/**
 * Builds the sub-tab definitions (`Variables`, `Params`, `Headers`, `Cookies`, `Auth`, `Body`, `Tests`) for `req`.
 */
function buildInspectorTabDefinitions(
  req: HttpRequestBlock,
  variablesCount: number,
): { id: HttpInspectorTabId; label: string }[] {
  return [
    { id: 'variables', label: `Variables (${variablesCount})` },
    { id: 'params', label: `Params (${req.params.length})` },
    { id: 'headers', label: `Headers (${req.headers.length})` },
    { id: 'cookies', label: `Cookies (${req.cookies.length})` },
    { id: 'auth', label: `Auth (${req.auth.scheme})` },
    { id: 'body', label: 'Body' },
    { id: 'tests', label: `Tests (${req.assertions.length})` },
  ];
}

/**
 * Creates the popup `.method-menu` element populated with all `HTTP_METHOD_SUGGESTIONS`.
 */
function createMethodMenuElement(
  currentMethod: string,
  onSelect: (verb: string) => void,
): HTMLElement {
  const menu = document.createElement('div');

  Object.assign(menu, { className: 'method-menu' });
  menu.append(
    ...HTTP_METHOD_SUGGESTIONS.map((verb) =>
      createMethodOptionItem(verb, currentMethod, (picked) => {
        menu.classList.remove('is-open');
        onSelect(picked);
      }),
    ),
  );

  return menu;
}

/**
 * Creates a single clickable method option item inside the unfiltered method dropdown menu.
 */
function createMethodOptionItem(
  methodVerb: string,
  currentMethod: string,
  onSelect: (verb: string) => void,
): HTMLElement {
  const item = document.createElement('div');

  Object.assign(item, {
    className:
      methodVerb === currentMethod.toUpperCase()
        ? 'method-option mono is-selected'
        : 'method-option mono',
    textContent: methodVerb,
  });
  item.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    onSelect(methodVerb);
  });

  return item;
}

/**
 * Renders the request title header and sub-tab bar for the Request Inspector.
 */
function renderInspectorHeaderAndTabs(
  req: HttpRequestBlock,
  props: RequestInspectorProps,
): [HTMLElement, HTMLElement] {
  const header = document.createElement('div');
  const nameInput = createComboBoxInput(req.name, 'Request Name (# @name)');
  const tabBar = document.createElement('div');

  header.className = 'pane-header';
  nameInput.style.flex = '1';
  nameInput.addEventListener('change', () => props.onMutate({ ...req, name: nameInput.value }));
  header.appendChild(nameInput);
  tabBar.className = 'tab-bar';
  buildInspectorTabDefinitions(req, props.variables.length).forEach((t) => {
    const cls = t.id === props.activeTab ? 'tab-btn is-active' : 'tab-btn';

    tabBar.appendChild(createButton(t.label, cls, () => props.onSelectTab(t.id)));
  });

  return [header, tabBar];
}

/**
 * Renders the active sub-tab content for the selected `HttpRequestBlock`.
 */
function renderInspectorTabContent(
  req: HttpRequestBlock,
  props: RequestInspectorProps,
): HTMLElement {
  if (props.activeTab === 'params') {
    return renderKeyValueTable({
      idPrefix: 'param',
      keyPlaceholder: 'Parameter',
      onChange: (params) =>
        props.onMutate({ ...req, params, url: buildUrlWithParams(req.url, params) }),
      rows: req.params,
      valuePlaceholder: 'Value or {{variable}}',
    });
  }

  if (props.activeTab === 'headers') {
    return renderKeyValueTable({
      getValueSuggestions: getSuggestionsForHeader,
      idPrefix: 'hdr',
      keyDatalistId: 'http-known-headers',
      keyPlaceholder: 'Header',
      keySuggestions: getKnownHeaderNames(),
      onChange: (headers) => props.onMutate({ ...req, headers }),
      rows: req.headers,
      valuePlaceholder: 'Header value or {{variable}}',
    });
  }

  return renderSecondaryInspectorTab(req, props);
}

/**
 * Renders the Method combo-box, URL input, and `▶ Send` button row.
 */
function renderMethodAndUrlBar(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
  onRunRequest: (requestId: string) => void,
): HTMLElement {
  const bar = document.createElement('div');
  const methodCombo = renderMethodComboBox(req, onMutate);
  const urlInput = createComboBoxInput(req.url, 'https://api.example.com/v1/resource?key={{val}}');
  const sendBtn = createButton('▶ Send', 'btn btn-primary', () => onRunRequest(req.id));

  bar.className = 'url-bar';
  urlInput.addEventListener('change', () => onMutate({ ...req, url: urlInput.value.trim() }));
  bar.append(methodCombo, urlInput, sendBtn);

  return bar;
}

/**
 * Renders an unfiltered editable HTTP Method combo-box with a full-list dropdown button.
 */
function renderMethodComboBox(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  const input = createComboBoxInput(req.method, 'Method');
  const menu = createMethodMenuElement(req.method, (picked) =>
    onMutate({ ...req, method: picked }),
  );
  const toggleBtn = createButton('▾', 'method-dropdown-btn', () =>
    menu.classList.toggle('is-open'),
  );

  Object.assign(wrap, { className: 'method-combobox' });
  Object.assign(input, {
    onblur: () => menu.classList.remove('is-open'),
    onchange: () =>
      onMutate({
        ...req,
        method: input.value.trim().length > 0 ? input.value.trim().toUpperCase() : 'GET',
      }),
    onfocus: () => menu.classList.add('is-open'),
  });
  toggleBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
  wrap.append(input, toggleBtn, menu);

  return wrap;
}

/**
 * Renders `variables`, `cookies`, `auth`, `body`, or `tests` inspector sub-tabs.
 */
function renderSecondaryInspectorTab(
  req: HttpRequestBlock,
  props: RequestInspectorProps,
): HTMLElement {
  const renderers: Record<string, () => HTMLElement> = {
    auth: () => renderAuthTab(req, props.onMutate),
    body: () => renderBodyTab(req, props.onMutate),
    cookies: () =>
      renderKeyValueTable({
        idPrefix: 'cookie',
        keyPlaceholder: 'Cookie Name',
        onChange: (cookies) => props.onMutate({ ...req, cookies }),
        rows: req.cookies,
        valuePlaceholder: 'Cookie value or {{variable}}',
      }),
    variables: () =>
      renderKeyValueTable({
        idPrefix: 'var',
        keyPlaceholder: 'Variable (@name)',
        onChange: (variables) => props.onMutateVariables(variables),
        rows: props.variables,
        valuePlaceholder: 'Value, {{$secret key}}, or {{$keychain svc acct}}',
      }),
  };

  return (renderers[props.activeTab] ?? (() => renderTestsAndAssertionsTab(req, props.onMutate)))();
}

/**
 * Renders the Center Request Inspector Pane for the currently selected `HttpRequestBlock`.
 *
 * @param props - Inspector state and callbacks.
 * @returns Configured `HTMLElement` representing the center inspector pane.
 *
 * @example
 * ```ts
 * const pane = renderRequestInspectorPane(props);
 * ```
 */
export function renderRequestInspectorPane(props: RequestInspectorProps): HTMLElement {
  const pane = document.createElement('section');

  pane.className = 'inspector-pane';

  if (!props.request) return pane;

  const [header, tabBar] = renderInspectorHeaderAndTabs(props.request, props);
  const content = document.createElement('div');

  content.className = 'pane-content';
  content.appendChild(renderInspectorTabContent(props.request, props));
  pane.append(
    header,
    renderMethodAndUrlBar(props.request, props.onMutate, props.onRunRequest),
    tabBar,
    content,
  );

  return pane;
}

/**
 * Available sub-tabs in the Center Request Inspector.
 */
export type HttpInspectorTabId =
  'auth' | 'body' | 'cookies' | 'headers' | 'params' | 'tests' | 'variables';

/**
 * Properties required by `renderRequestInspectorPane`.
 */
export interface RequestInspectorProps {
  /**
   * Currently active sub-tab identifier.
   */
  activeTab: HttpInspectorTabId;

  /**
   * Callback invoked when the user edits any property of the active request block.
   */
  onMutate: (nextRequest: HttpRequestBlock) => void;

  /**
   * Callback invoked when the user edits in-file `@variable = value` rows in the Variables tab.
   */
  onMutateVariables: (nextVariables: HttpKeyValueRow[]) => void;

  /**
   * Callback invoked when the user clicks `▶ Send`.
   */
  onRunRequest: (requestId: string) => void;

  /**
   * Callback invoked when the user switches sub-tabs.
   */
  onSelectTab: (tab: HttpInspectorTabId) => void;

  /**
   * Currently selected `HttpRequestBlock`, or `undefined` if the file has no requests.
   */
  request: HttpRequestBlock | undefined;

  /**
   * In-file `@variable = value` rows declared in the `.http` document.
   */
  variables: HttpKeyValueRow[];
}
