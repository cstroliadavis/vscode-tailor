import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseHttpDocument } from './http-parser.ts';
import type { HttpExecutionOptions } from './http-runner.ts';
import { executeAllHttpRequests, executeHttpRequest } from './http-runner.ts';
import type { HttpSecretProvider } from './http-secret-adapter.ts';
import { loadDirectoryEnvironmentConfig } from './http-secret-adapter.ts';
import { serializeHttpDocument } from './http-serializer.ts';
import type {
  HttpDocumentModel,
  HttpExtensionToWebviewMessage,
  HttpKeyValueRow,
  HttpRequestBlock,
  HttpResponseSnapshot,
  HttpWebviewToExtensionMessage,
} from './http-types.ts';
import { buildHttpWorkbenchHtml } from './http-webview-html.ts';

/**
 * Applies a serialized `.http` string replacement across the entire `vscode.TextDocument`.
 */
async function applyFullDocumentText(
  document: vscode.TextDocument,
  nextText: string,
): Promise<void> {
  if (document.getText() === nextText) return;

  const edit = new vscode.WorkspaceEdit();
  const lastLine = Math.max(0, document.lineCount - 1);
  const lastChar = document.lineAt(lastLine).text.length;
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(lastLine, lastChar),
  );

  edit.replace(document.uri, fullRange, nextText);
  await vscode.workspace.applyEdit(edit);
}

/**
 * Generates a cryptographic nonce string for Webview Content Security Policy scripts.
 */
function createCspNonce(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/**
 * Executes a single request or all requests in `document` and returns the results.
 */
async function executeDocumentRequests(
  document: vscode.TextDocument,
  runtime: HttpWorkbenchRuntime,
  requestId?: string,
): Promise<HttpResponseSnapshot[]> {
  const baseDir = path.dirname(document.uri.fsPath);
  const parsed = parseHttpDocument(document.getText());
  const envConfig = await loadDirectoryEnvironmentConfig(baseDir, runtime.getActiveEnvironment());
  const runnerOpts: HttpExecutionOptions = {
    cookieJar: runtime.cookieJar,
    readExternalFile: async (relPath: string) => {
      try {
        return await fs.readFile(path.resolve(baseDir, relPath), 'utf8');
      } catch {
        return undefined;
      }
    },
    variableContext: {
      activeEnv: envConfig.activeEnvironment,
      dotenvVariables: envConfig.dotenvVariables,
      fileVariables: parsed.variables,
      globalVariables: runtime.globalVariables,
      httpClientEnv: envConfig.httpClientEnv,
      httpClientPrivateEnv: envConfig.httpClientPrivateEnv,
      resolveKeychain: runtime.secrets.getKeychainPassword,
      resolveSecret: runtime.secrets.getSecretStorage,
    },
  };

  if (requestId) {
    const target = resolveTargetRequest(parsed.requests, requestId);

    return target ? [await executeHttpRequest(target, runnerOpts)] : [];
  }

  return executeAllHttpRequests(parsed, runnerOpts);
}

/**
 * Extracts the basename of a URI path for display in the HTTP Workbench toolbar.
 */
function extractFileName(uri: vscode.Uri): string {
  const segments = uri.path.split('/');

  return segments.at(-1) ?? 'requests.http';
}

/**
 * Formats a single `HttpResponseSnapshot` for the VS Code OutputChannel log.
 */
function formatOutputChannelEntry(res: HttpResponseSnapshot): string {
  const testLines = res.assertionResults.map(
    (t) => `  [${t.passed ? 'PASS' : 'FAIL'}] ${t.label}${t.message ? `: ${t.message}` : ''}`,
  );
  const testsSection = testLines.length > 0 ? `\nTests:\n${testLines.join('\n')}\n` : '';

  return [
    `=== ${res.requestName} (${res.resolvedMethod} ${res.resolvedUrl}) ===`,
    `Status: ${res.status} ${res.statusText} (${res.durationMs} ms, ${res.sizeBytes} B)`,
    testsSection,
    res.body,
    '',
  ].join('\n');
}

/**
 * Dispatches execution or document update messages from the HTTP Workbench Webview.
 */
async function handleActionMessage(
  session: HttpEditorSession,
  message: Exclude<HttpWebviewToExtensionMessage, { type: 'ready' | 'switchToText' }>,
): Promise<void> {
  if (message.type === 'updateDocument') {
    await persistUpdatedDocument(session, message.model);

    return;
  }

  if (message.type === 'selectEnvironment') {
    session.runtime.setActiveEnvironment(message.envName);
    await postDocumentSync(session);

    return;
  }

  await handleRunOrClearMessage(session, message);
}

/**
 * Handles `clearCookieJar`, `runRequest`, and `runAllRequests` messages from the webview.
 */
async function handleRunOrClearMessage(
  session: HttpEditorSession,
  message: Exclude<
    HttpWebviewToExtensionMessage,
    { type: 'ready' | 'selectEnvironment' | 'switchToText' | 'updateDocument' }
  >,
): Promise<void> {
  if (message.type === 'clearCookieJar') {
    session.runtime.cookieJar.length = 0;
    void vscode.window.showInformationMessage('Tailor HTTP: Cleared session CookieJar.');

    return;
  }

  await runSessionRequests(session, message.type === 'runRequest' ? message.requestId : undefined);
}

/**
 * Handles a single incoming message from the HTTP Workbench Webview.
 */
async function handleWebviewMessage(
  session: HttpEditorSession,
  message: HttpWebviewToExtensionMessage,
): Promise<void> {
  if (message.type === 'ready') {
    await postDocumentSync(session);

    return;
  }

  if (message.type === 'switchToText') {
    await vscode.commands.executeCommand('vscode.openWith', session.document.uri, 'default');

    return;
  }

  await handleActionMessage(session, message);
}

/**
 * Serializes `nextModel` and applies the full text edit to `session.document`.
 */
async function persistUpdatedDocument(
  session: HttpEditorSession,
  nextModel: HttpDocumentModel,
): Promise<void> {
  const nextText = serializeHttpDocument(nextModel);

  session.lastAppliedText = nextText;
  await applyFullDocumentText(session.document, nextText);
}

/**
 * Sends a `syncDocument` message with the parsed `.http` model and discovered environments.
 */
async function postDocumentSync(session: HttpEditorSession): Promise<void> {
  const baseDir = path.dirname(session.document.uri.fsPath);
  const envConfig = await loadDirectoryEnvironmentConfig(
    baseDir,
    session.runtime.getActiveEnvironment(),
  );
  const payload: HttpExtensionToWebviewMessage = {
    activeEnv: envConfig.activeEnvironment,
    availableEnvs: envConfig.environments,
    cookieJar: session.runtime.cookieJar,
    fileName: extractFileName(session.document.uri),
    model: parseHttpDocument(session.document.getText()),
    type: 'syncDocument',
  };

  void session.panel.webview.postMessage(payload);
}

/**
 * Resolves the target request by ID or falls back to the first request in the document.
 */
function resolveTargetRequest(
  requests: readonly HttpRequestBlock[],
  requestId: string,
): HttpRequestBlock | undefined {
  return requests.find((r) => r.id === requestId) ?? requests[0];
}

/**
 * Runs a single or batch request from the custom editor session and posts results to the webview.
 */
async function runSessionRequests(session: HttpEditorSession, requestId?: string): Promise<void> {
  void session.panel.webview.postMessage({
    isRunning: true,
    targetId: requestId ?? 'all',
    type: 'executionState',
  } satisfies HttpExtensionToWebviewMessage);

  const results = await executeDocumentRequests(session.document, session.runtime, requestId);

  writeResultsToOutput(session.runtime.outputChannel, results);
  void session.panel.webview.postMessage({
    cookieJar: session.runtime.cookieJar,
    results,
    selectedRequestId: requestId,
    type: 'executionResults',
  } satisfies HttpExtensionToWebviewMessage);
}

/**
 * Configures the Webview options and HTML content for a resolved custom editor panel.
 */
function setupWebviewHtml(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist');
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'http-webview.js'));

  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [distUri],
  };
  panel.webview.html = buildHttpWorkbenchHtml({
    cspSource: panel.webview.cspSource,
    nonce: createCspNonce(),
    scriptUri: scriptUri.toString(),
  });
}

/**
 * Writes execution results to the shared Tailor HTTP OutputChannel.
 */
function writeResultsToOutput(
  outputChannel: vscode.OutputChannel,
  results: readonly HttpResponseSnapshot[],
): void {
  for (const res of results) {
    outputChannel.appendLine(formatOutputChannelEntry(res));
  }
}

/**
 * Creates a `vscode.CustomTextEditorProvider` for `vscodeTailor.httpWorkbench`.
 *
 * @param extensionUri - Root URI of the `vscode-tailor` extension.
 * @param runtime - Shared HTTP Workbench runtime state (secrets, cookies, globals, output channel).
 * @returns Configured `vscode.CustomTextEditorProvider`.
 *
 * @example
 * ```ts
 * const provider = createHttpWorkbenchProvider(context.extensionUri, runtime);
 * ```
 */
export function createHttpWorkbenchProvider(
  extensionUri: vscode.Uri,
  runtime: HttpWorkbenchRuntime,
): vscode.CustomTextEditorProvider {
  return {
    resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel) {
      const session: HttpEditorSession = {
        document,
        lastAppliedText: null,
        panel: webviewPanel,
        runtime,
      };

      setupWebviewHtml(webviewPanel, extensionUri);

      const docChangeSub = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return;

        if (document.getText() === session.lastAppliedText) return;

        void postDocumentSync(session);
      });
      const msgSub = webviewPanel.webview.onDidReceiveMessage(
        (msg: HttpWebviewToExtensionMessage) => {
          void handleWebviewMessage(session, msg);
        },
      );

      webviewPanel.onDidDispose(() => {
        docChangeSub.dispose();
        msgSub.dispose();
      });
    },
  };
}

/**
 * Runs a single request or all requests from a Text Editor CodeLens action and shows the output log.
 *
 * @param uri - Target `.http` document URI.
 * @param runtime - Shared HTTP Workbench runtime state.
 * @param requestId - Optional specific request ID to execute (or `undefined` for all requests).
 *
 * @example
 * ```ts
 * await runHttpFromTextEditor(uri, runtime, 'req-1');
 * ```
 */
export async function runHttpFromTextEditor(
  uri: vscode.Uri,
  runtime: HttpWorkbenchRuntime,
  requestId?: string,
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const results = await executeDocumentRequests(document, runtime, requestId);

  writeResultsToOutput(runtime.outputChannel, results);
  runtime.outputChannel.show(true);
}

/**
 * Per-document custom editor session state.
 */
interface HttpEditorSession {
  document: vscode.TextDocument;
  lastAppliedText: string | null;
  panel: vscode.WebviewPanel;
  runtime: HttpWorkbenchRuntime;
}

/**
 * Shared runtime state injected into the HTTP Workbench Provider and CodeLens commands.
 */
export interface HttpWorkbenchRuntime {
  /** Session CookieJar storing `HttpKeyValueRow` cookies across requests. */
  cookieJar: HttpKeyValueRow[];
  /** Returns the currently active environment name (`dev`, `prod`, etc.). */
  getActiveEnvironment: () => string | null;
  /** Mutable runtime variables set via `client.global.set(key, val)`. */
  globalVariables: Record<string, string>;
  /** Shared OutputChannel for logging HTTP responses and test results. */
  outputChannel: vscode.OutputChannel;
  /** Secret provider for `{{$keychain}}` and `{{$secret}}` resolution. */
  secrets: HttpSecretProvider;
  /** Updates the active environment name. */
  setActiveEnvironment: (envName: string) => void;
}
