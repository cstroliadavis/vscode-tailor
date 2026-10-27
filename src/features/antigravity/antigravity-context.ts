import type {
  AntigravityFileContextPayload,
  AntigravityProblemRangePayload,
  DiagnosticSnapshot,
  EditorSelectionSnapshot,
} from './antigravity-types.ts';

/**
 * Normalizes and deduplicates non-empty URI strings while preserving order.
 */
function deduplicateUris(uris: readonly string[]): string[] {
  const cleaned = uris.map((u) => u.trim()).filter(Boolean);

  return [...new Set(cleaned)];
}

/**
 * Safely extracts an array of URI strings when `value` is an array of strings or URI-like objects.
 */
function extractUriList(value: unknown): string[] {
  return Array.isArray(value) ? deduplicateUris(value.map(extractUriString)) : [];
}

/**
 * Safely extracts a URI string from a string or a VS Code `Uri`-like object (`{ scheme: string }`).
 */
function extractUriString(value: unknown): string {
  if (typeof value === 'string') return value.trim();

  if (isUriLike(value)) return String(value).trim();

  return '';
}

/**
 * Checks whether a diagnostic span overlaps a 0-based cursor line.
 */
function isDiagnosticAtLine(diag: DiagnosticSnapshot, line: number): boolean {
  return line >= diag.startLineZeroBased && line <= diag.endLineZeroBased;
}

/**
 * Checks whether an unknown value is a VS Code `Uri`-like object with a string `scheme`.
 */
function isUriLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  return typeof (value as { scheme?: unknown }).scheme === 'string';
}

/**
 * Resolves the prioritized list of target URI strings from Explorer multi-select, single-click, or active editor.
 */
function resolveCandidateUris(
  clickedResource?: unknown,
  selectedResources?: unknown,
  activeEditorUri?: unknown,
): string[] {
  const multi = extractUriList(selectedResources);

  if (multi.length > 0) return multi;

  const single = deduplicateUris([
    extractUriString(clickedResource),
    extractUriString(activeEditorUri),
  ]);

  return single.slice(0, 1);
}

/**
 * Builds an `AntigravityFileContextPayload` for the active editor's selection (or full file when empty).
 *
 * @param snapshot - Pure snapshot of the active editor's URI and 0-based selection line numbers.
 * @returns A payload ready for `antigravity.addContext`.
 *
 * @example
 * ```ts
 * buildEditorSelectionPayload({
 *   endLineZeroBased: 9,
 *   isEmpty: false,
 *   startLineZeroBased: 4,
 *   uri: 'file:///repo/main.tf',
 * }); // => { range: { endLineNumber: 10, startLineNumber: 5 }, type: 'file', uri: 'file:///repo/main.tf' }
 * ```
 */
export function buildEditorSelectionPayload(
  snapshot: EditorSelectionSnapshot,
): AntigravityFileContextPayload {
  if (snapshot.isEmpty) return { type: 'file', uri: snapshot.uri };

  return {
    range: {
      endLineNumber: snapshot.endLineZeroBased + 1,
      startLineNumber: snapshot.startLineZeroBased + 1,
    },
    type: 'file',
    uri: snapshot.uri,
  };
}

/**
 * Builds deduplicated `AntigravityFileContextPayload` items from Explorer, tab, or editor context arguments.
 *
 * @param clickedResource - Primary resource URI (or string) passed by VS Code menu invocation.
 * @param selectedResources - Optional array of multi-selected Explorer URIs (or non-array tab/editor context metadata).
 * @param activeEditorUri - Fallback URI of the currently active text editor.
 * @returns Ordered list of file/folder context payloads for `antigravity.addContext`.
 *
 * @example
 * ```ts
 * buildExplorerContextPayloads('file:///repo/a.ts', ['file:///repo/a.ts', 'file:///repo/b.ts']);
 * // => [{ type: 'file', uri: 'file:///repo/a.ts' }, { type: 'file', uri: 'file:///repo/b.ts' }]
 * ```
 */
export function buildExplorerContextPayloads(
  clickedResource?: unknown,
  selectedResources?: unknown,
  activeEditorUri?: unknown,
): AntigravityFileContextPayload[] {
  const uris = resolveCandidateUris(clickedResource, selectedResources, activeEditorUri);

  return uris.map((uri) => ({ type: 'file', uri }));
}

/**
 * Selects the best matching diagnostic at `cursorLineZeroBased` (or falls back to the first diagnostic in the file).
 *
 * @param uri - Stringified document URI.
 * @param cursorLineZeroBased - Current 0-based cursor line in the editor.
 * @param diagnostics - All diagnostics reported on the document.
 * @returns The matched message and range payload for `antigravity.explainAndFixProblem`, or `null` if none exist.
 *
 * @example
 * ```ts
 * selectDiagnosticForCursor('file:///repo/main.tf', 12, [
 *   { endLineZeroBased: 12, message: 'Unexpected token', startLineZeroBased: 12 },
 * ]); // => { message: 'Unexpected token', range: { absoluteUri: 'file:///repo/main.tf', endLine: 12, startLine: 12 } }
 * ```
 */
export function selectDiagnosticForCursor(
  uri: string,
  cursorLineZeroBased: number,
  diagnostics: readonly DiagnosticSnapshot[],
): { message: string; range: AntigravityProblemRangePayload } | null {
  if (diagnostics.length === 0) return null;

  const chosen =
    diagnostics.find((d) => isDiagnosticAtLine(d, cursorLineZeroBased)) ?? diagnostics[0]!;

  return {
    message: chosen.message,
    range: {
      absoluteUri: uri,
      endLine: chosen.endLineZeroBased,
      startLine: chosen.startLineZeroBased,
    },
  };
}
