const BRACKET_DELTA = new Map<string, number>([
  ['(', 1],
  ['[', 1],
  ['{', 1],
  [')', -1],
  [']', -1],
  ['}', -1],
]);

const HTML_DECODE_MAP = new Map<string, string>([
  ['&#39;', "'"],
  ['&amp;', '&'],
  ['&apos;', "'"],
  ['&gt;', '>'],
  ['&lt;', '<'],
  ['&quot;', '"'],
]);

const HTML_ENCODE_MAP = new Map<string, string>([
  ['"', '&quot;'],
  ['&', '&amp;'],
  ["'", '&#39;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
]);

const HTML_ENTITY_REGEX = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;
const PRINTABLE_UTF8_REGEX = /^[\t\n\r\x20-\x7E\u00A0-\uD7FF\uE000-\uFFFC]+$/;
const QUOTE_CHARS = new Set(['"', "'", '`']);

const WRAPPER_MAP = new Map<string, WrapperSpec>([
  ['(', { close: ')', isObject: false, open: '(' }],
  ['[', { close: ']', isObject: false, open: '[' }],
  ['{', { close: '}', isObject: true, open: '{' }],
]);

/**
 * Updates bracket nesting depth when `ch` is an opening or closing delimiter.
 */
function adjustBracketDepth(state: SplitScanState, ch: string): void {
  const delta = BRACKET_DELTA.get(ch);

  if (delta !== undefined) {
    state.depth = Math.max(0, state.depth + delta);
  }
}

/**
 * Compares two extracted list or object items alphanumerically.
 */
function compareItems(a: string, b: string, isObject: boolean): number {
  const keyA = extractSortKey(a, isObject);
  const keyB = extractSortKey(b, isObject);

  return keyA.localeCompare(keyB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Unescapes common named and numeric HTML entities back into raw characters.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&(?:lt|gt|quot|apos|#39|amp);/g, (entity) => HTML_DECODE_MAP.get(entity) ?? entity);
}

/**
 * Detects whether a trimmed selection is wrapped in `(...)`, `[...]`, or `{...}`.
 */
function detectWrapper(trimmed: string): WrapperSpec | null {
  const spec = WRAPPER_MAP.get(trimmed.slice(0, 1));

  if (!spec) return null;

  return trimmed.endsWith(spec.close) ? spec : null;
}

/**
 * Escapes `<`, `>`, `&`, `"`, and `'` into HTML character entities.
 */
function encodeHtmlEntities(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ENCODE_MAP.get(ch) ?? ch);
}

/**
 * Extracts the comparison key from an item (using the property name when sorting object entries).
 */
function extractSortKey(item: string, isObject: boolean): string {
  const cleaned = item.trim().replace(/^['"`]|['"`]$/g, '');

  if (!isObject) return cleaned;

  const colonIndex = cleaned.indexOf(':');

  return colonIndex > 0 ? cleaned.slice(0, colonIndex).trim() : cleaned;
}

/**
 * Formats sorted items as a single-line wrapped expression.
 */
function formatInlineItems(items: string[], wrapper: WrapperSpec): string {
  const joined = items.map((item) => item.trim()).join(', ');

  return wrapper.isObject
    ? `${wrapper.open} ${joined} ${wrapper.close}`
    : `${wrapper.open}${joined}${wrapper.close}`;
}

/**
 * Formats sorted items as a multiline block preserving indentation.
 */
function formatMultilineItems(items: string[], wrapper: WrapperSpec, inner: string): string {
  const indentMatch = /\n([ \t]+)/.exec(inner);
  const indent = indentMatch ? indentMatch[1] : '  ';
  const body = items.map((item) => `${indent}${item.trim()},`).join('\n');

  return `${wrapper.open}\n${body}\n${wrapper.close}`;
}

/**
 * Reconstructs sorted items preserving either multiline indentation or inline spacing.
 */
function formatSortedItems(items: string[], wrapper: WrapperSpec, inner: string): string {
  if (inner.includes('\n')) return formatMultilineItems(items, wrapper, inner);

  return formatInlineItems(items, wrapper);
}

/**
 * Checks whether a trimmed string matches valid Base64 length and character rules.
 */
function isBase64Shape(trimmed: string): boolean {
  if (trimmed.length === 0 || trimmed.length % 4 !== 0) return false;

  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
}

/**
 * Verifies that `decoded` round-trips back to `trimmed` and contains only printable UTF-8 text.
 */
function isCanonicalDecodedUtf8(trimmed: string, decoded: string): boolean {
  if (Buffer.from(decoded, 'utf8').toString('base64') !== trimmed) return false;

  return PRINTABLE_UTF8_REGEX.test(decoded);
}

/**
 * Pushes the accumulated item into `state.items` when non-empty and resets `state.current`.
 */
function pushCurrentItem(state: SplitScanState): void {
  const trimmed = state.current.trim();

  if (trimmed.length > 0) {
    state.items.push(trimmed);
  }

  state.current = '';
}

/**
 * Joins sorted top-level comma items or falls back to sorting newline rows.
 */
function sortUnwrappedText(text: string): string {
  if (!text.includes('\n') && text.includes(',')) {
    return splitTopLevelComma(text)
      .sort((a, b) => compareItems(a, b, false))
      .join(', ');
  }

  return text
    .split(/\r?\n/)
    .sort((a, b) => compareItems(a, b, false))
    .join('\n');
}

/**
 * Splits an identifier or phrase into normalized uppercase word tokens.
 */
function splitIdentifierWords(text: string): string[] {
  const spaced = text
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();

  return spaced.length > 0 ? spaced.toUpperCase().split(/\s+/) : [];
}

/**
 * Splits a string by top-level commas while ignoring commas inside quotes or nested brackets.
 */
function splitTopLevelComma(text: string): string[] {
  const state: SplitScanState = {
    current: '',
    depth: 0,
    escaped: false,
    items: [],
    quote: null,
  };

  for (const ch of text) {
    stepScanChar(state, ch);
  }

  pushCurrentItem(state);

  return state.items;
}

/**
 * Updates bracket nesting depth or splits on a top-level comma outside of string literals.
 */
function stepDelimiterState(state: SplitScanState, ch: string): void {
  if (ch === ',' && state.depth === 0) {
    pushCurrentItem(state);

    return;
  }

  adjustBracketDepth(state, ch);
  state.current += ch;
}

/**
 * Handles characters when currently inside a quoted literal.
 */
function stepInsideQuote(state: SplitScanState, ch: string): void {
  state.current += ch;

  if (state.escaped) {
    state.escaped = false;

    return;
  }

  state.escaped = ch === '\\';

  if (ch === state.quote) {
    state.quote = null;
  }
}

/**
 * Processes a single character during top-level comma splitting.
 */
function stepScanChar(state: SplitScanState, ch: string): void {
  if (state.quote !== null) {
    stepInsideQuote(state, ch);

    return;
  }

  if (QUOTE_CHARS.has(ch)) {
    state.quote = ch;
    state.current += ch;

    return;
  }

  stepDelimiterState(state, ch);
}

/**
 * Attempts to decode `trimmed` as Base64 if it represents valid, printable UTF-8 text.
 */
function tryDecodeBase64(trimmed: string): string | null {
  if (!isBase64Shape(trimmed)) return null;

  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');

  return isCanonicalDecodedUtf8(trimmed, decoded) ? decoded : null;
}

/**
 * Safely decodes a percent-encoded string or falls back to encoding on malformed sequences.
 */
function tryDecodeUrl(text: string): string {
  try {
    return decodeURIComponent(text.trim());
  } catch {
    return encodeURIComponent(text);
  }
}

/**
 * Smart-sorts array literals, object literals (by key), parameter lists, comma lists, or rows.
 *
 * @param text - Selected source text or line to sort.
 * @returns Sorted text preserving outer delimiters and formatting.
 *
 * @example
 * ```ts
 * smartSortText('{ z: 1, a: 2 }'); // '{ a: 2, z: 1 }'
 * ```
 */
export function smartSortText(text: string): string {
  const trimmed = text.trim();
  const wrapper = detectWrapper(trimmed);

  if (!wrapper) return sortUnwrappedText(text);

  const inner = trimmed.slice(1, -1);
  const items = splitTopLevelComma(inner).sort((a, b) => compareItems(a, b, wrapper.isObject));

  return formatSortedItems(items, wrapper, inner);
}

/**
 * Auto-detects whether `text` is Base64-encoded UTF-8 and decodes it, or encodes it to Base64.
 *
 * @param text - Input text to encode or decode.
 * @returns Toggled Base64 or UTF-8 string.
 *
 * @example
 * ```ts
 * toggleBase64('hello'); // 'aGVsbG8='
 * toggleBase64('aGVsbG8='); // 'hello'
 * ```
 */
export function toggleBase64(text: string): string {
  const decoded = tryDecodeBase64(text.trim());

  if (decoded !== null) return decoded;

  return Buffer.from(text, 'utf8').toString('base64');
}

/**
 * Auto-detects HTML character entities in `text` and decodes them, or escapes HTML entities.
 *
 * @param text - Input text to HTML-encode or decode.
 * @returns Toggled HTML-encoded or decoded string.
 *
 * @example
 * ```ts
 * toggleHtml('<b>Hi</b>'); // '&lt;b&gt;Hi&lt;/b&gt;'
 * ```
 */
export function toggleHtml(text: string): string {
  if (HTML_ENTITY_REGEX.test(text)) return decodeHtmlEntities(text);

  return encodeHtmlEntities(text);
}

/**
 * Auto-detects percent-encoded URL sequences in `text` and decodes them, or URL-encodes `text`.
 *
 * @param text - Input text to URL-encode or decode.
 * @returns Toggled URL-encoded or decoded string.
 *
 * @example
 * ```ts
 * toggleUrl('hello world'); // 'hello%20world'
 * toggleUrl('hello%20world'); // 'hello world'
 * ```
 */
export function toggleUrl(text: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(text)) return tryDecodeUrl(text);

  return encodeURIComponent(text);
}

/**
 * Converts an identifier or phrase into `UPPER-KEBAB-CASE`.
 *
 * @param text - Input text to transform.
 * @returns Uppercase hyphen-separated string.
 *
 * @example
 * ```ts
 * toUpperKebabCase('camelCaseValue'); // 'CAMEL-CASE-VALUE'
 * ```
 */
export function toUpperKebabCase(text: string): string {
  return splitIdentifierWords(text).join('-');
}

/**
 * Converts an identifier or phrase into `UPPER_SNAKE_CASE`.
 *
 * @param text - Input text to transform.
 * @returns Uppercase underscore-separated string.
 *
 * @example
 * ```ts
 * toUpperSnakeCase('camelCaseValue'); // 'CAMEL_CASE_VALUE'
 * ```
 */
export function toUpperSnakeCase(text: string): string {
  return splitIdentifierWords(text).join('_');
}

/**
 * Mutable scanner state for splitting top-level comma-delimited tokens.
 */
interface SplitScanState {
  current: string;
  depth: number;
  escaped: boolean;
  items: string[];
  quote: string | null;
}

/**
 * Bracket wrapper metadata for smart-sorting structured literals.
 */
interface WrapperSpec {
  close: string;
  isObject: boolean;
  open: string;
}
