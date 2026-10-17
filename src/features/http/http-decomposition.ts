import type { HttpAuthConfig, HttpKeyValueRow } from './http-types.ts';

const API_KEY_HEADER_CANDIDATES = new Set(['x-api-key', 'api-key', 'apikey']);

/**
 * Applies API Key authentication to either headers or query parameters.
 */
function applyApiKeyAuth(
  auth: HttpAuthConfig,
  cleanedHeaders: HttpKeyValueRow[],
  params: HttpKeyValueRow[],
): { headers: HttpKeyValueRow[]; params: HttpKeyValueRow[] } {
  const keyName = resolveApiKeyName(auth.apiKeyName);
  const keyVal = auth.apiKeyValue ?? '';

  if (auth.apiKeyIn === 'query') {
    const filteredParams = params.filter((p) => p.key !== keyName);

    return {
      headers: cleanedHeaders,
      params: [...filteredParams, { enabled: true, key: keyName, value: keyVal }],
    };
  }

  return {
    headers: [{ enabled: true, key: keyName, value: keyVal }, ...cleanedHeaders],
    params: [...params],
  };
}

/**
 * Applies Basic or Bearer authentication to request headers.
 */
function applyAuthorizationHeaderAuth(
  auth: HttpAuthConfig,
  cleanedHeaders: HttpKeyValueRow[],
  params: HttpKeyValueRow[],
): { headers: HttpKeyValueRow[]; params: HttpKeyValueRow[] } {
  const value = formatAuthorizationHeaderValue(auth);

  return {
    headers: [{ enabled: true, key: 'Authorization', value }, ...cleanedHeaders],
    params: [...params],
  };
}

/**
 * Decodes a Base64 Basic Auth token into `[username, password]` if valid.
 */
function decodeBasicAuthToken(rawToken: string): [string, string] {
  if (rawToken.includes('{{')) return [rawToken, ''];

  const decoded = Buffer.from(rawToken, 'base64').toString('utf8');

  return splitOnce(decoded, ':');
}

/**
 * Encodes a username and password pair into a Base64 Basic Auth header value.
 */
function encodeBasicAuthValue(username: string, password: string): string {
  if (username.includes('{{') && password.length === 0) return `Basic ${username}`;

  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

  return `Basic ${encoded}`;
}

/**
 * Extracts the raw query substring between `?` and `#` (if any) from a URL.
 */
function extractQuerySubstring(url: string): string {
  const qIndex = url.indexOf('?');

  if (qIndex < 0) return '';

  const afterQuestion = url.slice(qIndex + 1);

  return afterQuestion.split('#')[0] ?? '';
}

/**
 * Finds the first enabled header matching the given case-insensitive key predicate.
 */
function findMatchingHeader(
  headers: HttpKeyValueRow[],
  predicate: (lowerKey: string) => boolean,
): HttpKeyValueRow | undefined {
  return headers.find((row) => row.enabled && predicate(row.key.trim().toLowerCase()));
}

/**
 * Formats the `Authorization` header value for either `bearer` or `basic` schemes.
 */
function formatAuthorizationHeaderValue(auth: HttpAuthConfig): string {
  if (auth.scheme === 'bearer') return `Bearer ${resolveString(auth.bearerToken)}`;

  return encodeBasicAuthValue(resolveString(auth.basicUsername), resolveString(auth.basicPassword));
}

/**
 * Formats a single query parameter row into `key=value` or `key`.
 */
function formatQueryParamRow(row: HttpKeyValueRow): string {
  const key = row.key.trim();

  return row.value.length > 0 ? `${key}=${row.value}` : key;
}

/**
 * Infers structured Basic or Bearer `HttpAuthConfig` from an `Authorization` header value.
 */
function inferFromAuthorizationValue(authValue: string): HttpAuthConfig {
  const trimmed = authValue.trim();

  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return {
      bearerToken: trimmed.slice(7).trim(),
      scheme: 'bearer',
    };
  }

  if (trimmed.toLowerCase().startsWith('basic ')) {
    const [basicUsername, basicPassword] = decodeBasicAuthToken(trimmed.slice(6).trim());

    return { basicPassword, basicUsername, scheme: 'basic' };
  }

  return { scheme: 'none' };
}

/**
 * Checks whether a header key is managed by the Auth tab (`Authorization` or known API key header).
 */
function isManagedAuthHeaderKey(lowerKey: string, lowerCustom?: string): boolean {
  if (lowerKey === 'authorization' || API_KEY_HEADER_CANDIDATES.has(lowerKey)) return true;

  return lowerKey === lowerCustom;
}

/**
 * Parses a single `key=value` segment into an enabled `HttpKeyValueRow`.
 */
function parsePairSegment(segment: string): HttpKeyValueRow {
  const eqIndex = segment.indexOf('=');

  if (eqIndex < 0) return { enabled: true, key: segment.trim(), value: '' };

  return {
    enabled: true,
    key: segment.slice(0, eqIndex).trim(),
    value: segment.slice(eqIndex + 1).trim(),
  };
}

/**
 * Resolves the API Key header/parameter name, defaulting to `'X-API-Key'`.
 */
function resolveApiKeyName(name?: string): string {
  const trimmed = resolveString(name).trim();

  return trimmed.length > 0 ? trimmed : 'X-API-Key';
}

/**
 * Coerces an optional string to `''`.
 */
function resolveString(val?: string): string {
  return val ?? '';
}

/**
 * Splits a string on the first occurrence of `delimiter` into a two-tuple.
 */
function splitOnce(input: string, delimiter: string): [string, string] {
  const idx = input.indexOf(delimiter);

  if (idx < 0) return [input, ''];

  return [input.slice(0, idx), input.slice(idx + delimiter.length)];
}

/**
 * Removes existing `Authorization` or known API-key headers before applying a new `HttpAuthConfig`.
 */
function stripManagedAuthHeaders(
  headers: HttpKeyValueRow[],
  customKey?: string,
): HttpKeyValueRow[] {
  const lowerCustom = customKey?.trim().toLowerCase();

  return headers.filter(
    (row) => !isManagedAuthHeaderKey(row.key.trim().toLowerCase(), lowerCustom),
  );
}

/**
 * Synchronizes an `HttpAuthConfig` into headers and query parameters, returning updated arrays.
 *
 * @param auth - Desired authentication configuration from the GUI Auth tab.
 * @param headers - Current request headers list.
 * @param params - Current URL query parameter rows.
 * @returns Updated `{ headers, params }` reflecting the active authentication scheme.
 *
 * @example
 * ```ts
 * const next = applyAuthToHeadersAndParams({ scheme: 'bearer', bearerToken: '{{tok}}' }, [], []);
 * // next.headers => [{ enabled: true, key: 'Authorization', value: 'Bearer {{tok}}' }]
 * ```
 */
export function applyAuthToHeadersAndParams(
  auth: HttpAuthConfig,
  headers: HttpKeyValueRow[],
  params: HttpKeyValueRow[],
): { headers: HttpKeyValueRow[]; params: HttpKeyValueRow[] } {
  const cleanedHeaders = stripManagedAuthHeaders(headers, auth.apiKeyName);

  if (['bearer', 'basic'].includes(auth.scheme)) {
    return applyAuthorizationHeaderAuth(auth, cleanedHeaders, params);
  }

  if (auth.scheme === 'apiKey') return applyApiKeyAuth(auth, cleanedHeaders, params);

  return { headers: cleanedHeaders, params: [...params] };
}

/**
 * Reconstructs a full URL string from a base URL (or existing URL) and query parameter rows.
 *
 * @param currentUrl - Existing URL string (whose base before `?` is preserved).
 * @param params - Query parameter rows to serialize onto the URL.
 * @returns Reconstructed URL with enabled query parameters appended.
 *
 * @example
 * ```ts
 * buildUrlWithParams('https://api.example.com/items?old=1', [{ enabled: true, key: 'page', value: '{{p}}' }]);
 * // 'https://api.example.com/items?page={{p}}'
 * ```
 */
export function buildUrlWithParams(currentUrl: string, params: HttpKeyValueRow[]): string {
  const baseUrl = currentUrl.split('?')[0] ?? currentUrl;
  const active = params.filter((row) => row.enabled && row.key.trim().length > 0);

  if (active.length === 0) return baseUrl;

  const query = active.map(formatQueryParamRow).join('&');

  return `${baseUrl}?${query}`;
}

/**
 * Infers an `HttpAuthConfig` from a request's headers for display in the GUI Auth tab.
 *
 * @param headers - Request header rows.
 * @returns Inferred `HttpAuthConfig`.
 *
 * @example
 * ```ts
 * const auth = inferAuthConfig([{ enabled: true, key: 'Authorization', value: 'Bearer {{token}}' }]);
 * // auth.scheme === 'bearer'
 * ```
 */
export function inferAuthConfig(headers: HttpKeyValueRow[]): HttpAuthConfig {
  const authHeader = findMatchingHeader(headers, (k) => k === 'authorization');

  if (authHeader) return inferFromAuthorizationValue(authHeader.value);

  const apiKeyHeader = findMatchingHeader(headers, (k) => API_KEY_HEADER_CANDIDATES.has(k));

  if (apiKeyHeader) {
    return {
      apiKeyIn: 'header',
      apiKeyName: apiKeyHeader.key.trim(),
      apiKeyValue: apiKeyHeader.value.trim(),
      scheme: 'apiKey',
    };
  }

  return { scheme: 'none' };
}

/**
 * Parses a semicolon-delimited `Cookie` request header value into editable key/value rows.
 *
 * @param cookieHeaderValue - Raw value of the `Cookie:` header.
 * @returns Array of `HttpKeyValueRow` entries.
 *
 * @example
 * ```ts
 * parseCookieHeader('session=abc; theme=dark');
 * // [{ enabled: true, key: 'session', value: 'abc' }, { enabled: true, key: 'theme', value: 'dark' }]
 * ```
 */
export function parseCookieHeader(cookieHeaderValue: string): HttpKeyValueRow[] {
  const trimmed = cookieHeaderValue.trim();

  if (trimmed.length === 0) return [];

  return trimmed
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(parsePairSegment);
}

/**
 * Extracts query string parameters from a URL into editable `HttpKeyValueRow` entries.
 *
 * @param url - Raw URL string (may contain `{{variable}}` placeholders).
 * @returns Array of `HttpKeyValueRow` items representing query parameters.
 *
 * @example
 * ```ts
 * parseQueryParams('https://example.com/search?q={{term}}&limit=10');
 * // [{ enabled: true, key: 'q', value: '{{term}}' }, { enabled: true, key: 'limit', value: '10' }]
 * ```
 */
export function parseQueryParams(url: string): HttpKeyValueRow[] {
  const queryText = extractQuerySubstring(url).trim();

  if (queryText.length === 0) return [];

  return queryText
    .split('&')
    .filter((seg) => seg.length > 0)
    .map(parsePairSegment);
}

/**
 * Parses `Set-Cookie` response headers into key/value cookie rows (ignoring cookie attributes).
 *
 * @param setCookieValues - Raw `Set-Cookie` header strings from an HTTP response.
 * @returns Array of `HttpKeyValueRow` items with the cookie name and value.
 *
 * @example
 * ```ts
 * parseSetCookieHeaders(['sid=xyz123; Path=/; HttpOnly']);
 * // [{ enabled: true, key: 'sid', value: 'xyz123' }]
 * ```
 */
export function parseSetCookieHeaders(setCookieValues: string[]): HttpKeyValueRow[] {
  return setCookieValues
    .map((header) => header.split(';')[0]?.trim() ?? '')
    .filter((firstPair) => firstPair.length > 0)
    .map(parsePairSegment);
}

/**
 * Serializes enabled cookie rows into a single semicolon-delimited `Cookie` header value.
 *
 * @param cookies - Editable cookie rows from the request model.
 * @returns Formatted `Cookie` header string, or `''` when no cookies are enabled.
 *
 * @example
 * ```ts
 * serializeCookieHeader([{ enabled: true, key: 'sid', value: '123' }]);
 * // 'sid=123'
 * ```
 */
export function serializeCookieHeader(cookies: HttpKeyValueRow[]): string {
  return cookies
    .filter((row) => row.enabled && row.key.trim().length > 0)
    .map((row) => `${row.key.trim()}=${row.value.trim()}`)
    .join('; ');
}
