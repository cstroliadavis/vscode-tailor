import { inferAuthConfig, parseCookieHeader, parseQueryParams } from './http-decomposition.ts';
import type {
  HttpAssertionOperator,
  HttpAssertionRule,
  HttpDocumentModel,
  HttpKeyValueRow,
  HttpRequestBlock,
} from './http-types.ts';

export { serializeHttpDocument } from './http-serializer.ts';

const ASSERT_OPERATORS: readonly HttpAssertionOperator[] = [
  '==',
  '!=',
  'contains',
  'matches',
  'exists',
  '<',
  '>',
];

const REQUEST_LINE_REGEX = /^([A-Za-z][A-Za-z0-9_-]*)\s+(\S+)(?:\s+(HTTP\/[0-9.]+))?$/;
const VARIABLE_LINE_REGEX = /^@([A-Za-z0-9_.-]+)\s*=\s*(.*)$/;

/**
 * Appends a parsed header line (`Key: Value`) into either `cookies` or `headers` on `state`.
 */
function addRawHeaderLine(state: SectionParseState, rawLine: string): void {
  const colonIdx = rawLine.indexOf(':');

  if (colonIdx <= 0) return;

  const key = rawLine.slice(0, colonIdx).trim();
  const value = rawLine.slice(colonIdx + 1).trim();

  if (key.toLowerCase() === 'cookie') {
    state.cookies.push(...parseCookieHeader(value));

    return;
  }

  state.headers.push({ enabled: true, key, value });
}

/**
 * Finalizes a raw request section into a structured `HttpRequestBlock` if a request line was found.
 */
function buildRequestBlock(section: RawRequestSection, index: number): HttpRequestBlock | null {
  const state = createSectionParseState(section.startLine);

  for (let i = 0; i < section.lines.length; i++) {
    processSectionLine(state, section.lines[i]!, section.startLine + i);
  }

  if (!state.url) return null;

  return {
    id: `req-${index}`,
    name: resolveRequestBlockName(state, section.separatorTitle),

    assertions: state.assertions,
    auth: inferAuthConfig(state.headers),
    body: state.bodyLines.join('\n').trim(),
    bodyFileRef: state.bodyFileRef,
    cookies: state.cookies,
    endLine: section.endLine,
    headers: state.headers,
    httpVersion: state.httpVersion,
    method: state.method,
    params: parseQueryParams(state.url),
    preComments: state.preComments,
    requestLine: state.requestLine,
    responseScript: state.scriptLines.join('\n').trim(),
    startLine: section.startLine,
    url: state.url,
  };
}

/**
 * Commits a non-empty `RawRequestSection` into `sections`.
 */
function commitSectionIfNonEmpty(
  sections: RawRequestSection[],
  section: RawRequestSection,
  endLine: number,
): void {
  if (!section.lines.some((line) => line.trim().length > 0)) return;

  section.endLine = Math.max(section.startLine, endLine);
  sections.push(section);
}

/**
 * Creates the initial mutable state for parsing a single request section.
 */
function createSectionParseState(requestLine: number): SectionParseState {
  return {
    assertions: [],
    bodyLines: [],
    cookies: [],
    explicitName: '',
    headers: [],
    inScript: false,
    method: 'GET',
    phase: 'pre',
    preComments: [],
    requestLine,
    scriptLines: [],
    url: '',
  };
}

/**
 * Checks whether a comment line is a `# @name` or `# @assert` directive and applies it to `state`.
 */
function handleCommentOrDirective(state: SectionParseState, trimmed: string): void {
  const directiveText = trimmed.replace(/^(?:#|\/\/)\s*/, '');

  if (tryApplyDirective(state, directiveText)) return;

  if (state.phase === 'pre') {
    state.preComments.push(trimmed);
  }
}

/**
 * Parses a line while inside the `headers` phase (between the request line and the blank line before body).
 */
function handleHeadersPhaseLine(state: SectionParseState, rawLine: string, trimmed: string): void {
  if (trimmed.length === 0) {
    state.phase = 'body';

    return;
  }

  if (['#', '//'].some((p) => trimmed.startsWith(p))) {
    handleCommentOrDirective(state, trimmed);

    return;
  }

  addRawHeaderLine(state, rawLine);
}

/**
 * Handles a line while `state.inScript` is active (`> {% ... %}`).
 */
function handleOpenScriptLine(state: SectionParseState, rawLine: string, trimmed: string): void {
  if (!trimmed.endsWith('%}')) {
    state.scriptLines.push(rawLine);

    return;
  }

  const beforeClose = rawLine.replace(/%\}\s*$/, '');

  if (beforeClose.trim().length > 0) {
    state.scriptLines.push(beforeClose);
  }

  state.inScript = false;
}

/**
 * Parses a line while inside the `pre` phase (before the `METHOD URL` request line is encountered).
 */
function handlePrePhaseLine(state: SectionParseState, trimmed: string, lineNumber: number): void {
  if (trimmed.length === 0) return;

  if (['#', '//'].some((p) => trimmed.startsWith(p))) {
    handleCommentOrDirective(state, trimmed);

    return;
  }

  tryParseRequestStartLine(state, trimmed, lineNumber);
}

/**
 * Parses a line inside the `> {% ... %}` response script block or starts one.
 */
function handleScriptOrBodyLine(state: SectionParseState, rawLine: string, trimmed: string): void {
  if (state.inScript) {
    handleOpenScriptLine(state, rawLine, trimmed);

    return;
  }

  if (trimmed.startsWith('> {%')) {
    startScriptBlock(state, trimmed.slice(4).trim());

    return;
  }

  processBodyContentLine(state, rawLine, trimmed);
}

/**
 * Parses an `@assert <target> <operator> [expected]` directive string into an `HttpAssertionRule` array.
 */
function parseAssertDirectiveList(rest: string): HttpAssertionRule[] {
  const tokens = rest.split(/\s+/);

  if (tokens.length < 2) return [];

  const target = tokens[0]!;
  const opCandidate = tokens[1] as HttpAssertionOperator;

  if (!ASSERT_OPERATORS.includes(opCandidate)) return [];

  const expected = rest.slice(target.length).trim().slice(opCandidate.length).trim();

  return [{ expected, operator: opCandidate, target }];
}

/**
 * Processes a non-script line inside the `body` phase (handling `# @assert`, `< ./file`, or raw body).
 */
function processBodyContentLine(state: SectionParseState, rawLine: string, trimmed: string): void {
  if (['# @assert ', '// @assert '].some((p) => trimmed.startsWith(p))) {
    handleCommentOrDirective(state, trimmed);

    return;
  }

  if (trimmed.startsWith('< ')) {
    setBodyFileRefOrLine(state, rawLine, trimmed);

    return;
  }

  state.bodyLines.push(rawLine);
}

/**
 * Processes one document line when splitting a `.http` file into `@variables` and `###` sections.
 */
function processDocumentSplitLine(
  splitState: DocumentSplitState,
  line: string,
  lineIndex: number,
): void {
  const trimmed = line.trim();

  if (tryCaptureFileVariable(splitState, trimmed)) return;

  if (trimmed.startsWith('###')) {
    commitSectionIfNonEmpty(splitState.sections, splitState.current, lineIndex - 1);
    splitState.current = {
      endLine: lineIndex,
      lines: [],
      separatorTitle: trimmed.slice(3).trim(),
      startLine: lineIndex,
    };

    return;
  }

  splitState.current.lines.push(line);
  splitState.current.endLine = lineIndex;
}

/**
 * Routes a single line within a request section according to the current section parse phase.
 */
function processSectionLine(state: SectionParseState, rawLine: string, lineNumber: number): void {
  const trimmed = rawLine.trim();

  if (state.phase === 'pre') {
    handlePrePhaseLine(state, trimmed, lineNumber);

    return;
  }

  if (state.phase === 'headers') {
    handleHeadersPhaseLine(state, rawLine, trimmed);

    return;
  }

  handleScriptOrBodyLine(state, rawLine, trimmed);
}

/**
 * Determines the human-readable display name for a parsed `HttpRequestBlock`.
 */
function resolveRequestBlockName(state: SectionParseState, separatorTitle: string): string {
  if (state.explicitName.length > 0) return state.explicitName;

  if (separatorTitle.length > 0) return separatorTitle;

  return `${state.method} ${state.url.split('?')[0]}`;
}

/**
 * Sets `bodyFileRef` when `< ./file` appears on the first body line, otherwise appends to `bodyLines`.
 */
function setBodyFileRefOrLine(state: SectionParseState, rawLine: string, trimmed: string): void {
  if (state.bodyLines.length === 0) {
    state.bodyFileRef = trimmed.slice(2).trim();

    return;
  }

  state.bodyLines.push(rawLine);
}

/**
 * Splits raw `.http` lines into file-level `@variables` and `###`-delimited `RawRequestSection` blocks.
 */
function splitDocumentIntoSections(lines: string[]): DocumentSplitState {
  const splitState: DocumentSplitState = {
    current: { endLine: 0, lines: [], separatorTitle: '', startLine: 0 },
    sections: [],
    variables: [],
  };

  for (let i = 0; i < lines.length; i++) {
    processDocumentSplitLine(splitState, lines[i]!, i);
  }

  commitSectionIfNonEmpty(splitState.sections, splitState.current, lines.length - 1);

  return splitState;
}

/**
 * Opens a `> {% ... %}` response script block on `state`.
 */
function startScriptBlock(state: SectionParseState, afterOpen: string): void {
  if (afterOpen.endsWith('%}')) {
    state.scriptLines.push(afterOpen.slice(0, -2).trim());

    return;
  }

  if (afterOpen.length > 0) {
    state.scriptLines.push(afterOpen);
  }

  state.inScript = true;
}

/**
 * Applies `@name` or `@assert` directives to `state` if `directiveText` matches.
 */
function tryApplyDirective(state: SectionParseState, directiveText: string): boolean {
  if (directiveText.startsWith('@name ')) {
    state.explicitName = directiveText.slice(6).trim();

    return true;
  }

  if (!directiveText.startsWith('@assert ')) return false;

  state.assertions.push(...parseAssertDirectiveList(directiveText.slice(8).trim()));

  return true;
}

/**
 * Captures a `@variable = value` line into `splitState.variables` if we are in the preamble.
 */
function tryCaptureFileVariable(splitState: DocumentSplitState, trimmed: string): boolean {
  if (splitState.current.lines.some((l) => l.trim().length > 0 && !l.trim().startsWith('#'))) {
    return false;
  }

  const varMatch = VARIABLE_LINE_REGEX.exec(trimmed);

  if (!varMatch) return false;

  splitState.variables.push({ enabled: true, key: varMatch[1]!, value: varMatch[2]!.trim() });

  return true;
}

/**
 * Attempts to parse `trimmed` as either `METHOD URL [HTTP/x]` or a shorthand GET URL.
 */
function tryParseRequestStartLine(
  state: SectionParseState,
  trimmed: string,
  lineNumber: number,
): void {
  const match = REQUEST_LINE_REGEX.exec(trimmed);

  if (match) {
    Object.assign(state, {
      httpVersion: match[3],
      method: match[1]!.toUpperCase(),
      phase: 'headers',
      requestLine: lineNumber,
      url: match[2]!,
    });

    return;
  }

  if (['http://', 'https://', '{{'].some((prefix) => trimmed.startsWith(prefix))) {
    Object.assign(state, {
      method: 'GET',
      phase: 'headers',
      requestLine: lineNumber,
      url: trimmed,
    });
  }
}

/**
 * Parses a raw `.http` or `.rest` file string into a structured `HttpDocumentModel`.
 *
 * @param text - Raw contents of the `.http` or `.rest` file.
 * @returns Parsed `HttpDocumentModel` containing `@variables` and decomposed `HttpRequestBlock` items.
 *
 * @example
 * ```ts
 * const doc = parseHttpDocument('@baseUrl = https://example.com\n\n### Get Users\nGET {{baseUrl}}/users\n');
 * // doc.requests[0]?.method === 'GET'
 * ```
 */
export function parseHttpDocument(text: string): HttpDocumentModel {
  const normalized = text.replaceAll('\r\n', '\n');
  const { sections, variables } = splitDocumentIntoSections(normalized.split('\n'));
  const requests: HttpRequestBlock[] = [];

  for (const section of sections) {
    const block = buildRequestBlock(section, requests.length);

    if (block) {
      requests.push(block);
    }
  }

  return { requests, variables };
}

/**
 * Accumulator state used while splitting a raw `.http` document into sections.
 */
interface DocumentSplitState {
  current: RawRequestSection;
  sections: RawRequestSection[];
  variables: HttpKeyValueRow[];
}

/**
 * Slice of lines belonging to a single `###`-delimited section in a `.http` document.
 */
interface RawRequestSection {
  endLine: number;
  lines: string[];
  separatorTitle: string;
  startLine: number;
}

/**
 * Mutable state machine state for parsing a single `RawRequestSection`.
 */
interface SectionParseState {
  assertions: HttpAssertionRule[];
  bodyFileRef?: string;
  bodyLines: string[];
  cookies: HttpKeyValueRow[];
  explicitName: string;
  headers: HttpKeyValueRow[];
  httpVersion?: string;
  inScript: boolean;
  method: string;
  phase: 'body' | 'headers' | 'pre';
  preComments: string[];
  requestLine: number;
  scriptLines: string[];
  url: string;
}
