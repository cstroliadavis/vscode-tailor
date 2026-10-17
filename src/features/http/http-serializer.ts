import { buildUrlWithParams, serializeCookieHeader } from './http-decomposition.ts';
import type {
  HttpAssertionRule,
  HttpDocumentModel,
  HttpKeyValueRow,
  HttpRequestBlock,
} from './http-types.ts';

/**
 * Appends body or external file reference lines to `lines` when present.
 */
function appendBodyLines(lines: string[], req: HttpRequestBlock): void {
  if (req.bodyFileRef) {
    lines.push(`< ${req.bodyFileRef}`);

    return;
  }

  if (req.body.trim().length > 0) {
    lines.push(req.body);
  }
}

/**
 * Appends active `Key: Value` header and `Cookie:` lines to `lines`.
 */
function appendHeaderAndCookieLines(lines: string[], req: HttpRequestBlock): void {
  const activeHeaders = req.headers.filter(isActiveKeyValue);

  for (const header of activeHeaders) {
    lines.push(`${header.key.trim()}: ${header.value}`);
  }

  const cookieStr = serializeCookieHeader(req.cookies);

  if (cookieStr.length > 0) {
    lines.push(`Cookie: ${cookieStr}`);
  }
}

/**
 * Appends response handler script lines (`> {% ... %}`) when `responseScript` is non-empty.
 */
function appendScriptLines(lines: string[], script: string): void {
  const trimmed = script.trim();

  if (trimmed.length === 0) return;

  lines.push('> {%', trimmed, '%}');
}

/**
 * Formats the `METHOD URL [HTTP/1.1]` request line for a request block.
 */
function formatRequestLine(req: HttpRequestBlock): string {
  const syncedUrl = req.params.length > 0 ? buildUrlWithParams(req.url, req.params) : req.url;
  const method = resolveMethodLabel(req.method);

  return req.httpVersion ? `${method} ${syncedUrl} ${req.httpVersion}` : `${method} ${syncedUrl}`;
}

/**
 * Formats a single `HttpAssertionRule` into a `# @assert ...` comment directive line.
 */
function formatSingleAssertion(rule: HttpAssertionRule): string {
  const suffix = rule.operator === 'exists' ? '' : ` ${rule.expected}`;

  return `# @assert ${rule.target} ${rule.operator}${suffix}`;
}

/**
 * Formats file-level `@variable = value` rows into a single preamble block.
 */
function formatVariablesBlock(variables: HttpKeyValueRow[]): string {
  return variables
    .filter(isActiveKeyValue)
    .map((v) => `@${v.key.trim()} = ${v.value}`)
    .join('\n');
}

/**
 * Checks whether a request block has a body, file reference, or response script.
 */
function hasPayloadOrScript(req: HttpRequestBlock): boolean {
  if (req.bodyFileRef !== undefined) return true;

  return req.body.trim().length > 0 || req.responseScript.trim().length > 0;
}

/**
 * Checks whether a key/value row is enabled and has a non-empty key.
 */
function isActiveKeyValue(row: HttpKeyValueRow): boolean {
  return row.enabled && row.key.trim().length > 0;
}

/**
 * Returns the trimmed HTTP method or `'GET'` when blank.
 */
function resolveMethodLabel(method: string): string {
  const trimmed = method.trim();

  return trimmed.length > 0 ? trimmed : 'GET';
}

/**
 * Serializes a single `HttpRequestBlock` into an array of `.http` lines.
 */
function serializeSingleRequest(req: HttpRequestBlock): string[] {
  const lines: string[] = [`### ${req.name}`, ...req.preComments, formatRequestLine(req)];

  appendHeaderAndCookieLines(lines, req);

  for (const rule of req.assertions) {
    lines.push(formatSingleAssertion(rule));
  }

  if (hasPayloadOrScript(req)) {
    lines.push('');
    appendBodyLines(lines, req);
    appendScriptLines(lines, req.responseScript);
  }

  return lines;
}

/**
 * Serializes an `HttpDocumentModel` back into a formatted `.http` file string.
 *
 * @param model - Structured `HttpDocumentModel` to serialize.
 * @returns Formatted `.http` file text ending with a newline.
 *
 * @example
 * ```ts
 * const text = serializeHttpDocument(model);
 * ```
 */
export function serializeHttpDocument(model: HttpDocumentModel): string {
  const varBlock = formatVariablesBlock(model.variables);
  const reqBlocks = model.requests.map((req) => serializeSingleRequest(req).join('\n'));
  const blocks = varBlock.length > 0 ? [varBlock, ...reqBlocks] : reqBlocks;

  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`;
}
