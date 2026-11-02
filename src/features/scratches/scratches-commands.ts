import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import * as vscode from 'vscode';
import type { DisposableLike } from '../../types.ts';
import {
  mergeScratchFormats,
  resolveNextScratchFileName,
  resolveProjectScratchFolderName,
} from './scratches-core.ts';
import type { ScratchesTreeProvider } from './scratches-tree-provider.ts';
import {
  captureWorkspaceContext,
  getConfiguredScratchesRootPath,
} from './scratches-tree-provider.ts';
import type { ScratchFormatOption, ScratchTreeNode } from './scratches-types.ts';

/**
 * Converts a `ScratchFormatOption` into a searchable `ScratchQuickPickItem`.
 */
function buildFormatQuickPickItem(fmt: ScratchFormatOption): ScratchQuickPickItem {
  const aliases = fmt.aliases?.length ? `Aliases: ${fmt.aliases.join(', ')}` : undefined;

  return {
    description: fmt.extension,
    detail: aliases,
    extensionOrName: fmt.extension,
    label: fmt.label,
  };
}

/**
 * Builds the QuickPick items list, optionally prepending a custom filename option when typed.
 */
function buildQuickPickItemsForInput(
  rawInput: string,
  baseItems: readonly ScratchQuickPickItem[],
): readonly ScratchQuickPickItem[] {
  const trimmed = rawInput.trim();

  if (!hasCustomFileNameExtension(trimmed)) return baseItems;

  const customItem: ScratchQuickPickItem = {
    alwaysShow: true,
    description: 'Custom scratch file name',
    extensionOrName: trimmed,
    label: `$(new-file) Create "${trimmed}"`,
  };

  return [customItem, ...baseItems];
}

/**
 * Extracts a single `ScratchFormatOption` from a raw VS Code `contributes.languages` entry, if valid.
 */
function convertRawLanguageContribution(raw: RawLanguageContribution): ScratchFormatOption | null {
  const cleanId = extractLanguageId(raw);
  const firstExt = extractFirstExtension(raw);

  if (!cleanId || !firstExt) return null;

  return createDynamicFormatOption(cleanId, firstExt, extractLanguageAliases(raw));
}

/**
 * Creates a new empty scratch file on disk, refreshes the tree, and opens the file in VS Code.
 */
async function createAndOpenScratchFile(
  targetDir: string,
  extensionOrName: string,
  controller: ScratchesViewController,
): Promise<void> {
  mkdirSync(targetDir, { recursive: true });
  const existing = existsSync(targetDir) ? readdirSync(targetDir) : [];
  const fileName = resolveNextScratchFileName(existing, extensionOrName);
  const filePath = join(targetDir, fileName);

  writeFileSync(filePath, '', { flag: 'a' });
  controller.provider.refresh();
  revealProjectNodeQuietly(controller);
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
}

/**
 * Constructs a `ScratchFormatOption` from a validated extension language ID, primary extension, and aliases.
 */
function createDynamicFormatOption(
  cleanId: string,
  firstExt: string,
  aliases: readonly string[],
): ScratchFormatOption {
  return {
    id: cleanId,

    aliases,
    extension: firstExt,
    label: aliases[0] ?? cleanId,
  };
}

/**
 * Discovers all language formats contributed by installed VS Code extensions.
 */
function discoverExtensionScratchFormats(): ScratchFormatOption[] {
  const rawLangs = vscode.extensions.all.flatMap((ext) =>
    extractRawLanguagesFromPackage(ext.packageJSON),
  );
  const discovered = rawLangs
    .map(convertRawLanguageContribution)
    .filter((item): item is ScratchFormatOption => item !== null);

  return mergeScratchFormats(discovered);
}

/**
 * Extracts a filesystem path when `arg` is a `vscode.Uri` with a string `fsPath`.
 */
function extractClickedUriFsPath(arg: unknown): string | undefined {
  const candidate = isRecordObject(arg) ? arg.fsPath : undefined;

  return typeof candidate === 'string' ? candidate : undefined;
}

/**
 * Extracts the `contributes` object record from an extension's `packageJSON`, if present.
 */
function extractContributesRecord(packageJson: unknown): Record<string, unknown> | undefined {
  if (!isRecordObject(packageJson)) return undefined;

  return isRecordObject(packageJson.contributes) ? packageJson.contributes : undefined;
}

/**
 * Extracts the primary file extension string from a raw language contribution object.
 */
function extractFirstExtension(raw: RawLanguageContribution): string | undefined {
  const first = Array.isArray(raw.extensions) ? raw.extensions[0] : undefined;

  return typeof first === 'string' ? first : undefined;
}

/**
 * Extracts string aliases from a raw language contribution object.
 */
function extractLanguageAliases(raw: RawLanguageContribution): string[] {
  if (!Array.isArray(raw.aliases)) return [];

  return raw.aliases.filter((a): a is string => typeof a === 'string');
}

/**
 * Extracts and trims the string `id` from a raw language contribution object.
 */
function extractLanguageId(raw: RawLanguageContribution): string {
  return typeof raw.id === 'string' ? raw.id.trim() : '';
}

/**
 * Safely extracts the `contributes.languages` array from an extension's `packageJSON`.
 */
function extractRawLanguagesFromPackage(packageJson: unknown): RawLanguageContribution[] {
  const contributes = extractContributesRecord(packageJson);

  if (!contributes || !Array.isArray(contributes.languages)) return [];

  return contributes.languages as RawLanguageContribution[];
}

/**
 * Handles creating a new scratch file from Explorer, Scratches TreeView, or Command Palette.
 */
async function handleCreateScratchCommand(
  clickedArg: unknown,
  controller: ScratchesViewController,
): Promise<void> {
  const targetDir = resolveTargetScratchDirectory(clickedArg);
  const folderLabel = basename(targetDir);
  const chosen = await promptScratchFormatSelection(folderLabel);

  if (!chosen) return;

  await createAndOpenScratchFile(targetDir, chosen, controller);
}

/**
 * Handles deleting a scratch file or directory from the Scratches TreeView context menu.
 */
async function handleDeleteScratchCommand(
  node: unknown,
  provider: ScratchesTreeProvider,
): Promise<void> {
  if (!isDeletableScratchNode(node)) return;

  const answer = await vscode.window.showWarningMessage(
    `Delete scratch "${node.name}"?`,
    { modal: true },
    'Delete',
  );

  if (answer !== 'Delete') return;

  rmSync(node.fsPath, { force: true, recursive: true });
  provider.refresh();
}

/**
 * Handles renaming a scratch file or folder from the Scratches TreeView context menu.
 */
async function handleRenameScratchCommand(
  node: unknown,
  provider: ScratchesTreeProvider,
): Promise<void> {
  if (!isDeletableScratchNode(node)) return;

  const nextName = await promptNewScratchName(node.name);

  if (!nextName) return;

  renameSync(node.fsPath, join(dirname(node.fsPath), basename(nextName)));
  provider.refresh();
}

/**
 * Handles revealing a scratch node in macOS Finder / OS file manager.
 */
async function handleRevealInFinderCommand(node: unknown): Promise<void> {
  const fsPath = isScratchTreeNode(node) ? node.fsPath : getConfiguredScratchesRootPath();

  mkdirSync(fsPath, { recursive: true });
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(fsPath));
}

/**
 * Checks whether a user-typed string in the QuickPick contains both a filename stem and `.ext`.
 */
function hasCustomFileNameExtension(input: string): boolean {
  const ext = extname(input);

  return ext.length > 1 && input.length > ext.length;
}

/**
 * Checks whether `value` is a `ScratchTreeNode` representing a modifiable file or subdirectory.
 */
function isDeletableScratchNode(value: unknown): value is ScratchTreeNode {
  if (!isScratchTreeNode(value)) return false;

  return ['directory', 'file'].includes(value.kind);
}

/**
 * Checks whether an unknown value is a non-null object record.
 */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

/**
 * Checks whether `value` is a `ScratchTreeNode` from the Scratches TreeView.
 */
function isScratchTreeNode(value: unknown): value is ScratchTreeNode {
  return isRecordObject(value) && typeof value.scope === 'string';
}

/**
 * Prompts the user for a new filename when renaming a scratch entry.
 */
async function promptNewScratchName(currentName: string): Promise<string | undefined> {
  const raw = await vscode.window.showInputBox({
    prompt: 'Enter new scratch name',
    title: 'Rename Scratch',
    value: currentName,
  });
  const trimmed = (raw ?? '').trim();

  return [currentName, ''].includes(trimmed) ? undefined : trimmed;
}

/**
 * Opens an interactive QuickPick allowing the user to pick any language format or type `filename.ext`.
 */
function promptScratchFormatSelection(folderLabel: string): Promise<string | undefined> {
  const baseItems = discoverExtensionScratchFormats().map(buildFormatQuickPickItem);
  const qp = vscode.window.createQuickPick<ScratchQuickPickItem>();

  Object.assign(qp, {
    items: baseItems,
    matchOnDescription: true,
    matchOnDetail: true,
    placeholder: 'Pick a format (e.g. TypeScript, JSON, HTTP, Markdown) or type filename.ext',
    title: `Scratch File (${folderLabel})`,
  });

  return waitForQuickPickChoice(qp, baseItems);
}

/**
 * Resolves the target directory inside `scratches` where a new scratch file should be created.
 */
function resolveTargetScratchDirectory(clickedArg: unknown): string {
  if (isScratchTreeNode(clickedArg)) {
    return clickedArg.kind === 'file' ? dirname(clickedArg.fsPath) : clickedArg.fsPath;
  }

  const clickedFsPath = extractClickedUriFsPath(clickedArg);
  const projectFolder = resolveProjectScratchFolderName(captureWorkspaceContext(clickedFsPath));

  return join(getConfiguredScratchesRootPath(), projectFolder);
}

/**
 * Expands the current project's node in the Scratches TreeView when a scratch file is created.
 */
function revealProjectNodeQuietly(controller: ScratchesViewController): void {
  const [, projectNode] = controller.provider.getTopNodes();

  void controller.treeView.reveal(projectNode, {
    expand: true,
    focus: false,
    select: false,
  });
}

/**
 * Wires event listeners on a QuickPick instance and resolves with the selected `extensionOrName`.
 */
function waitForQuickPickChoice(
  qp: vscode.QuickPick<ScratchQuickPickItem>,
  baseItems: readonly ScratchQuickPickItem[],
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let resolved = false;

    const finish = (val?: string) => {
      if (resolved) return;

      resolved = true;
      qp.dispose();
      resolve(val);
    };

    qp.onDidChangeValue((val) => {
      qp.items = buildQuickPickItemsForInput(val, baseItems);
    });
    qp.onDidAccept(() => finish(qp.selectedItems[0]?.extensionOrName));
    qp.onDidHide(() => finish(undefined));
    qp.show();
  });
}

/**
 * Registers the `vscodeTailor.scratches.*` commands and binds them to the Scratches TreeView.
 *
 * @param controller - Active Scratches TreeView and TreeDataProvider controller.
 * @returns Array of `DisposableLike` command and workspace event subscriptions.
 *
 * @example
 * ```ts
 * const subs = registerScratchesCommands(controller);
 * ```
 */
export function registerScratchesCommands(controller: ScratchesViewController): DisposableLike[] {
  const { provider } = controller;

  return [
    vscode.commands.registerCommand('vscodeTailor.scratches.create', (clicked?: unknown) =>
      handleCreateScratchCommand(clicked, controller),
    ),
    vscode.commands.registerCommand('vscodeTailor.scratches.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('vscodeTailor.scratches.rename', (node?: unknown) =>
      handleRenameScratchCommand(node, provider),
    ),
    vscode.commands.registerCommand('vscodeTailor.scratches.delete', (node?: unknown) =>
      handleDeleteScratchCommand(node, provider),
    ),
    vscode.commands.registerCommand('vscodeTailor.scratches.revealInFinder', (node?: unknown) =>
      handleRevealInFinderCommand(node),
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
  ];
}

/**
 * Raw shape of an entry inside an extension's `contributes.languages` array.
 */
interface RawLanguageContribution {
  aliases?: unknown;
  extensions?: unknown;
  id?: unknown;
}

/**
 * QuickPick item representing a selectable scratch file format or custom filename.
 */
interface ScratchQuickPickItem extends vscode.QuickPickItem {
  extensionOrName: string;
}

/**
 * Bundle of the active Scratches `TreeDataProvider` and `TreeView` instance.
 */
export interface ScratchesViewController {
  /**
   * Underlying tree data provider for the Scratches view.
   */
  provider: ScratchesTreeProvider;

  /**
   * Registered VS Code `TreeView` instance for `vscodeTailor.scratchesView`.
   */
  treeView: vscode.TreeView<ScratchTreeNode>;
}
