import type {
  AntigravityFileContextPayload,
  AntigravityProblemRangePayload,
  DiagnosticSnapshot,
  EditorSelectionSnapshot,
} from './antigravity-types.ts';

/**
 * Normalizes and deduplicates non-empty URI strings while preserving order.
 */
function deduplicateUris(uris: readonly (string | undefined)[]): string[] {
  const cleaned = uris.map((u) => (u ?? '').trim()).filter(Boolean);

  return [...new Set(cleaned)];
}

/**
 * Checks whether a diagnostic span overlaps a 0-based cursor line.
 */
function isDiagnosticAtLine(diag: DiagnosticSnapshot, line: number): boolean {
  return line >= diag.startLineZeroBased && line <= diag.endLineZeroBased;
}

/**
 * Resolves the prioritized list of target URI strings from Explorer multi-select, single-click, or active editor.
 */
function resolveCandidateUris(
  clickedUri?: string,
  selectedUris: readonly string[] = [],
  activeEditorUri?: string,
): string[] {
  const multi = deduplicateUris(selectedUris);

  if (multi.length > 0) return multi;

  return deduplicateUris([clickedUri, activeEditorUri]).slice(0, 1);
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
 * @param clickedUri - Primary resource URI passed by VS Code menu invocation.
 * @param selectedUris - Optional array of multi-selected Explorer resource URIs.
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
  clickedUri?: string,
  selectedUris?: readonly string[],
  activeEditorUri?: string,
): AntigravityFileContextPayload[] {
  const uris = resolveCandidateUris(clickedUri, selectedUris, activeEditorUri);

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
