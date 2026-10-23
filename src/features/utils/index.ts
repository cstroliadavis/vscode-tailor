import * as vscode from 'vscode';
import type { DisposableLike, TailorFeatureModule } from '../../types.ts';
import { convertHttpText } from './utils-http-convert.ts';
import {
  smartSortText,
  toggleBase64,
  toggleHtml,
  toggleUrl,
  toUpperKebabCase,
  toUpperSnakeCase,
} from './utils-transforms.ts';

const DELEGATED_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['vscodeTailor.utils.sortLinesAsc', 'editor.action.sortLinesAscending'],
  ['vscodeTailor.utils.sortLinesDesc', 'editor.action.sortLinesDescending'],
  ['vscodeTailor.utils.sortImports', 'editor.action.organizeImports'],
  ['vscodeTailor.utils.caseSnake', 'editor.action.transformToSnakecase'],
  ['vscodeTailor.utils.caseKebab', 'editor.action.transformToKebabcase'],
  ['vscodeTailor.utils.caseCamel', 'editor.action.transformToCamelcase'],
  ['vscodeTailor.utils.casePascal', 'editor.action.transformToPascalcase'],
  ['vscodeTailor.utils.caseTitle', 'editor.action.transformToTitlecase'],
  ['vscodeTailor.utils.caseUpper', 'editor.action.transformToUppercase'],
  ['vscodeTailor.utils.caseLower', 'editor.action.transformToLowercase'],
];

const TRANSFORM_COMMANDS: readonly TransformCommandSpec[] = [
  { id: 'vscodeTailor.utils.sortSmart', transform: smartSortText, wordFallback: false },
  { id: 'vscodeTailor.utils.base64Toggle', transform: toggleBase64, wordFallback: false },
  { id: 'vscodeTailor.utils.urlToggle', transform: toggleUrl, wordFallback: false },
  { id: 'vscodeTailor.utils.htmlToggle', transform: toggleHtml, wordFallback: false },
  {
    id: 'vscodeTailor.utils.httpToCurl',
    transform: (text) => convertHttpText(text, 'curl'),
    wordFallback: false,
  },
  {
    id: 'vscodeTailor.utils.httpToFetch',
    transform: (text) => convertHttpText(text, 'fetch'),
    wordFallback: false,
  },
  {
    id: 'vscodeTailor.utils.httpToHttpFile',
    transform: (text) => convertHttpText(text, 'http'),
    wordFallback: false,
  },
  { id: 'vscodeTailor.utils.caseUpperSnake', transform: toUpperSnakeCase, wordFallback: true },
  { id: 'vscodeTailor.utils.caseUpperKebab', transform: toUpperKebabCase, wordFallback: true },
];

/**
 * Applies a pure text transformation to all active selections (or current line/word when empty).
 */
async function applyEditorTransform(spec: TransformCommandSpec): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) return;

  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      const range = resolveTargetRange(editor.document, selection, spec.wordFallback);
      const nextText = spec.transform(editor.document.getText(range));

      editBuilder.replace(range, nextText);
    }
  });
}

/**
 * Registers all delegated and custom transform commands for the Utils module.
 */
function registerAllUtilsCommands(): DisposableLike[] {
  const disposables: DisposableLike[] = [];

  for (const [commandId, builtInId] of DELEGATED_COMMANDS) {
    disposables.push(
      vscode.commands.registerCommand(commandId, () => vscode.commands.executeCommand(builtInId)),
    );
  }

  for (const spec of TRANSFORM_COMMANDS) {
    disposables.push(vscode.commands.registerCommand(spec.id, () => applyEditorTransform(spec)));
  }

  return disposables;
}

/**
 * Resolves the fallback range when the cursor has no active selection.
 */
function resolveEmptySelectionRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  wordFallback: boolean,
): vscode.Range {
  const lineRange = document.lineAt(position.line).range;

  if (!wordFallback) return lineRange;

  return document.getWordRangeAtPosition(position) ?? lineRange;
}

/**
 * Resolves the target range for a selection, falling back to the word at cursor or current line.
 */
function resolveTargetRange(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  wordFallback: boolean,
): vscode.Range {
  if (!selection.isEmpty) return selection;

  return resolveEmptySelectionRange(document, selection.active, wordFallback);
}

/**
 * Creates the Text & HTTP Utilities (`utils`) feature module for `vscode-tailor`.
 *
 * @returns A `TailorFeatureModule` providing context-menu sorting, encoding, HTTP, and case tools.
 *
 * @example
 * ```ts
 * registry.register(createUtilsFeatureModule());
 * ```
 */
export function createUtilsFeatureModule(): TailorFeatureModule {
  return {
    id: 'utils',
    name: 'Text & HTTP Utilities',

    description:
      'Context menu utilities for smart sorting, Base64/URL/HTML encoding, cURL/fetch/.http conversion, and case transforms.',
    settingKey: 'vscodeTailor.utils.enabled',

    activate(): DisposableLike[] {
      return registerAllUtilsCommands();
    },
  };
}

/**
 * Configuration specification for an editor text transformation command.
 */
interface TransformCommandSpec {
  id: string;

  transform(text: string): string;
  wordFallback: boolean;
}
