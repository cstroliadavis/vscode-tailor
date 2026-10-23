import { parseHttpDocument } from '../http/http-parser.ts';

const CURL_DATA_FLAGS = new Set(['-d', '--data', '--data-binary', '--data-raw']);
const CURL_HEADER_FLAGS = new Set(['-H', '--header']);
const CURL_METHOD_FLAGS = new Set(['-X', '--request']);
const TOKEN_REGEX = /'([^']*)'|"((?:\\"|[^"])*)"|(\S+)/g;

/**
 * Applies a single token at `index` from a tokenized `cURL` command and returns the next index.
 */
function applyCurlToken(spec: NormalizedHttpSpec, tokens: string[], index: number): number {
  const token = tokens[index];
  const nextVal = tokens[index + 1];

  if (consumeCurlFlag(spec, token, nextVal)) return index + 2;

  if (isHttpUrl(token)) {
    spec.url = token;
  }

  return index + 1;
}

/**
 * Consumes a known two-argument `cURL` flag (`-X`, `-H`, `-d`) if matched.
 */
function consumeCurlFlag(spec: NormalizedHttpSpec, flag: string, nextVal: string): boolean {
  if (CURL_METHOD_FLAGS.has(flag)) {
    spec.method = nextVal.toUpperCase();

    return true;
  }

  if (CURL_HEADER_FLAGS.has(flag)) {
    parseCurlHeader(nextVal, spec.headers);

    return true;
  }

  return consumeDataFlag(spec, flag, nextVal);
}

/**
 * Consumes a `cURL` body payload flag (`-d`, `--data`, `--data-raw`, `--data-binary`).
 */
function consumeDataFlag(spec: NormalizedHttpSpec, flag: string, nextVal: string): boolean {
  if (!CURL_DATA_FLAGS.has(flag)) return false;

  spec.body = nextVal;

  if (spec.method === 'GET') {
    spec.method = 'POST';
  }

  return true;
}

/**
 * Auto-detects whether `text` is `cURL`, `fetch()`, or `.http` and returns a normalized request.
 */
function detectAndParseHttp(text: string): NormalizedHttpSpec {
  const trimmed = text.trim();

  if (/^curl\b/i.test(trimmed)) return parseCurlInput(trimmed);
  if (/\bfetch\s*\(/.test(trimmed)) return parseFetchInput(trimmed);

  return parseHttpFileInput(trimmed);
}

/**
 * Escapes single quotes for safe shell single-quoted strings.
 */
function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

/**
 * Extracts a regex capture group or returns an empty string when unmatched.
 */
function extractCapture(regex: RegExp, text: string, groupIndex: number): string {
  const match = regex.exec(text);

  return match ? match[groupIndex] : '';
}

/**
 * Extracts the `body` payload from a `fetch(...)` snippet.
 */
function extractFetchBody(text: string): string {
  const jsonBody = extractCapture(
    /body\s*:\s*JSON\.stringify\(([\s\S]*?)\)\s*(?:,|\n|\})/,
    text,
    1,
  );

  if (jsonBody.length > 0) return jsonBody.trim();

  return extractCapture(/body\s*:\s*(['"`])([\s\S]*?)\1/, text, 2);
}

/**
 * Extracts `headers` key-value pairs from a `fetch(...)` options block.
 */
function extractFetchHeaders(text: string): Array<{ key: string; value: string }> {
  const rawBlock = extractCapture(/headers\s*:\s*\{([\s\S]*?)\}/, text, 1);

  if (rawBlock.length === 0) return [];

  const headers: Array<{ key: string; value: string }> = [];
  const pairRegex = /['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*(['"])(.*?)\2/g;

  for (const match of rawBlock.matchAll(pairRegex)) {
    headers.push({ key: match[1], value: match[3] });
  }

  return headers;
}

/**
 * Formats a normalized HTTP specification as a multiline `cURL` command.
 */
function formatAsCurl(spec: NormalizedHttpSpec): string {
  const parts = [`curl -X ${spec.method} '${escapeSingleQuotes(spec.url)}'`];

  for (const h of spec.headers) {
    parts.push(`  -H '${escapeSingleQuotes(`${h.key}: ${h.value}`)}'`);
  }

  if (spec.body.length > 0) {
    parts.push(`  -d '${escapeSingleQuotes(spec.body)}'`);
  }

  return parts.join(' \\\n');
}

/**
 * Formats a normalized HTTP specification as a JavaScript `fetch()` call.
 */
function formatAsFetch(spec: NormalizedHttpSpec): string {
  const lines = [`fetch('${escapeSingleQuotes(spec.url)}', {`, `  method: '${spec.method}',`];

  if (spec.headers.length > 0) {
    const hdrs = spec.headers
      .map((h) => `    '${escapeSingleQuotes(h.key)}': '${escapeSingleQuotes(h.value)}',`)
      .join('\n');

    lines.push('  headers: {', hdrs, '  },');
  }

  if (spec.body.length > 0) {
    lines.push(`  body: '${escapeSingleQuotes(spec.body)}',`);
  }

  lines.push('});');

  return lines.join('\n');
}

/**
 * Formats a normalized HTTP specification as an `.http` request block.
 */
function formatAsHttp(spec: NormalizedHttpSpec): string {
  const lines = [`${spec.method} ${spec.url}`];

  for (const h of spec.headers) {
    lines.push(`${h.key}: ${h.value}`);
  }

  if (spec.body.length > 0) {
    lines.push('', spec.body);
  }

  return lines.join('\n');
}

/**
 * Checks whether a token starts with `http://` or `https://`.
 */
function isHttpUrl(token: string): boolean {
  return token.startsWith('http://') || token.startsWith('https://');
}

/**
 * Parses a single `Key: Value` header string into `headers`.
 */
function parseCurlHeader(rawHeader: string, headers: Array<{ key: string; value: string }>): void {
  const colonIdx = rawHeader.indexOf(':');

  if (colonIdx <= 0) return;

  headers.push({
    key: rawHeader.slice(0, colonIdx).trim(),
    value: rawHeader.slice(colonIdx + 1).trim(),
  });
}

/**
 * Parses a `cURL` command string into a `NormalizedHttpSpec`.
 */
function parseCurlInput(text: string): NormalizedHttpSpec {
  const tokens = tokenizeCurl(text);
  const spec: NormalizedHttpSpec = { body: '', headers: [], method: 'GET', url: '' };
  let idx = 1;

  while (idx < tokens.length) {
    idx = applyCurlToken(spec, tokens, idx);
  }

  return spec;
}

/**
 * Parses a JavaScript `fetch(url, options)` snippet into a `NormalizedHttpSpec`.
 */
function parseFetchInput(text: string): NormalizedHttpSpec {
  const url = extractCapture(/fetch\s*\(\s*(['"`])(.*?)\1/, text, 2);
  const rawMethod = extractCapture(/method\s*:\s*(['"`])([A-Za-z]+)\1/, text, 2);
  const method = rawMethod.length > 0 ? rawMethod.toUpperCase() : 'GET';

  return {
    body: extractFetchBody(text),
    headers: extractFetchHeaders(text),
    method,
    url,
  };
}

/**
 * Parses an `.http` / `.rest` snippet using Tailor's HTTP parser into a `NormalizedHttpSpec`.
 */
function parseHttpFileInput(text: string): NormalizedHttpSpec {
  const doc = parseHttpDocument(text);

  if (doc.requests.length === 0) return { body: '', headers: [], method: 'GET', url: text.trim() };

  const first = doc.requests[0];

  return {
    body: first.body,
    headers: first.headers.map((h) => ({ key: h.key, value: h.value })),
    method: first.method.toUpperCase(),
    url: first.url,
  };
}

/**
 * Tokenizes a shell `cURL` command while stripping line continuations and unwrapping quotes.
 */
function tokenizeCurl(text: string): string[] {
  const normalized = text.replace(/\\\r?\n/g, ' ');
  const tokens: string[] = [];

  for (const match of normalized.matchAll(TOKEN_REGEX)) {
    tokens.push(unwrapCurlTokenMatch(match));
  }

  return tokens;
}

/**
 * Extracts the unquoted value from a `TOKEN_REGEX` match array.
 */
function unwrapCurlTokenMatch(match: RegExpExecArray): string {
  const raw = match[0];

  if (raw.startsWith("'")) return raw.slice(1, -1);
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/\\"/g, '"');

  return raw;
}

/**
 * Auto-detects an HTTP request snippet (`cURL`, `fetch()`, or `.http`) and converts it to `target`.
 *
 * @param text - Source HTTP snippet (`cURL`, `fetch()`, or `.http`).
 * @param target - Target output format (`'curl'`, `'fetch'`, or `'http'`).
 * @returns Converted HTTP snippet string.
 *
 * @example
 * ```ts
 * convertHttpText("curl 'https://example.com'", 'http'); // 'GET https://example.com'
 * ```
 */
export function convertHttpText(text: string, target: HttpConvertTarget): string {
  const spec = detectAndParseHttp(text);

  if (target === 'curl') return formatAsCurl(spec);
  if (target === 'fetch') return formatAsFetch(spec);

  return formatAsHttp(spec);
}

/**
 * Supported target formats for HTTP request snippet conversion.
 */
export type HttpConvertTarget = 'curl' | 'fetch' | 'http';

/**
 * Internal normalized representation of an HTTP request used as the conversion hub.
 */
interface NormalizedHttpSpec {
  body: string;
  headers: Array<{ key: string; value: string }>;
  method: string;
  url: string;
}
