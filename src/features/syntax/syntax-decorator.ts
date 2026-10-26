import * as vscode from 'vscode';
import type { DisposableLike } from '../../types.ts';
import {
  detectSyntaxFormat,
  isSyntaxFormatEnabled,
  resolveTargetLanguageId,
} from './syntax-detector.ts';
import { groupSyntaxTokensByKind, tokenizeSyntaxDocument } from './syntax-tokenizer.ts';
import type {
  SyntaxFormat,
  SyntaxLanguageId,
  SyntaxSettings,
  SyntaxToken,
  SyntaxTokenKind,
} from './syntax-types.ts';

const MAX_DECORATED_LINES = 5000;

const SYNTAX_TOKEN_KINDS: readonly SyntaxTokenKind[] = [
  'anchor',
  'boolean',
  'comment',
  'datetime',
  'key',
  'null',
  'number',
  'section',
  'string',
];

const TOKEN_DECORATION_OPTIONS: Readonly<Record<SyntaxTokenKind, vscode.DecorationRenderOptions>> =
  {
    anchor: {
      dark: { color: '#C586C0' },
      light: { color: '#AF00DB' },
    },
    boolean: {
      dark: { color: '#569CD6' },
      light: { color: '#0000FF' },
    },
    comment: {
      dark: { color: '#6A9955', fontStyle: 'italic' },
      light: { color: '#008000', fontStyle: 'italic' },
    },
    datetime: {
      dark: { color: '#4EC9B0' },
      light: { color: '#267F99' },
    },
    key: {
      dark: { color: '#9CDCFE' },
      light: { color: '#0451A5' },
    },
    null: {
      dark: { color: '#569CD6' },
      light: { color: '#0000FF' },
    },
    number: {
      dark: { color: '#B5CEA8' },
      light: { color: '#098658' },
    },
    section: {
      dark: { color: '#569CD6', fontWeight: '600' },
      light: { color: '#0000FF', fontWeight: '600' },
    },
    string: {
      dark: { color: '#CE9178' },
      light: { color: '#A31515' },
    },
  };

/**
 * Applies grouped `SyntaxToken` ranges to a VS Code text editor's decoration types.
 */
function applyGroupedDecorations(
  editor: vscode.TextEditor,
  decorationMap: ReadonlyMap<SyntaxTokenKind, vscode.TextEditorDecorationType>,
  buckets: ReadonlyMap<SyntaxTokenKind, SyntaxToken[]>,
): void {
  for (const [kind, decorationType] of decorationMap.entries()) {
    const ranges = (buckets.get(kind) ?? []).map(toVscodeRange);

    editor.setDecorations(decorationType, ranges);
  }
}

/**
 * Clears all syntax token decorations from a text editor.
 */
function clearSyntaxDecorations(
  editor: vscode.TextEditor,
  decorationMap: ReadonlyMap<SyntaxTokenKind, vscode.TextEditorDecorationType>,
): void {
  for (const decorationType of decorationMap.values()) {
    editor.setDecorations(decorationType, []);
  }
}

/**
 * Creates the map of `SyntaxTokenKind` to `vscode.TextEditorDecorationType`.
 */
function createSyntaxDecorationMap(): Map<SyntaxTokenKind, vscode.TextEditorDecorationType> {
  const map = new Map<SyntaxTokenKind, vscode.TextEditorDecorationType>();

  for (const kind of SYNTAX_TOKEN_KINDS) {
    map.set(kind, vscode.window.createTextEditorDecorationType(TOKEN_DECORATION_OPTIONS[kind]));
  }

  return map;
}

/**
 * Disposes all items in an iterable of `DisposableLike` resources.
 */
function disposeAll(items: Iterable<DisposableLike>): void {
  for (const item of items) {
    item.dispose();
  }
}

/**
 * Upgrades a document's VS Code language ID once when opened with an unspecified or `plaintext` mode.
 */
function maybeUpgradeDocumentLanguage(
  document: vscode.TextDocument,
  settings: SyntaxSettings,
  upgradedUris: Set<string>,
): void {
  const uriKey = document.uri.toString();

  if (upgradedUris.has(uriKey)) return;

  const targetLangId = resolveTargetLanguageId(
    document.fileName,
    document.languageId,
    settings.fileAssociations,
  );

  if (!targetLangId) return;

  upgradedUris.add(uriKey);
  void vscode.languages.setTextDocumentLanguage(document, targetLangId);
}

/**
 * Reads the current `vscodeTailor.syntax` enablement flags and custom file associations from VS Code configuration.
 */
function readSyntaxSettings(): SyntaxSettings {
  const config = vscode.workspace.getConfiguration('vscodeTailor.syntax');

  return {
    fileAssociations: config.get<Record<string, SyntaxLanguageId>>('fileAssociations', {}),
    jsonEnabled: config.get<boolean>('json.enabled', true),
    tomlEnabled: config.get<boolean>('toml.enabled', true),
    yamlEnabled: config.get<boolean>('yaml.enabled', true),
  };
}

/**
 * Refreshes syntax decorations and language IDs across all currently visible text editors.
 */
function refreshAllVisibleEditors(state: SyntaxControllerState): void {
  const settings = readSyntaxSettings();

  for (const editor of vscode.window.visibleTextEditors) {
    refreshSingleEditor(editor, state, settings);
  }
}

/**
 * Applies or clears TOML, JSON, or YAML syntax decorations on a single text editor.
 */
function refreshSingleEditor(
  editor: vscode.TextEditor,
  state: SyntaxControllerState,
  settings: SyntaxSettings,
): void {
  const format = resolveEnabledEditorFormat(editor.document, settings);

  if (!format) {
    clearSyntaxDecorations(editor, state.decorationMap);

    return;
  }

  maybeUpgradeDocumentLanguage(editor.document, settings, state.upgradedUris);
  // shortcut: full-document decoration scan caps at 5k lines; switch to visibleRanges if needed
  if (editor.document.lineCount > MAX_DECORATED_LINES) return;

  const tokens = tokenizeSyntaxDocument(editor.document.getText(), format);
  const buckets = groupSyntaxTokensByKind(tokens);

  applyGroupedDecorations(editor, state.decorationMap, buckets);
}

/**
 * Resolves the active `SyntaxFormat` for a document if that format is currently enabled.
 */
function resolveEnabledEditorFormat(
  document: vscode.TextDocument,
  settings: SyntaxSettings,
): SyntaxFormat | null {
  const format = detectSyntaxFormat(
    document.fileName,
    document.languageId,
    settings.fileAssociations,
  );

  if (!format) return null;

  return isSyntaxFormatEnabled(format, settings) ? format : null;
}

/**
 * Converts a `SyntaxToken` into a `vscode.Range`.
 */
function toVscodeRange(token: SyntaxToken): vscode.Range {
  return new vscode.Range(
    new vscode.Position(token.line, token.startChar),
    new vscode.Position(token.line, token.endChar),
  );
}

/**
 * Creates and activates the TOML, JSON, and YAML syntax highlighting controller.
 *
 * @returns A `DisposableLike` that disposes all editor listeners and token decorations on deactivation.
 *
 * @example
 * ```ts
 * const controller = createSyntaxHighlightController();
 * controller.dispose();
 * ```
 */
export function createSyntaxHighlightController(): DisposableLike {
  const _: SyntaxControllerState = {
    decorationMap: createSyntaxDecorationMap(),
    subscriptions: [],
    upgradedUris: new Set<string>(),
  };

  const refresh = (): void => {
    refreshAllVisibleEditors(_);
  };

  _.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refresh()),
    vscode.window.onDidChangeVisibleTextEditors(() => refresh()),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const settings = readSyntaxSettings();

      if (!resolveEnabledEditorFormat(event.document, settings)) return;

      refresh();
    }),
    vscode.workspace.onDidOpenTextDocument(() => refresh()),
    vscode.workspace.onDidChangeConfiguration(() => refresh()),
  );
  refresh();

  return {
    dispose() {
      disposeAll(_.subscriptions);
      disposeAll(_.decorationMap.values());
      _.upgradedUris.clear();
    },
  };
}

/**
 * Internal state container for the syntax highlight controller closure.
 */
interface SyntaxControllerState {
  decorationMap: Map<SyntaxTokenKind, vscode.TextEditorDecorationType>;
  subscriptions: vscode.Disposable[];
  upgradedUris: Set<string>;
}
