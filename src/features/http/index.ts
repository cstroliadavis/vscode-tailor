import * as path from 'node:path';
import * as vscode from 'vscode';
import type { DisposableLike, TailorFeatureModule } from '../../types.ts';
import {
  createHttpCodeLensProvider,
  createHttpVariableHoverProvider,
} from './http-codelens-provider.ts';
import { createHttpSecretProvider, loadDirectoryEnvironmentConfig } from './http-secret-adapter.ts';
import type { HttpWorkbenchRuntime } from './http-workbench-provider.ts';
import { createHttpWorkbenchProvider, runHttpFromTextEditor } from './http-workbench-provider.ts';

const HTTP_DOC_SELECTOR: vscode.DocumentSelector = [
  { language: 'http' },
  { pattern: '**/*.http' },
  { pattern: '**/*.rest' },
];
const HTTP_WORKBENCH_VIEW_TYPE = 'vscodeTailor.httpWorkbench';

/**
 * Creates the shared `HttpWorkbenchRuntime` instance for the active extension session.
 */
function createHttpRuntime(context: vscode.ExtensionContext): HttpWorkbenchRuntime {
  const _ = {
    activeEnvironment: vscode.workspace
      .getConfiguration('vscodeTailor.http')
      .get<string>('defaultEnvironment', 'dev'),
  };
  const outputChannel = vscode.window.createOutputChannel('Tailor HTTP Client');
  const secrets = createHttpSecretProvider(context.secrets);

  return {
    cookieJar: [],
    getActiveEnvironment: () => _.activeEnvironment,
    globalVariables: {},
    outputChannel,
    secrets,
    setActiveEnvironment(envName) {
      _.activeEnvironment = envName;
    },
  };
}

/**
 * Prompts the user to select an HTTP environment from the active workspace/file directory.
 */
async function promptSelectEnvironment(runtime: HttpWorkbenchRuntime): Promise<void> {
  const dir = resolveActiveDirectoryPath();
  const config = await loadDirectoryEnvironmentConfig(dir, runtime.getActiveEnvironment());
  const picked = await vscode.window.showQuickPick(config.environments, {
    placeHolder: `Select HTTP environment (current: ${config.activeEnvironment})`,
  });

  if (!picked) return;

  runtime.setActiveEnvironment(picked);
  void vscode.window.showInformationMessage(`Tailor HTTP: Active environment set to "${picked}".`);
}

/**
 * Prompts the user to store or update a secret in VS Code `SecretStorage` (`{{$secret key}}`).
 */
async function promptStoreSecret(secrets: vscode.SecretStorage): Promise<void> {
  const key = await vscode.window.showInputBox({
    placeHolder: 'api_token',
    prompt: 'Secret key name (referenced in .http files via {{$secret <key>}})',
  });

  if (!key) return;

  const val = await vscode.window.showInputBox({
    password: true,
    prompt: `Enter secret value for {{$secret ${key}}}`,
  });

  if (val === undefined) return;

  await secrets.store(`vscodeTailor.http.${key.trim()}`, val);
  void vscode.window.showInformationMessage(
    `Tailor HTTP: Stored secret "{{$secret ${key.trim()}}}".`,
  );
}

/**
 * Registers all HTTP Workbench commands (`switchToText`, `switchToGui`, `runSingleRequest`, `runAllInFile`, `selectEnvironment`, `setSecret`).
 */
function registerHttpCommands(
  context: vscode.ExtensionContext,
  runtime: HttpWorkbenchRuntime,
): DisposableLike[] {
  return [
    vscode.commands.registerCommand('vscodeTailor.http.switchToText', (uri?: vscode.Uri) =>
      switchHttpEditorView('default', uri),
    ),
    vscode.commands.registerCommand('vscodeTailor.http.switchToGui', (uri?: vscode.Uri) =>
      switchHttpEditorView(HTTP_WORKBENCH_VIEW_TYPE, uri),
    ),
    vscode.commands.registerCommand(
      'vscodeTailor.http.runSingleRequest',
      (uri?: vscode.Uri, reqId?: string) => {
        const target = resolveTargetUri(uri);

        if (!target) return;

        void runHttpFromTextEditor(target, runtime, reqId);
      },
    ),
    vscode.commands.registerCommand('vscodeTailor.http.runAllInFile', (uri?: vscode.Uri) => {
      const target = resolveTargetUri(uri);

      if (!target) return;

      void runHttpFromTextEditor(target, runtime);
    }),
    vscode.commands.registerCommand('vscodeTailor.http.selectEnvironment', () =>
      promptSelectEnvironment(runtime),
    ),
    vscode.commands.registerCommand('vscodeTailor.http.setSecret', () =>
      promptStoreSecret(context.secrets),
    ),
  ];
}

/**
 * Resolves the filesystem directory of the active `.http` file or workspace folder.
 */
function resolveActiveDirectoryPath(): string {
  const uri = resolveTargetUri();

  if (uri) return path.dirname(uri.fsPath);

  const folders = vscode.workspace.workspaceFolders;

  return folders ? folders[0]!.uri.fsPath : process.cwd();
}

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
 * Reopens the target `.http` / `.rest` file in the specified VS Code editor view type.
 */
async function switchHttpEditorView(viewId: string, resourceUri?: vscode.Uri): Promise<void> {
  const targetUri = resolveTargetUri(resourceUri);

  if (!targetUri) return;

  await vscode.commands.executeCommand('vscode.openWith', targetUri, viewId);
}

/**
 * Creates the HTTP Client Workbench feature module (`vscodeTailor.http`) for `vscode-tailor`.
 *
 * @param context - VS Code extension context providing `extensionUri` and `secrets`.
 * @returns A `TailorFeatureModule` providing the HTTP GUI Custom Editor, CodeLens, Hover, and secret integration.
 *
 * @example
 * ```ts
 * registry.register(createHttpFeatureModule(context));
 * ```
 */
export function createHttpFeatureModule(context: vscode.ExtensionContext): TailorFeatureModule {
  return {
    description:
      'Interactive HTTP/REST Client Workbench with Method/Header combo-boxes, Params/Cookies/Auth decomposition, assertions, and Keychain/Secret resolution.',
    id: 'http',
    name: 'HTTP Client Workbench (.http / .rest GUI + Runner)',
    settingKey: 'vscodeTailor.http.enabled',

    activate(): DisposableLike[] {
      const runtime = createHttpRuntime(context);
      const customEditorSub = vscode.window.registerCustomEditorProvider(
        HTTP_WORKBENCH_VIEW_TYPE,
        createHttpWorkbenchProvider(context.extensionUri, runtime),
        { webviewOptions: { retainContextWhenHidden: true } },
      );
      const codeLensSub = vscode.languages.registerCodeLensProvider(
        HTTP_DOC_SELECTOR,
        createHttpCodeLensProvider(),
      );
      const hoverSub = vscode.languages.registerHoverProvider(
        HTTP_DOC_SELECTOR,
        createHttpVariableHoverProvider(
          runtime.getActiveEnvironment,
          () => runtime.globalVariables,
          runtime.secrets,
        ),
      );

      return [
        runtime.outputChannel,
        customEditorSub,
        codeLensSub,
        hoverSub,
        ...registerHttpCommands(context, runtime),
      ];
    },
  };
}
