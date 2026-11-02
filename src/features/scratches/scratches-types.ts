/**
 * Logical kind of a node displayed inside the Explorer `Scratches` TreeView.
 */
export type ScratchNodeKind = 'allRoot' | 'directory' | 'file' | 'projectRoot';

/**
 * Tree hierarchy branch in which a `ScratchTreeNode` resides.
 */
export type ScratchNodeScope = 'all' | 'project';

/**
 * Lightweight filesystem directory entry snapshot used for pure sorting and tree building.
 */
export interface ScratchDirectoryEntry {
  /**
   * Entry filename or directory basename.
   */
  name: string;

  /**
   * Whether the entry is a subdirectory (`true`) or a file (`false`).
   */
  isDirectory: boolean;
}

/**
 * Supported language or file format option presented when creating a new scratch file.
 */
export interface ScratchFormatOption {
  /**
   * Unique language identifier (e.g. `'typescript'`, `'json'`, `'http'`).
   */
  id: string;

  /**
   * Optional secondary search aliases or additional extensions.
   */
  aliases?: readonly string[];

  /**
   * Primary file extension including the leading dot (e.g. `'.ts'`).
   */
  extension: string;

  /**
   * Human-readable format name (e.g. `'TypeScript'`).
   */
  label: string;

  /**
   * Whether this format belongs to the curated top list in the QuickPick.
   */
  pinned?: boolean;
}

/**
 * Pure descriptor for a node in the `Scratches` Explorer TreeView.
 */
export interface ScratchTreeNode {
  /**
   * Deterministic unique identifier for VS Code tree state persistence.
   */
  id: string;

  /**
   * Visible label rendered for the tree node.
   */
  name: string;

  /**
   * Optional secondary text shown next to `name`.
   */
  description?: string;

  /**
   * Absolute filesystem path represented by this node.
   */
  fsPath: string;

  /**
   * Structural node role (`allRoot`, `projectRoot`, `directory`, or `file`).
   */
  kind: ScratchNodeKind;

  /**
   * Branch scope (`'all'` for All Scratches or `'project'` for Current Workspace).
   */
  scope: ScratchNodeScope;
}

/**
 * Snapshot of workspace folders and active/clicked paths used to resolve the project scratch folder.
 */
export interface ScratchWorkspaceContext {
  /**
   * Optional filesystem path of the currently active editor document.
   */
  activeFileFsPath?: string;

  /**
   * Optional filesystem path of the Explorer item or Scratch node right-clicked by the user.
   */
  clickedFsPath?: string;

  /**
   * Open workspace root folders in the current VS Code window.
   */
  workspaceFolders: readonly WorkspaceFolderSnapshot[];

  /**
   * Optional `vscode.workspace.name` of the open workspace or root folder.
   */
  workspaceName?: string;
}

/**
 * Pure snapshot of a single VS Code `WorkspaceFolder`.
 */
export interface WorkspaceFolderSnapshot {
  /**
   * Display name of the workspace folder.
   */
  name: string;

  /**
   * Absolute filesystem path of the workspace folder root.
   */
  fsPath: string;
}
