import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseHttpDocument } from './http-parser.ts';
import type { HttpSecretProvider } from './http-secret-adapter.ts';
import { loadDirectoryEnvironmentConfig } from './http-secret-adapter.ts';
import type { HttpRequestBlock } from './http-types.ts';
import { resolveTemplateVariables } from './http-variable-resolver.ts';

/**
 * Builds the `CodeLens` array for a parsed `.http` document.
 */
function buildRequestCodeLenses(
  uri: vscode.Uri,
  requests: readonly HttpRequestBlock[],
): vscode.CodeLens[] {
  const lenses: vscode.CodeLens[] = [];

  if (requests.length > 1) {
    const firstLine = requests[0]!.startLine;

    lenses.push(
      new vscode.CodeLens(new vscode.Range(firstLine, 0, firstLine, 0), {
        arguments: [uri],
        command: 'vscodeTailor.http.runAllInFile',
        title: '▶▶ Run All Requests',
      }),
    );
  }

  for (const req of requests) {
    lenses.push(
      new vscode.CodeLens(new vscode.Range(req.requestLine, 0, req.requestLine, 0), {
        arguments: [uri, req.id],
        command: 'vscodeTailor.http.runSingleRequest',
        title: `▶ Run ${req.method} (${req.name})`,
      }),
    );
  }

  return lenses;
}

/**
 * Finds the `{{...}}` placeholder under the given character offset on a line.
 */
function findPlaceholderAtColumn(
  lineText: string,
  character: number,
): { end: number; rawExpr: string; start: number } | null {
  for (const match of lineText.matchAll(/\{\{([^}]+)\}\}/g)) {
    const start = match.index;
    const end = start + match[0].length;

    if (isWithinBounds(character, start, end)) return { end, rawExpr: match[0], start };
  }

  return null;
}

/**
 * Formats the hover markdown preview for a resolved `{{...}}` expression.
 */
function formatHoverMarkdown(rawExpr: string, resolved: string): vscode.MarkdownString {
  const shouldMask = isSecretExpression(rawExpr) && resolved !== rawExpr;
  const display = shouldMask ? '•••••••• (resolved secret)' : resolved;
  const md = new vscode.MarkdownString();

  md.appendMarkdown(`**Tailor HTTP Variable** \`${rawExpr}\`\n\n`);
  md.appendCodeblock(display, 'text');

  return md;
}

/**
 * Checks whether a document is an `.http` or `.rest` file.
 */
function isHttpTextDocument(document: vscode.TextDocument): boolean {
  const ext = path.extname(document.uri.fsPath).toLowerCase();

  return ['.http', '.rest'].includes(ext) || document.languageId === 'http';
}

/**
 * Checks whether a `{{...}}` expression references `$keychain` or `$secret`.
 */
function isSecretExpression(rawExpr: string): boolean {
  return rawExpr.includes('$keychain') || rawExpr.includes('$secret');
}

/**
 * Checks whether `character` falls inclusively between `start` and `end`.
 */
function isWithinBounds(character: number, start: number, end: number): boolean {
  return character >= start && character <= end;
}

/**
 * Creates a `CodeLensProvider` for `.http` and `.rest` files (`▶ Run Request` and `▶▶ Run All Requests`).
 *
 * @returns Configured `vscode.CodeLensProvider`.
 *
 * @example
 * ```ts
 * const provider = createHttpCodeLensProvider();
 * ```
 */
export function createHttpCodeLensProvider(): vscode.CodeLensProvider {
  return {
    provideCodeLenses(document) {
      if (!isHttpTextDocument(document)) return [];

      const parsed = parseHttpDocument(document.getText());

      return buildRequestCodeLenses(document.uri, parsed.requests);
    },
  };
}

/**
 * Creates a `HoverProvider` for `.http` and `.rest` files that previews resolved `{{variable}}` values.
 *
 * @param getActiveEnvironment - Callback returning the currently selected environment name.
 * @param getGlobalVariables - Callback returning current `client.global` runtime variables.
 * @param secrets - Secret provider for `{{$keychain}}` and `{{$secret}}` resolution.
 * @returns Configured `vscode.HoverProvider`.
 *
 * @example
 * ```ts
 * const hover = createHttpVariableHoverProvider(() => 'dev', () => ({}), secretProvider);
 * ```
 */
export function createHttpVariableHoverProvider(
  getActiveEnvironment: () => string | null,
  getGlobalVariables: () => Record<string, string>,
  secrets: HttpSecretProvider,
): vscode.HoverProvider {
  return {
    async provideHover(document, position) {
      if (!isHttpTextDocument(document)) return null;

      const lineText = document.lineAt(position.line).text;
      const hit = findPlaceholderAtColumn(lineText, position.character);

      if (!hit) return null;

      const parsed = parseHttpDocument(document.getText());
      const envConfig = await loadDirectoryEnvironmentConfig(
        path.dirname(document.uri.fsPath),
        getActiveEnvironment(),
      );
      const resolved = await resolveTemplateVariables(hit.rawExpr, {
        activeEnv: envConfig.activeEnvironment,
        dotenvVariables: envConfig.dotenvVariables,
        fileVariables: parsed.variables,
        globalVariables: getGlobalVariables(),
        httpClientEnv: envConfig.httpClientEnv,
        httpClientPrivateEnv: envConfig.httpClientPrivateEnv,
        resolveKeychain: secrets.getKeychainPassword,
        resolveSecret: secrets.getSecretStorage,
      });

      return new vscode.Hover(
        formatHoverMarkdown(hit.rawExpr, resolved),
        new vscode.Range(position.line, hit.start, position.line, hit.end),
      );
    },
  };
}
