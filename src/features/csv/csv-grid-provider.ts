import * as vscode from 'vscode';
import type { CsvDocumentModel } from '../../types.ts';
import type {
  CsvExtensionToWebviewMessage,
  CsvMutationMessage,
  CsvWebviewToExtensionMessage,
} from './csv-messages.ts';
import { applyWebviewMutation } from './csv-messages.ts';
import { parseCsvDocument, serializeCsvDocument } from './csv-parser.ts';
import { buildCsvGridHtml } from './csv-webview-html.ts';

/**
 * Applies a serialized CSV string replacement across the entire `vscode.TextDocument`.
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
 * Extracts the basename of a URI path for display in the CSV Grid toolbar.
 */
function extractFileName(uri: vscode.Uri): string {
  const segments = uri.path.split('/');

  return segments.at(-1) ?? 'data.csv';
}

/**
 * Handles a single incoming message from the CSV Grid Webview.
 */
async function handleWebviewMessage(
  session: EditorSessionState,
  message: CsvWebviewToExtensionMessage,
): Promise<void> {
  if (message.type === 'ready') {
    postDocumentSync(session);

    return;
  }

  if (message.type === 'switchToText') {
    await vscode.commands.executeCommand('vscode.openWith', session.document.uri, 'default');

    return;
  }

  await processMutationMessage(session, message);
}

/**
 * Sends the current parsed `CsvDocumentModel` state to the CSV Grid Webview.
 */
function postDocumentSync(session: EditorSessionState): void {
  const model = parseCsvDocument(session.document.getText(), session.headerRowCount);
  const payload: CsvExtensionToWebviewMessage = {
    type: 'syncDocument',

    fileName: extractFileName(session.document.uri),
    model,
  };

  session.headerRowCount = model.headerRowCount;
  void session.panel.webview.postMessage(payload);
}

/**
 * Applies a webview mutation to the session's CSV model and persists any text change.
 */
async function processMutationMessage(
  session: EditorSessionState,
  message: CsvMutationMessage,
): Promise<void> {
  const currentModel = parseCsvDocument(session.document.getText(), session.headerRowCount);
  const nextModel: CsvDocumentModel = applyWebviewMutation(currentModel, message);

  session.headerRowCount = nextModel.headerRowCount;

  if (message.type === 'setHeaderRowCount') {
    postDocumentSync(session);

    return;
  }

  const nextText = serializeCsvDocument(nextModel);

  session.lastAppliedText = nextText;
  await applyFullDocumentText(session.document, nextText);
}

/**
 * Reads the configured default header row count from `vscodeTailor.csv.defaultHeaderRows`.
 */
function readDefaultHeaderRowCount(): number {
  const config = vscode.workspace.getConfiguration('vscodeTailor.csv');

  return config.get<number>('defaultHeaderRows', 1);
}

/**
 * Configures the Webview options and HTML content for a resolved custom editor panel.
 */
function setupWebviewHtml(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist');
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'csv-webview.js'));

  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [distUri],
  };
  panel.webview.html = buildCsvGridHtml({
    cspSource: panel.webview.cspSource,
    nonce: createCspNonce(),
    scriptUri: scriptUri.toString(),
  });
}

/**
 * Creates a `vscode.CustomTextEditorProvider` for the Tailor CSV Grid View.
 *
 * @param extensionUri - Root URI of the `vscode-tailor` extension used to resolve webview assets.
 * @returns A `vscode.CustomTextEditorProvider` implementation.
 *
 * @example
 * ```ts
 * const provider = createCsvGridEditorProvider(context.extensionUri);
 * vscode.window.registerCustomEditorProvider('vscodeTailor.csvGrid', provider);
 * ```
 */
export function createCsvGridEditorProvider(
  extensionUri: vscode.Uri,
): vscode.CustomTextEditorProvider {
  return {
    resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel) {
      const session: EditorSessionState = {
        document,
        headerRowCount: readDefaultHeaderRowCount(),
        lastAppliedText: null,
        panel: webviewPanel,
      };

      setupWebviewHtml(webviewPanel, extensionUri);

      const docChangeSub = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return;

        if (document.getText() === session.lastAppliedText) return;

        postDocumentSync(session);
      });

      const msgSub = webviewPanel.webview.onDidReceiveMessage(
        (msg: CsvWebviewToExtensionMessage) => {
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
 * Per-document custom editor session state.
 */
interface EditorSessionState {
  document: vscode.TextDocument;
  headerRowCount: number;
  lastAppliedText: string | null;
  panel: vscode.WebviewPanel;
}
