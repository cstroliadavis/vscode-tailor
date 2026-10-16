import * as vscode from 'vscode';
import type { DisposableLike, TailorFeatureModule } from '../../types.ts';
import { createCsvGridEditorProvider } from './csv-grid-provider.ts';
import { createRainbowCsvController } from './rainbow-decorator.ts';

const CSV_GRID_VIEW_TYPE = 'vscodeTailor.csvGrid';

/**
 * Extracts the URI from the currently active tab input if it has a `uri` property.
 */
function resolveActiveTabUri(): vscode.Uri | undefined {
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const input = activeTab?.input as { uri?: vscode.Uri } | undefined;

  return input?.uri;
}

/**
 * Resolves the target document URI from a command argument or the active editor tab.
 */
function resolveTargetUri(resourceUri?: vscode.Uri): vscode.Uri | undefined {
  if (resourceUri) return resourceUri;

  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor) return activeEditor.document.uri;

  return resolveActiveTabUri();
}

/**
 * Reopens the target `.csv` file in the specified VS Code editor view type.
 */
async function switchCsvEditorView(viewId: string, resourceUri?: vscode.Uri): Promise<void> {
  const targetUri = resolveTargetUri(resourceUri);

  if (!targetUri) return;

  await vscode.commands.executeCommand('vscode.openWith', targetUri, viewId);
}

/**
 * Creates the CSV Workbench feature module for `vscode-tailor`.
 *
 * @param extensionUri - Root URI of the `vscode-tailor` extension.
 * @returns A `TailorFeatureModule` providing the CSV Grid Custom Editor and Rainbow CSV decorator.
 *
 * @example
 * ```ts
 * registry.register(createCsvFeatureModule(context.extensionUri));
 * ```
 */
export function createCsvFeatureModule(extensionUri: vscode.Uri): TailorFeatureModule {
  return {
    id: 'csv',
    name: 'CSV Workbench (Grid View + Rainbow CSV)',

    description:
      'Interactive CSV Grid Custom Editor with multi-row headers, real sorting, view filtering, and Rainbow CSV text highlighting.',
    settingKey: 'vscodeTailor.csv.enabled',

    activate(): DisposableLike[] {
      const gridProvider = createCsvGridEditorProvider(extensionUri);
      const customEditorSub = vscode.window.registerCustomEditorProvider(
        CSV_GRID_VIEW_TYPE,
        gridProvider,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      );
      const rainbowSub = createRainbowCsvController();
      const toTextCmd = vscode.commands.registerCommand(
        'vscodeTailor.csv.switchToText',
        (uri?: vscode.Uri) => switchCsvEditorView('default', uri),
      );
      const toGridCmd = vscode.commands.registerCommand(
        'vscodeTailor.csv.switchToGrid',
        (uri?: vscode.Uri) => switchCsvEditorView(CSV_GRID_VIEW_TYPE, uri),
      );

      return [customEditorSub, rainbowSub, toTextCmd, toGridCmd];
    },
  };
}
