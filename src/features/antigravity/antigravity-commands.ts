import * as vscode from 'vscode';
import type { DisposableLike } from '../../types.ts';
import {
  buildEditorSelectionPayload,
  buildExplorerContextPayloads,
  selectDiagnosticForCursor,
} from './antigravity-context.ts';

/**
 * Adds one or more files or folders from Explorer, Editor Tab, or active Editor to Antigravity Chat.
 */
async function handleAddFileToChat(
  clickedResource?: unknown,
  selectedResources?: unknown,
): Promise<void> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const payloads = buildExplorerContextPayloads(clickedResource, selectedResources, activeUri);

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
      (clicked?: unknown, selected?: unknown) => handleAddFileToChat(clicked, selected),
    ),
    vscode.commands.registerCommand('vscodeTailor.antigravity.addSelectionToChat', () =>
      handleAddSelectionToChat(),
    ),
    vscode.commands.registerCommand('vscodeTailor.antigravity.explainProblem', () =>
      handleExplainProblemInChat(),
    ),
  ];
}
