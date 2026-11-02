import { existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import type { DisposableLike } from '../../types.ts';
import {
  buildChildScratchNodes,
  buildTopScratchNodes,
  DEFAULT_SCRATCHES_ROOT,
  resolveProjectScratchFolderName,
  resolveScratchesRootPath,
} from './scratches-core.ts';
import type {
  ScratchDirectoryEntry,
  ScratchTreeNode,
  ScratchWorkspaceContext,
} from './scratches-types.ts';

/**
 * Assigns a semantic icon to the `All Scratches` and `Current Workspace` top-level container nodes.
 */
function applyContainerIcon(item: vscode.TreeItem, kind: ScratchTreeNode['kind']): void {
  if (kind === 'allRoot') {
    item.iconPath = new vscode.ThemeIcon('library');

    return;
  }

  if (kind === 'projectRoot') {
    item.iconPath = new vscode.ThemeIcon('folder-active');
  }
}

/**
 * Configures a `vscode.TreeItem` for a directory or root node in the Scratches view.
 */
function buildContainerTreeItem(element: ScratchTreeNode): vscode.TreeItem {
  const isProject = element.kind === 'projectRoot';
  const state = isProject
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
  const item = new vscode.TreeItem(element.name, state);

  Object.assign(item, {
    id: element.id,

    contextValue: `scratch_${element.kind}`,
    description: element.description,
    resourceUri: vscode.Uri.file(element.fsPath),
    tooltip: element.fsPath,
  });
  applyContainerIcon(item, element.kind);

  return item;
}

/**
 * Configures a `vscode.TreeItem` for an individual scratch file node.
 */
function buildFileTreeItem(element: ScratchTreeNode): vscode.TreeItem {
  const uri = vscode.Uri.file(element.fsPath);
  const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);

  Object.assign(item, {
    id: element.id,

    command: {
      arguments: [uri],
      command: 'vscode.open',
      title: 'Open Scratch File',
    },
    contextValue: 'scratch_file',
    resourceUri: uri,
    tooltip: element.fsPath,
  });

  return item;
}

/**
 * Safely reads directory entries from disk, returning an empty list if the folder does not exist yet.
 */
function readDirectoryEntries(dirPath: string): ScratchDirectoryEntry[] {
  if (!existsSync(dirPath)) return [];

  try {
    return readdirSync(dirPath, { withFileTypes: true }).map((dirent) => ({
      name: dirent.name,

      isDirectory: dirent.isDirectory(),
    }));
  } catch {
    return [];
  }
}

/**
 * Resolves the immediate root parent node for a direct child of `All Scratches` or `Current Workspace`.
 */
function resolveParentRootNode(
  element: ScratchTreeNode,
  topNodes: [ScratchTreeNode, ScratchTreeNode],
): ScratchTreeNode | undefined {
  if (['allRoot', 'projectRoot'].includes(element.kind)) return undefined;

  const candidate = selectRootByScope(element.scope, topNodes);

  return dirname(element.fsPath) === candidate.fsPath ? candidate : undefined;
}

/**
 * Selects the matching top-level root node (`All Scratches` or `Current Workspace`) for a node scope.
 */
function selectRootByScope(
  scope: ScratchTreeNode['scope'],
  topNodes: [ScratchTreeNode, ScratchTreeNode],
): ScratchTreeNode {
  return scope === 'project' ? topNodes[1] : topNodes[0];
}

/**
 * Captures a snapshot of the current VS Code workspace folders and active/clicked file paths.
 *
 * @param clickedFsPath - Optional filesystem path from an Explorer right-click invocation.
 * @returns A `ScratchWorkspaceContext` ready for `resolveProjectScratchFolderName`.
 *
 * @example
 * ```ts
 * const ctx = captureWorkspaceContext('/repo/src/app.ts');
 * ```
 */
export function captureWorkspaceContext(clickedFsPath?: string): ScratchWorkspaceContext {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => ({
    name: f.name,

    fsPath: f.uri.fsPath,
  }));

  return {
    activeFileFsPath: vscode.window.activeTextEditor?.document.uri.fsPath,
    clickedFsPath,
    workspaceFolders: folders,
    workspaceName: vscode.workspace.name,
  };
}

/**
 * Creates the `ScratchesTreeProvider` backing the `vscodeTailor.scratchesView` Explorer TreeView.
 *
 * @returns Tree data provider and refresh controller for the Scratches view.
 *
 * @example
 * ```ts
 * const provider = createScratchesTreeProvider();
 * provider.refresh();
 * ```
 */
export function createScratchesTreeProvider(): ScratchesTreeProvider {
  const emitter = new vscode.EventEmitter<ScratchTreeNode | undefined | void>();

  return {
    onDidChangeTreeData: emitter.event,

    dispose(): void {
      emitter.dispose();
    },

    getChildren(element?: ScratchTreeNode): ScratchTreeNode[] {
      if (!element) return this.getTopNodes();

      if (element.kind === 'file') return [];

      return buildChildScratchNodes(element, readDirectoryEntries(element.fsPath));
    },

    getParent(element: ScratchTreeNode): ScratchTreeNode | undefined {
      return resolveParentRootNode(element, this.getTopNodes());
    },

    getTopNodes(): [ScratchTreeNode, ScratchTreeNode] {
      const rootPath = getConfiguredScratchesRootPath();
      const projectFolder = resolveProjectScratchFolderName(captureWorkspaceContext());

      return buildTopScratchNodes(rootPath, projectFolder);
    },

    getTreeItem(element: ScratchTreeNode): vscode.TreeItem {
      return element.kind === 'file' ? buildFileTreeItem(element) : buildContainerTreeItem(element);
    },

    refresh(): void {
      emitter.fire();
    },
  };
}

/**
 * Reads and resolves the `vscodeTailor.scratches.rootPath` configuration setting.
 *
 * @returns Absolute path to the root scratches directory.
 *
 * @example
 * ```ts
 * const root = getConfiguredScratchesRootPath();
 * ```
 */
export function getConfiguredScratchesRootPath(): string {
  const raw = vscode.workspace
    .getConfiguration()
    .get<string>('vscodeTailor.scratches.rootPath', DEFAULT_SCRATCHES_ROOT);

  return resolveScratchesRootPath(raw);
}

/**
 * Controller contract for the Explorer `Scratches` TreeDataProvider.
 */
export interface ScratchesTreeProvider
  extends vscode.TreeDataProvider<ScratchTreeNode>, DisposableLike {
  /**
   * Returns the current `[All Scratches, Current Workspace]` root nodes.
   */
  getTopNodes(): [ScratchTreeNode, ScratchTreeNode];

  /**
   * Triggers a full re-render of the Scratches TreeView.
   */
  refresh(): void;
}
