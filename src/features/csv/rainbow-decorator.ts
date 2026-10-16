import * as vscode from 'vscode';
import type { CsvCellToken, DisposableLike } from '../../types.ts';
import { scanCsvCellTokens } from './csv-parser.ts';
import {
  buildHoverMarkdown,
  groupTokensByColumnBucket,
  RAINBOW_COLORS,
} from './rainbow-helpers.ts';

/**
 * Applies bucketed token ranges to a text editor's decoration types.
 */
function applyBucketRanges(
  editor: vscode.TextEditor,
  decorationTypes: vscode.TextEditorDecorationType[],
  buckets: Map<number, CsvCellToken[]>,
): void {
  for (let i = 0; i < decorationTypes.length; i += 1) {
    const ranges = (buckets.get(i) ?? []).map(toVscodeRange);

    editor.setDecorations(decorationTypes[i]!, ranges);
  }
}

/**
 * Applies column color decorations to a single visible `.csv` text editor.
 */
function applyEditorDecorations(
  editor: vscode.TextEditor,
  decorationTypes: vscode.TextEditorDecorationType[],
  rainbowEnabled: boolean,
): void {
  if (!shouldDecorateEditor(editor, rainbowEnabled)) {
    clearEditorDecorations(editor, decorationTypes);

    return;
  }

  const tokens = scanCsvCellTokens(editor.document.getText());
  const buckets = groupTokensByColumnBucket(tokens, decorationTypes.length);

  applyBucketRanges(editor, decorationTypes, buckets);
}

/**
 * Clears all rainbow decorations from a text editor.
 */
function clearEditorDecorations(
  editor: vscode.TextEditor,
  decorationTypes: vscode.TextEditorDecorationType[],
): void {
  for (const decorationType of decorationTypes) {
    editor.setDecorations(decorationType, []);
  }
}

/**
 * Creates the VS Code text editor decoration types for each color in `RAINBOW_COLORS`.
 */
function createDecorationTypes(): vscode.TextEditorDecorationType[] {
  return RAINBOW_COLORS.map((color) =>
    vscode.window.createTextEditorDecorationType({
      color,
    }),
  );
}

/**
 * Creates the hover provider for `.csv` documents when Rainbow CSV is enabled.
 */
function createHoverDisposable(): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    { pattern: '**/*.csv' },
    {
      provideHover: (document, position) => resolveCsvHover(document, position),
    },
  );
}

/**
 * Disposes all items in a list of VS Code disposables.
 */
function disposeAll(items: DisposableLike[]): void {
  for (const item of items) {
    item.dispose();
  }
}

/**
 * Checks whether a VS Code text document represents a `.csv` file.
 */
function isCsvDocument(document: vscode.TextDocument): boolean {
  if (document.languageId === 'csv') return true;

  return document.fileName.toLowerCase().endsWith('.csv');
}

/**
 * Reads the current `vscodeTailor.csv` configuration values for Rainbow CSV.
 */
function readRainbowSettings(): { defaultHeaderRows: number; rainbowEnabled: boolean } {
  const config = vscode.workspace.getConfiguration('vscodeTailor.csv');

  return {
    defaultHeaderRows: config.get<number>('defaultHeaderRows', 1),
    rainbowEnabled: config.get<boolean>('rainbowEnabled', true),
  };
}

/**
 * Refreshes rainbow column decorations across all currently visible text editors.
 */
function refreshAllVisibleEditors(decorationTypes: vscode.TextEditorDecorationType[]): void {
  const { rainbowEnabled } = readRainbowSettings();

  for (const editor of vscode.window.visibleTextEditors) {
    applyEditorDecorations(editor, decorationTypes, rainbowEnabled);
  }
}

/**
 * Resolves a VS Code hover tooltip for a CSV cell under the cursor.
 */
function resolveCsvHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | null {
  const { defaultHeaderRows, rainbowEnabled } = readRainbowSettings();

  if (!rainbowEnabled) return null;

  const md = buildHoverMarkdown(document.getText(), {
    character: position.character,
    headerRowCount: defaultHeaderRows,
    line: position.line,
  });

  return md ? new vscode.Hover(new vscode.MarkdownString(md)) : null;
}

/**
 * Checks whether an editor should receive Rainbow CSV column decorations.
 */
function shouldDecorateEditor(editor: vscode.TextEditor, rainbowEnabled: boolean): boolean {
  if (!rainbowEnabled) return false;

  return isCsvDocument(editor.document);
}

/**
 * Converts a `CsvCellToken` into a `vscode.Range`.
 */
function toVscodeRange(token: CsvCellToken): vscode.Range {
  return new vscode.Range(
    new vscode.Position(token.startLine, token.startChar),
    new vscode.Position(token.endLine, token.endChar),
  );
}

/**
 * Creates and activates the Rainbow CSV text decorator and hover provider.
 *
 * @returns A `DisposableLike` that cleans up all decorations and editor listeners on deactivation.
 *
 * @example
 * ```ts
 * const disposable = createRainbowCsvController();
 * ```
 */
export function createRainbowCsvController(): DisposableLike {
  const _ = {
    decorationTypes: createDecorationTypes(),
    subscriptions: [] as vscode.Disposable[],
  };

  const refresh = (): void => {
    refreshAllVisibleEditors(_.decorationTypes);
  };

  _.subscriptions.push(
    createHoverDisposable(),
    vscode.window.onDidChangeActiveTextEditor(() => refresh()),
    vscode.window.onDidChangeVisibleTextEditors(() => refresh()),
    vscode.workspace.onDidChangeTextDocument(() => refresh()),
    vscode.workspace.onDidChangeConfiguration(() => refresh()),
  );
  refresh();

  return {
    dispose() {
      disposeAll(_.subscriptions);
      disposeAll(_.decorationTypes);
    },
  };
}
