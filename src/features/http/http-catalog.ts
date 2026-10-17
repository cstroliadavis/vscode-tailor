/**
 * Standard and extended HTTP/WebDAV/CDN request methods suggested in the GUI Method combo-box.
 */
export const HTTP_METHOD_SUGGESTIONS: readonly string[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT',
  'PURGE',
  'BAN',
  'PROPFIND',
  'PROPPATCH',
  'MKCOL',
  'COPY',
  'MOVE',
  'LOCK',
  'UNLOCK',
  'LINK',
  'UNLINK',
];

/**
 * Common HTTP request header names paired with suggested values for GUI combo-box dropdowns.
 */
export const HTTP_HEADER_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  Accept: [
    'application/json',
    'application/xml',
    'text/html',
    'text/plain',
    '*/*',
    'application/problem+json',
  ],
  'Accept-Encoding': ['gzip, deflate, br', 'gzip, deflate', 'identity', '*'],
  'Accept-Language': ['en-US,en;q=0.9', 'en-GB,en;q=0.8', '*'],
  Authorization: ['Bearer {{token}}', 'Basic {{credentials}}', 'Digest '],
  'Cache-Control': [
    'no-cache',
    'no-store',
    'max-age=0',
    'max-age=3600',
    'public, max-age=86400',
    'private, no-cache',
  ],
  Connection: ['keep-alive', 'close', 'Upgrade'],
  'Content-Type': [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain; charset=utf-8',
    'application/xml',
    'application/graphql',
    'application/octet-stream',
  ],
  'If-Match': ['"*"', '{{etag}}'],
  'If-None-Match': ['"*"', '{{etag}}'],
  Origin: ['http://localhost:3000', 'https://localhost:8080'],
  Pragma: ['no-cache'],
  'User-Agent': [
    'VSCodeTailor-HttpClient/1.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'curl/8.4.0',
  ],
  'X-API-Key': ['{{$secret api_key}}', '{{apiKey}}'],
  'X-Forwarded-For': ['127.0.0.1'],
  'X-Forwarded-Proto': ['https', 'http'],
  'X-Requested-With': ['XMLHttpRequest'],
};

const LOWERCASE_HEADER_LOOKUP: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(HTTP_HEADER_SUGGESTIONS).map(([key, values]) => [key.toLowerCase(), values]),
);

/**
 * Returns the sorted list of known HTTP request header names for combo-box auto-completion.
 *
 * @returns Array of standard and common HTTP header names.
 *
 * @example
 * ```ts
 * const headers = getKnownHeaderNames();
 * // ['Accept', 'Accept-Encoding', ...]
 * ```
 */
export function getKnownHeaderNames(): string[] {
  return Object.keys(HTTP_HEADER_SUGGESTIONS);
}

/**
 * Returns known value suggestions for a given HTTP header name (case-insensitive).
 *
 * @param headerName - HTTP request header name.
 * @returns Array of suggested header values, or an empty array when the header has no presets.
 *
 * @example
 * ```ts
 * const values = getSuggestionsForHeader('content-type');
 * // ['application/json', ...]
 * ```
 */
export function getSuggestionsForHeader(headerName: string): readonly string[] {
  const normalized = headerName.trim().toLowerCase();

  return LOWERCASE_HEADER_LOOKUP[normalized] ?? [];
}
