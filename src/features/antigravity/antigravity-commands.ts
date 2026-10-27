import * as vscode from 'vscode';
import type { DisposableLike } from '../../types.ts';
import {
  buildEditorSelectionPayload,
  buildExplorerContextPayloads,
  selectDiagnosticForCursor,
} from './antigravity-context.ts';
import type { AntigravityFileContextPayload } from './antigravity-types.ts';

/**
 * Extracts file/folder context payloads from VS Code Explorer/Tab arguments and the active editor.
 */
function collectMenuFilePayloads(
  clickedResource?: vscode.Uri,
  selectedResources: readonly vscode.Uri[] = [],
): AntigravityFileContextPayload[] {
  const clickedUri = toUriString(clickedResource);
  const selectedUris = selectedResources.map(toUriString);
  const activeUri = toUriString(vscode.window.activeTextEditor?.document.uri);

  return buildExplorerContextPayloads(clickedUri, selectedUris, activeUri);
}

/**
 * Adds one or more files or folders from Explorer, Editor Tab, or active Editor to Antigravity Chat.
 */
async function handleAddFileToChat(
  clickedResource?: vscode.Uri,
  selectedResources?: readonly vscode.Uri[],
): Promise<void> {
  const payloads = collectMenuFilePayloads(clickedResource, selectedResources);

  if (payloads.length === 0) return;

  await vscode.commands.executeCommand('antigravity.addContext', ...payloads);
  await vscode.commands.executeCommand('antigravity.panel.focus');
}

/**
 * Adds the active editor's current selection (or file if nothing is selected) to Antigravity Chat.
 */
async function handleAddSelectionToChat(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) return;

  if (!editor.selection.isEmpty) {
    await vscode.commands.executeCommand('antigravity.insertSnippet');

    return;
  }

  const payload = buildEditorSelectionPayload({
    endLineZeroBased: editor.selection.end.line,
    isEmpty: editor.selection.isEmpty,
    startLineZeroBased: editor.selection.start.line,
    uri: editor.document.uri.toString(),
  });

  await vscode.commands.executeCommand('antigravity.addContext', payload);
  await vscode.commands.executeCommand('antigravity.panel.focus');
}

/**
 * Sends the diagnostic at the current cursor (or first problem in the file) to Antigravity Chat.
 */
async function handleExplainProblemInChat(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) return;

  const rawDiagnostics = vscode.languages.getDiagnostics(editor.document.uri);
  const snapshots = rawDiagnostics.map((d) => ({
    endLineZeroBased: d.range.end.line,
    message: d.message,
    startLineZeroBased: d.range.start.line,
  }));
  const matched = selectDiagnosticForCursor(
    editor.document.uri.toString(),
    editor.selection.active.line,
    snapshots,
  );

  if (!matched) {
    void vscode.window.showInformationMessage('No diagnostics found in the active file.');

    return;
  }

  await vscode.commands.executeCommand(
    'antigravity.explainAndFixProblem',
    matched.message,
    matched.range,
  );
  await vscode.commands.executeCommand('antigravity.panel.focus');
}

/**
 * Safely converts an optional `vscode.Uri` into its string representation.
 */
function toUriString(uri?: vscode.Uri): string {
  return uri ? uri.toString() : '';
}

/**
 * Registers the Antigravity right-click context menu commands (`addFileToChat`, `addSelectionToChat`, `explainProblem`).
 *
 * @returns Array of command `DisposableLike` subscriptions.
 *
 * @example
 * ```ts
 * const subs = registerAntigravityMenuCommands();
 * ```
 */
export function registerAntigravityMenuCommands(): DisposableLike[] {
  return [
    vscode.commands.registerCommand(
      'vscodeTailor.antigravity.addFileToChat',
      (clicked?: vscode.Uri, selected?: readonly vscode.Uri[]) =>
        handleAddFileToChat(clicked, selected),
    ),
    vscode.commands.registerCommand('vscodeTailor.antigravity.addSelectionToChat', () =>
      handleAddSelectionToChat(),
    ),
    vscode.commands.registerCommand('vscodeTailor.antigravity.explainProblem', () =>
      handleExplainProblemInChat(),
    ),
  ];
}
