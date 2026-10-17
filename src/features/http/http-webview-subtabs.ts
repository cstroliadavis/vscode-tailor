import { applyAuthToHeadersAndParams, buildUrlWithParams } from './http-decomposition.ts';
import type {
  HttpAssertionOperator,
  HttpAssertionRule,
  HttpAuthConfig,
  HttpAuthScheme,
  HttpRequestBlock,
} from './http-types.ts';
import { createButton, createComboBoxInput, createDatalistElement } from './http-webview-tables.ts';

const ASSERT_OPERATORS: readonly HttpAssertionOperator[] = [
  '==',
  '!=',
  'contains',
  'matches',
  'exists',
  '<',
  '>',
];

const ASSERT_TARGETS = [
  'status',
  'duration',
  'header.Content-Type',
  'header.Cache-Control',
  'body',
  'body.$.id',
  'body.$.token',
];

/**
 * Applies an updated `HttpAuthConfig` to `req` and synchronizes its headers, params, and URL.
 */
function applyAuthChange(
  req: HttpRequestBlock,
  nextAuth: HttpAuthConfig,
  onMutate: (next: HttpRequestBlock) => void,
): void {
  const { headers, params } = applyAuthToHeadersAndParams(nextAuth, req.headers, req.params);
  const url = buildUrlWithParams(req.url, params);

  onMutate({ ...req, auth: nextAuth, headers, params, url });
}

/**
 * Creates the delete (`×`) button for a declarative assertion row.
 */
function createDeleteAssertionButton(ctx: AssertionRowContext): HTMLButtonElement {
  return createButton('×', 'btn icon-btn', () => {
    const next = ctx.req.assertions.filter((_, idx) => idx !== ctx.index);

    ctx.onMutate({ ...ctx.req, assertions: next });
  });
}

/**
 * Creates a `<select>` element populated with string `<option>` values.
 */
function createSelectElement(
  options: readonly string[],
  selectedValue: string,
  onChange: (val: string) => void,
): HTMLSelectElement {
  const select = document.createElement('select');

  select.className = 'select-field mono';

  for (const optVal of options) {
    const opt = document.createElement('option');

    opt.value = optVal;
    opt.textContent = optVal;
    opt.selected = optVal === selectedValue;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => onChange(select.value));

  return select;
}

/**
 * Formats `req.body` as pretty-printed 2-space JSON if valid.
 */
function formatRequestJsonBody(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): void {
  try {
    const formatted = JSON.stringify(JSON.parse(req.body), null, 2);

    onMutate({ ...req, body: formatted });
  } catch {
    // Ignore invalid JSON when Format JSON is clicked
  }
}

/**
 * Renders the API Key fields (`Header`/`Query` selector, Key Name, and Key Value).
 */
function renderApiKeyFields(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const box = document.createElement('div');
  const locSelect = createSelectElement(
    ['header', 'query'],
    resolveStr(req.auth.apiKeyIn, 'header'),
    (val) => applyAuthChange(req, { ...req.auth, apiKeyIn: val as 'header' | 'query' }, onMutate),
  );
  const nameIn = createComboBoxInput(
    resolveStr(req.auth.apiKeyName, 'X-API-Key'),
    'Header or Param Name',
  );
  const valIn = createComboBoxInput(
    resolveStr(req.auth.apiKeyValue),
    '{{$secret api_key}} or {{$keychain svc acct}}',
  );

  Object.assign(box.style, { display: 'grid', gap: '8px', gridTemplateColumns: '110px 1fr 1fr' });
  nameIn.addEventListener('change', () =>
    applyAuthChange(req, { ...req.auth, apiKeyName: nameIn.value }, onMutate),
  );
  valIn.addEventListener('change', () =>
    applyAuthChange(req, { ...req.auth, apiKeyValue: valIn.value }, onMutate),
  );
  box.append(locSelect, nameIn, valIn);

  return box;
}

/**
 * Renders a single row in the declarative `# @assert` visual assertion builder.
 */
function renderAssertionRuleRow(ctx: AssertionRowContext): HTMLElement {
  const rule = ctx.req.assertions[ctx.index]!;
  const row = document.createElement('div');
  const targetInput = createComboBoxInput(
    rule.target,
    'status | header.X | body.$.id',
    'http-assert-targets',
  );
  const expInput = createComboBoxInput(rule.expected, 'Expected value');

  row.className = 'assert-row';
  expInput.disabled = rule.operator === 'exists';
  targetInput.addEventListener('change', () =>
    updateAssertionAt(ctx, { target: targetInput.value }),
  );
  expInput.addEventListener('change', () => updateAssertionAt(ctx, { expected: expInput.value }));
  row.append(
    targetInput,
    createSelectElement(ASSERT_OPERATORS, rule.operator, (op) =>
      updateAssertionAt(ctx, { operator: op as HttpAssertionOperator }),
    ),
    expInput,
    createDeleteAssertionButton(ctx),
  );

  return row;
}

/**
 * Renders the scheme-specific inputs for the Auth tab (`bearer`, `basic`, or `apiKey`).
 */
function renderAuthSchemeBody(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement | null {
  const renderers = new Map<
    HttpAuthScheme,
    (r: HttpRequestBlock, m: (n: HttpRequestBlock) => void) => HTMLElement
  >([
    ['apiKey', renderApiKeyFields],
    ['basic', renderBasicAuthFields],
    ['bearer', renderBearerTokenField],
  ]);
  const fn = renderers.get(req.auth.scheme);

  return fn ? fn(req, onMutate) : null;
}

/**
 * Renders the Username and Password fields for `scheme === 'basic'`.
 */
function renderBasicAuthFields(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const box = document.createElement('div');
  const userIn = createComboBoxInput(resolveStr(req.auth.basicUsername), 'Username or {{user}}');
  const passIn = createComboBoxInput(
    resolveStr(req.auth.basicPassword),
    'Password or {{$secret pwd}}',
  );

  Object.assign(box.style, { display: 'grid', gap: '8px', gridTemplateColumns: '1fr 1fr' });
  userIn.addEventListener('change', () =>
    applyAuthChange(req, { ...req.auth, basicUsername: userIn.value }, onMutate),
  );
  passIn.addEventListener('change', () =>
    applyAuthChange(req, { ...req.auth, basicPassword: passIn.value }, onMutate),
  );
  box.append(userIn, passIn);

  return box;
}

/**
 * Renders the Bearer Token input field for `scheme === 'bearer'`.
 */
function renderBearerTokenField(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const tokenIn = createComboBoxInput(
    resolveStr(req.auth.bearerToken),
    'Bearer Token (e.g. {{api_token}} or {{$keychain my-api token}})',
  );

  tokenIn.addEventListener('change', () =>
    applyAuthChange(req, { ...req.auth, bearerToken: tokenIn.value }, onMutate),
  );

  return tokenIn;
}

/**
 * Renders the external file reference row and `Format JSON` button for the Body tab.
 */
function renderBodyToolbarRow(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const topRow = document.createElement('div');
  const fileRefInput = createComboBoxInput(
    resolveStr(req.bodyFileRef),
    'Optional external body file (< ./payload.json)',
  );

  topRow.className = 'toolbar-group';
  fileRefInput.style.flex = '1';
  fileRefInput.addEventListener('change', () => {
    const refVal = fileRefInput.value.trim();

    onMutate({ ...req, bodyFileRef: refVal.length > 0 ? refVal : undefined });
  });
  topRow.append(
    fileRefInput,
    createButton('Format JSON', 'btn', () => formatRequestJsonBody(req, onMutate)),
  );

  return topRow;
}

/**
 * Renders the `<textarea>` editor for the JetBrains `> {% ... %}` response handler script.
 */
function renderScriptEditor(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLTextAreaElement {
  const scriptArea = document.createElement('textarea');

  scriptArea.className = 'code-editor';
  scriptArea.placeholder =
    'JetBrains response handler script (> {% ... %})\nclient.test("status 200", () => {\n  client.assert(response.status === 200);\n  client.global.set("token", response.body.token);\n});';
  scriptArea.value = req.responseScript;
  scriptArea.addEventListener('change', () =>
    onMutate({ ...req, responseScript: scriptArea.value }),
  );

  return scriptArea;
}

/**
 * Coerces an optional string to `fallback`.
 */
function resolveStr(val: string | undefined, fallback = ''): string {
  return val ?? fallback;
}

/**
 * Updates a single assertion rule at `ctx.index` and triggers `ctx.onMutate`.
 */
function updateAssertionAt(ctx: AssertionRowContext, patch: Partial<HttpAssertionRule>): void {
  const next = [...ctx.req.assertions];

  next[ctx.index] = { ...ctx.req.assertions[ctx.index]!, ...patch };
  ctx.onMutate({ ...ctx.req, assertions: next });
}

/**
 * Renders the **Auth** sub-tab (`none`, `bearer`, `basic`, `apiKey`).
 *
 * @param req - Active HTTP request block.
 * @param onMutate - Callback invoked when auth fields are modified.
 * @returns Configured `HTMLElement` for the Auth tab.
 *
 * @example
 * ```ts
 * const el = renderAuthTab(req, onMutate);
 * ```
 */
export function renderAuthTab(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  const schemeSelect = createSelectElement(
    ['none', 'bearer', 'basic', 'apiKey'],
    req.auth.scheme,
    (scheme) => applyAuthChange(req, { ...req.auth, scheme: scheme as HttpAuthScheme }, onMutate),
  );
  const bodyEl = renderAuthSchemeBody(req, onMutate);

  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '10px' });
  wrap.appendChild(schemeSelect);

  if (bodyEl) {
    wrap.appendChild(bodyEl);
  }

  return wrap;
}

/**
 * Renders the **Body** sub-tab (supporting raw body text, `Format JSON`, and `< ./file.json` external reference).
 *
 * @param req - Active HTTP request block.
 * @param onMutate - Callback invoked when body fields are modified.
 * @returns Configured `HTMLElement` for the Body tab.
 *
 * @example
 * ```ts
 * const el = renderBodyTab(req, onMutate);
 * ```
 */
export function renderBodyTab(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  const textarea = document.createElement('textarea');

  Object.assign(wrap.style, { display: 'flex', flex: '1', flexDirection: 'column', gap: '8px' });
  textarea.className = 'code-editor';
  textarea.placeholder = 'Request body (JSON, XML, form data, or {{variables}})...';
  textarea.value = req.body;
  textarea.addEventListener('change', () => onMutate({ ...req, body: textarea.value }));
  wrap.append(renderBodyToolbarRow(req, onMutate), textarea);

  return wrap;
}

/**
 * Renders the **Tests & Assertions** sub-tab (visual `# @assert` builder + `> {% ... %}` script editor).
 *
 * @param req - Active HTTP request block.
 * @param onMutate - Callback invoked when assertions or scripts are modified.
 * @returns Configured `HTMLElement` for the Tests tab.
 *
 * @example
 * ```ts
 * const el = renderTestsAndAssertionsTab(req, onMutate);
 * ```
 */
export function renderTestsAndAssertionsTab(
  req: HttpRequestBlock,
  onMutate: (next: HttpRequestBlock) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  const addRuleBtn = createButton('+ Add Declarative Assertion (# @assert)', 'btn', () => {
    onMutate({
      ...req,
      assertions: [...req.assertions, { expected: '200', operator: '==', target: 'status' }],
    });
  });

  Object.assign(wrap.style, { display: 'flex', flex: '1', flexDirection: 'column', gap: '8px' });
  wrap.appendChild(createDatalistElement('http-assert-targets', ASSERT_TARGETS));
  req.assertions.forEach((_, index) =>
    wrap.appendChild(renderAssertionRuleRow({ index, onMutate, req })),
  );
  addRuleBtn.style.alignSelf = 'flex-start';
  wrap.append(addRuleBtn, renderScriptEditor(req, onMutate));

  return wrap;
}

/**
 * Context passed to `renderAssertionRuleRow` and `updateAssertionAt`.
 */
interface AssertionRowContext {
  index: number;
  onMutate: (next: HttpRequestBlock) => void;
  req: HttpRequestBlock;
}
