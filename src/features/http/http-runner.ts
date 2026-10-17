import { evaluateDeclarativeAssertions, executeResponseHandlerScript } from './http-assertions.ts';
import {
  buildUrlWithParams,
  parseSetCookieHeaders,
  serializeCookieHeader,
} from './http-decomposition.ts';
import type {
  HttpDocumentModel,
  HttpKeyValueRow,
  HttpRequestBlock,
  HttpResponseSnapshot,
} from './http-types.ts';
import type { HttpVariableResolutionContext } from './http-variable-resolver.ts';
import { resolveTemplateVariables } from './http-variable-resolver.ts';

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

/**
 * Attaches all assertions (`# @assert` and `> {% ... %}`) to a completed `HttpResponseSnapshot`.
 */
function attachEvaluatedAssertions(
  request: HttpRequestBlock,
  snapshot: HttpResponseSnapshot,
  globalVariables: Record<string, string>,
): HttpResponseSnapshot {
  const declarative = evaluateDeclarativeAssertions(request.assertions, snapshot);
  const scripted = executeResponseHandlerScript(request.responseScript, snapshot, globalVariables);

  return {
    ...snapshot,
    assertionResults: [...declarative, ...scripted],
  };
}

/**
 * Constructs a fallback `HttpResponseSnapshot` when a network or timeout error occurs.
 */
function buildErrorSnapshot(ctx: WireResponseContext, error: unknown): HttpResponseSnapshot {
  const msg = error instanceof Error ? error.message : String(error);

  return {
    assertionResults: [],
    body: msg,
    cookies: [],
    durationMs: ctx.durationMs,
    error: msg,
    headers: [],
    requestId: ctx.request.id,
    requestName: ctx.request.name,
    resolvedMethod: ctx.prepared.method,
    resolvedUrl: ctx.prepared.url,
    sizeBytes: Buffer.byteLength(msg, 'utf8'),
    status: 0,
    statusText: 'Network Error',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Builds the `RequestInit` options passed to `fetch`.
 */
function buildFetchRequestInit(
  prepared: PreparedWireRequest,
  options: HttpExecutionOptions,
): RequestInit {
  return {
    body: prepared.body,
    headers: prepared.headers,
    method: prepared.method,
    redirect: options.followRedirects === false ? 'manual' : 'follow',
    signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
  };
}

/**
 * Creates a normalized `HttpExecutionOptions` object with initialized `cookieJar` and `globalVariables`.
 */
function createNormalizedExecutionOptions(
  options: HttpExecutionOptions,
  fileVariables?: HttpKeyValueRow[],
): NormalizedExecutionState {
  const { cookieJar, cookieJarEnabled } = resolveCookieJarDefaults(options);
  const variableContext = resolveVariableContextDefaults(options.variableContext, fileVariables);

  return {
    cookieJar,
    cookieJarEnabled,
    globalVariables: variableContext.globalVariables!,
    options: { ...options, cookieJar, cookieJarEnabled, variableContext },
  };
}

/**
 * Extracts all `Set-Cookie` header strings from a `Headers` object.
 */
function extractSetCookieList(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();

  const single = headers.get('set-cookie');

  return single ? [single] : [];
}

/**
 * Invokes `readExternalFile` if provided and returns the file text or `''`.
 */
async function invokeExternalFileReader(
  relativePath: string,
  reader?: (path: string) => Promise<string | undefined>,
): Promise<string> {
  if (!reader) return '';

  return (await reader(relativePath)) ?? '';
}

/**
 * Checks whether a key/value row is enabled and has a non-empty key.
 */
function isActiveRow(row: HttpKeyValueRow): boolean {
  return row.enabled && row.key.trim().length > 0;
}

/**
 * Merges session `cookieJar` rows with explicit request `cookies` (request cookies override jar cookies).
 */
function mergeCookiesWithJar(
  requestCookies: HttpKeyValueRow[],
  state: NormalizedExecutionState,
): HttpKeyValueRow[] {
  if (!state.cookieJarEnabled) return requestCookies;

  const activePairs = [...state.cookieJar, ...requestCookies]
    .filter(isActiveRow)
    .map((row) => [row.key.trim(), row] as const);

  return [...new Map(activePairs).values()];
}

/**
 * Updates the mutable `cookieJar` array in-place with newly received `Set-Cookie` rows.
 */
function mergeResponseCookiesIntoJar(
  state: NormalizedExecutionState,
  responseCookies: HttpKeyValueRow[],
): void {
  if (!state.cookieJarEnabled) return;

  for (const incoming of responseCookies) {
    upsertCookieRow(state.cookieJar, incoming);
  }
}

/**
 * Reads a `fetch` `Response` into an `HttpResponseSnapshot`.
 */
async function parseFetchResponse(
  ctx: WireResponseContext,
  res: Response,
): Promise<HttpResponseSnapshot> {
  const body = await res.text();
  const headers: HttpKeyValueRow[] = [];

  res.headers.forEach((value, key) => {
    headers.push({ enabled: true, key, value });
  });

  return {
    assertionResults: [],
    body,
    cookies: parseSetCookieHeaders(extractSetCookieList(res.headers)),
    durationMs: ctx.durationMs,
    headers,
    requestId: ctx.request.id,
    requestName: ctx.request.name,
    resolvedMethod: ctx.prepared.method,
    resolvedUrl: ctx.prepared.url,
    sizeBytes: Buffer.byteLength(body, 'utf8'),
    status: res.status,
    statusText: res.statusText || String(res.status),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Resolves `cookieJar` and `cookieJarEnabled` defaults from `options`.
 */
function resolveCookieJarDefaults(options: HttpExecutionOptions): {
  cookieJar: HttpKeyValueRow[];
  cookieJarEnabled: boolean;
} {
  return {
    cookieJar: options.cookieJar ?? [],
    cookieJarEnabled: options.cookieJarEnabled ?? true,
  };
}

/**
 * Resolves the merged `Cookie` header value if any request or jar cookies are active.
 */
async function resolveMergedCookieHeader(
  request: HttpRequestBlock,
  state: NormalizedExecutionState,
): Promise<string> {
  const merged = mergeCookiesWithJar(request.cookies, state);
  const rawCookieStr = serializeCookieHeader(merged);

  if (rawCookieStr.length === 0) return '';

  return resolveTemplateVariables(rawCookieStr, state.options.variableContext);
}

/**
 * Reads either the external `bodyFileRef` via `options.readExternalFile` or `request.body`.
 */
async function resolveRawBodySource(
  request: HttpRequestBlock,
  options: HttpExecutionOptions,
): Promise<string> {
  if (!request.bodyFileRef) return request.body;

  const resolvedPath = await resolveTemplateVariables(request.bodyFileRef, options.variableContext);

  return invokeExternalFileReader(resolvedPath, options.readExternalFile);
}

/**
 * Resolves the raw or file-referenced request body and interpolates any `{{...}}` placeholders.
 */
async function resolveRequestBody(
  request: HttpRequestBlock,
  options: HttpExecutionOptions,
): Promise<string | undefined> {
  const method = request.method.trim().toUpperCase();

  if (BODYLESS_METHODS.has(method)) return undefined;

  const rawBody = await resolveRawBodySource(request, options);

  if (rawBody.length === 0) return undefined;

  return resolveTemplateVariables(rawBody, options.variableContext);
}

/**
 * Resolves all enabled headers and cookies for `request`, interpolating `{{...}}` placeholders.
 */
async function resolveRequestHeaders(
  request: HttpRequestBlock,
  state: NormalizedExecutionState,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};

  for (const row of request.headers.filter(isActiveRow)) {
    const key = await resolveTemplateVariables(row.key.trim(), state.options.variableContext);

    resolved[key] = await resolveTemplateVariables(row.value, state.options.variableContext);
  }

  const cookieVal = await resolveMergedCookieHeader(request, state);

  if (cookieVal.length > 0) {
    resolved.Cookie = cookieVal;
  }

  return resolved;
}

/**
 * Resolves the target URL (syncing any decomposed query parameter rows first).
 */
async function resolveTargetUrl(
  request: HttpRequestBlock,
  variableContext: HttpVariableResolutionContext,
): Promise<string> {
  const fullUrl =
    request.params.length > 0 ? buildUrlWithParams(request.url, request.params) : request.url;

  return resolveTemplateVariables(fullUrl, variableContext);
}

/**
 * Ensures `globalVariables` and `fileVariables` are populated on `variableContext`.
 */
function resolveVariableContextDefaults(
  variableContext: HttpVariableResolutionContext,
  fileVariables?: HttpKeyValueRow[],
): HttpVariableResolutionContext {
  return {
    ...variableContext,
    fileVariables: fileVariables ?? variableContext.fileVariables,
    globalVariables: variableContext.globalVariables ?? {},
  };
}

/**
 * Sends a prepared HTTP request via `fetchImpl` and returns the raw `HttpResponseSnapshot`.
 */
async function sendPreparedRequest(
  request: HttpRequestBlock,
  prepared: PreparedWireRequest,
  options: HttpExecutionOptions,
): Promise<HttpResponseSnapshot> {
  const fetchFn = options.fetchImpl ?? fetch;
  const startMs = performance.now();

  try {
    const res = await fetchFn(prepared.url, buildFetchRequestInit(prepared, options));
    const durationMs = Math.round(performance.now() - startMs);

    return await parseFetchResponse({ durationMs, prepared, request }, res);
  } catch (err) {
    const durationMs = Math.round(performance.now() - startMs);

    return buildErrorSnapshot({ durationMs, prepared, request }, err);
  }
}

/**
 * Inserts or updates a single cookie row inside `cookieJar`.
 */
function upsertCookieRow(cookieJar: HttpKeyValueRow[], incoming: HttpKeyValueRow): void {
  const existingIdx = cookieJar.findIndex((c) => c.key === incoming.key);

  if (existingIdx >= 0) {
    cookieJar[existingIdx] = incoming;

    return;
  }

  cookieJar.push(incoming);
}

/**
 * Executes all requests in an `HttpDocumentModel` sequentially ("Run All in File"),
 * sharing `globalVariables` and `cookieJar` across requests for chaining.
 *
 * @param document - Parsed `HttpDocumentModel` to execute.
 * @param options - Execution options, variable context, and adapters.
 * @returns Ordered array of `HttpResponseSnapshot` items for every request in the file.
 *
 * @example
 * ```ts
 * const snapshots = await executeAllHttpRequests(doc, { variableContext: {} });
 * ```
 */
export async function executeAllHttpRequests(
  document: HttpDocumentModel,
  options: HttpExecutionOptions,
): Promise<HttpResponseSnapshot[]> {
  const state = createNormalizedExecutionOptions(options, document.variables);
  const results: HttpResponseSnapshot[] = [];

  for (const request of document.requests) {
    results.push(await executeHttpRequest(request, state.options));
  }

  return results;
}

/**
 * Executes a single `HttpRequestBlock`, resolves variables, updates the session cookie jar,
 * and evaluates `# @assert` rules and `> {% ... %}` response handler scripts.
 *
 * @param request - Target `HttpRequestBlock` to run.
 * @param options - Execution options, variable context, and adapters.
 * @returns Completed `HttpResponseSnapshot` including assertion results.
 *
 * @example
 * ```ts
 * const snapshot = await executeHttpRequest(doc.requests[0]!, { variableContext: {} });
 * ```
 */
export async function executeHttpRequest(
  request: HttpRequestBlock,
  options: HttpExecutionOptions,
): Promise<HttpResponseSnapshot> {
  const state = createNormalizedExecutionOptions(options);
  const resolvedUrl = await resolveTargetUrl(request, state.options.variableContext);
  const resolvedMethod = (
    await resolveTemplateVariables(request.method, state.options.variableContext)
  ).toUpperCase();
  const headers = await resolveRequestHeaders(request, state);
  const body = await resolveRequestBody(request, state.options);
  const snapshot = await sendPreparedRequest(
    request,
    { body, headers, method: resolvedMethod, url: resolvedUrl },
    state.options,
  );

  mergeResponseCookiesIntoJar(state, snapshot.cookies);

  return attachEvaluatedAssertions(request, snapshot, state.globalVariables);
}

/**
 * Options for executing single or batch HTTP requests.
 */
export interface HttpExecutionOptions {
  /**
   * Mutable session cookie jar shared across requests.
   */
  cookieJar?: HttpKeyValueRow[];

  /**
   * Whether incoming `Set-Cookie` headers are automatically stored and sent on subsequent requests.
   */
  cookieJarEnabled?: boolean;

  /**
   * Optional custom `fetch` implementation for deterministic unit testing.
   */
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

  /**
   * Whether to automatically follow 3xx HTTP redirects (defaults to `true`).
   */
  followRedirects?: boolean;

  /**
   * Async adapter to read external `< ./path/to/payload.json` files relative to the `.http` file.
   */
  readExternalFile?: (relativePath: string) => Promise<string | undefined>;

  /**
   * Request timeout in milliseconds (defaults to `30000`).
   */
  timeoutMs?: number;

  /**
   * Variable and secret resolution context.
   */
  variableContext: HttpVariableResolutionContext;
}

/**
 * Normalized execution state with initialized mutable cookie jar and global variables.
 */
interface NormalizedExecutionState {
  cookieJar: HttpKeyValueRow[];
  cookieJarEnabled: boolean;
  globalVariables: Record<string, string>;
  options: HttpExecutionOptions;
}

/**
 * Fully interpolated request parameters ready to pass to `fetch`.
 */
interface PreparedWireRequest {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
}

/**
 * Context bundling the request block, prepared wire metadata, and elapsed duration.
 */
interface WireResponseContext {
  durationMs: number;
  prepared: PreparedWireRequest;
  request: HttpRequestBlock;
}
