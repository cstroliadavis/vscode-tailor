import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import type {
  ScratchDirectoryEntry,
  ScratchFormatOption,
  ScratchTreeNode,
  ScratchWorkspaceContext,
  WorkspaceFolderSnapshot,
} from './scratches-types.ts';

/**
 * Default root directory where scratch files are stored (`ag-projects/scratches`).
 */
export const DEFAULT_SCRATCHES_ROOT =
  '/Users/christopherstrolia-davis/Library/CloudStorage/GoogleDrive-christopher.stroliadavis@gmail.com/My Drive/ag-projects/scratches';

/**
 * Curated list of popular scratch file formats pinned at the top of the Scratch File QuickPick.
 */
export const BUILT_IN_SCRATCH_FORMATS: readonly ScratchFormatOption[] = Object.freeze([
  { id: 'c', aliases: ['h'], extension: '.c', label: 'C', pinned: true },
  { id: 'csharp', aliases: ['cs', 'c#'], extension: '.cs', label: 'C#', pinned: true },
  { id: 'cpp', aliases: ['c++', 'cc', 'hpp'], extension: '.cpp', label: 'C++', pinned: true },
  { id: 'css', extension: '.css', label: 'CSS', pinned: true },
  { id: 'csv', aliases: ['tsv'], extension: '.csv', label: 'CSV', pinned: true },
  { id: 'dockerfile', extension: '.dockerfile', label: 'Dockerfile', pinned: true },
  { id: 'go', aliases: ['golang'], extension: '.go', label: 'Go', pinned: true },
  { id: 'graphql', aliases: ['gql'], extension: '.graphql', label: 'GraphQL', pinned: true },
  { id: 'html', aliases: ['htm'], extension: '.html', label: 'HTML', pinned: true },
  {
    id: 'http',
    aliases: ['rest'],
    extension: '.http',
    label: 'HTTP Request (.http)',
    pinned: true,
  },
  { id: 'java', extension: '.java', label: 'Java', pinned: true },
  {
    id: 'javascript',
    aliases: ['js', 'mjs', 'cjs'],
    extension: '.js',
    label: 'JavaScript',
    pinned: true,
  },
  {
    id: 'javascriptreact',
    aliases: ['jsx'],
    extension: '.jsx',
    label: 'JavaScript React (JSX)',
    pinned: true,
  },
  { id: 'json', extension: '.json', label: 'JSON', pinned: true },
  {
    id: 'jsonc',
    aliases: ['json with comments'],
    extension: '.jsonc',
    label: 'JSON with Comments (JSONC)',
    pinned: true,
  },
  {
    id: 'jsonl',
    aliases: ['ndjson', 'json lines'],
    extension: '.jsonl',
    label: 'JSON Lines (JSONL)',
    pinned: true,
  },
  { id: 'kotlin', aliases: ['kt'], extension: '.kt', label: 'Kotlin', pinned: true },
  { id: 'markdown', aliases: ['md'], extension: '.md', label: 'Markdown', pinned: true },
  {
    id: 'plaintext',
    aliases: ['txt', 'text'],
    extension: '.txt',
    label: 'Plain Text',
    pinned: true,
  },
  { id: 'python', aliases: ['py'], extension: '.py', label: 'Python', pinned: true },
  { id: 'rust', aliases: ['rs'], extension: '.rs', label: 'Rust', pinned: true },
  {
    id: 'shellscript',
    aliases: ['bash', 'sh', 'zsh'],
    extension: '.sh',
    label: 'Shell Script (sh / zsh)',
    pinned: true,
  },
  { id: 'sql', extension: '.sql', label: 'SQL', pinned: true },
  { id: 'swift', extension: '.swift', label: 'Swift', pinned: true },
  {
    id: 'terraform',
    aliases: ['hcl', 'tf', 'tfvars'],
    extension: '.tf',
    label: 'Terraform / HCL',
    pinned: true,
  },
  { id: 'toml', aliases: ['tml'], extension: '.toml', label: 'TOML', pinned: true },
  {
    id: 'typescript',
    aliases: ['ts', 'mts', 'cts'],
    extension: '.ts',
    label: 'TypeScript',
    pinned: true,
  },
  {
    id: 'typescriptreact',
    aliases: ['tsx'],
    extension: '.tsx',
    label: 'TypeScript React (TSX)',
    pinned: true,
  },
  { id: 'xml', aliases: ['svg'], extension: '.xml', label: 'XML', pinned: true },
  { id: 'yaml', aliases: ['yml'], extension: '.yaml', label: 'YAML', pinned: true },
]);

const IGNORED_ENTRY_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

/**
 * Compares two `ScratchFormatOption` entries, placing pinned items first, then sorting by label.
 */
function compareFormatOptions(a: ScratchFormatOption, b: ScratchFormatOption): number {
  const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));

  if (pinDiff !== 0) return pinDiff;

  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

/**
 * Compares two directory entries, placing subdirectories before files, then sorting naturally by stem.
 */
function compareScratchEntries(a: ScratchDirectoryEntry, b: ScratchDirectoryEntry): number {
  const dirDiff = Number(b.isDirectory) - Number(a.isDirectory);

  if (dirDiff !== 0) return dirDiff;

  const stemA = basename(a.name, extname(a.name));
  const stemB = basename(b.name, extname(b.name));

  return (
    stemA.localeCompare(stemB, undefined, { numeric: true, sensitivity: 'base' }) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Normalizes a file extension so it always starts with a leading dot (`.`).
 */
function ensureLeadingDot(ext: string): string {
  const trimmed = ext.trim();

  if (!trimmed) return '.txt';

  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/**
 * Expands a leading `~` or `~/` prefix against `homeDir`.
 */
function expandHomePrefix(trimmed: string, homeDir: string): string {
  if (trimmed === '~') return homeDir;

  return trimmed.startsWith('~/') ? join(homeDir, trimmed.slice(2)) : trimmed;
}

/**
 * Finds the workspace folder containing `targetPath` and returns its raw name.
 */
function findMatchingWorkspaceFolderName(
  targetPath: string | undefined,
  folders: readonly WorkspaceFolderSnapshot[],
): string {
  if (!targetPath) return '';

  const match = folders.find((f) => isPathWithinRoot(targetPath, f.fsPath));

  return match ? match.name : '';
}

/**
 * Selects the first non-empty candidate name and sanitizes it for use as a directory name.
 */
function firstValidFolderName(candidates: readonly (string | undefined)[]): string {
  const match = candidates
    .map((raw) => sanitizeProjectFolderName(raw))
    .find((name) => name !== 'global');

  return match ?? 'global';
}

/**
 * Formats an indexed scratch filename (`scratch.ts` for index 0, `scratch_1.ts` for index 1, etc.).
 */
function formatIndexedFileName(stem: string, ext: string, index: number): string {
  return index === 0 ? `${stem}${ext}` : `${stem}_${index}${ext}`;
}

/**
 * Checks whether `trimmed` represents a bare file extension (or empty string) without a filename stem.
 */
function isBareExtensionInput(trimmed: string): boolean {
  return !trimmed || trimmed.startsWith('.');
}

/**
 * Checks whether `targetPath` equals or is nested inside `rootPath`.
 */
function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normTarget = normalizePathForMatch(targetPath);
  const normRoot = normalizePathForMatch(rootPath);

  return normTarget === normRoot || normTarget.startsWith(`${normRoot}/`);
}

/**
 * Normalizes a dynamically discovered language format entry.
 */
function normalizeDynamicFormat(raw: ScratchFormatOption): ScratchFormatOption {
  const cleanId = raw.id.trim();

  return {
    id: cleanId,

    aliases: raw.aliases,
    extension: ensureLeadingDot(raw.extension),
    label: raw.label.trim() || cleanId,
    pinned: false,
  };
}

/**
 * Normalizes path separators and strips trailing slashes for prefix comparison.
 */
function normalizePathForMatch(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Splits a raw user input or extension into a clean base stem and normalized `.ext`.
 */
function parseStemAndExtension(
  extensionOrFileName: string,
  fallbackExt: string,
): { ext: string; stem: string } {
  const trimmed = basename(extensionOrFileName.trim());

  if (isBareExtensionInput(trimmed)) {
    return { ext: ensureLeadingDot(trimmed || fallbackExt), stem: 'scratch' };
  }

  return splitNonEmptyStem(trimmed, fallbackExt);
}

/**
 * Inserts a normalized dynamic format option into `byKey` if its ID is non-empty and not yet registered.
 */
function registerDynamicFormat(
  byKey: Map<string, ScratchFormatOption>,
  raw: ScratchFormatOption,
): void {
  const normalized = normalizeDynamicFormat(raw);
  const key = normalized.id.toLowerCase();

  if (!key || byKey.has(key)) return;

  byKey.set(key, normalized);
}

/**
 * Splits a non-empty filename token into its stem and normalized extension.
 */
function splitNonEmptyStem(trimmed: string, fallbackExt: string): { ext: string; stem: string } {
  const parsedExt = extname(trimmed);

  if (!parsedExt) return { ext: ensureLeadingDot(fallbackExt), stem: trimmed };

  return {
    ext: ensureLeadingDot(parsedExt),
    stem: trimmed.slice(0, trimmed.length - parsedExt.length),
  };
}

/**
 * Safely trims an optional string input.
 */
function trimOptionalString(value?: string): string {
  return (value ?? '').trim();
}

/**
 * Builds sorted child `ScratchTreeNode` descriptors for a directory node in the Scratches TreeView.
 *
 * @param parent - Parent `ScratchTreeNode` (`allRoot`, `projectRoot`, or `directory`).
 * @param entries - Raw directory entries read from `parent.fsPath`.
 * @returns Sorted child `ScratchTreeNode` items (folders first, then files).
 *
 * @example
 * ```ts
 * const [allNode] = buildTopScratchNodes('/scratches', 'coliner');
 * buildChildScratchNodes(allNode, [
 *   { isDirectory: false, name: 'scratch.ts' },
 *   { isDirectory: true, name: 'coliner' },
 * ]);
 * // => [
 * //   { fsPath: '/scratches/coliner', id: 'all:directory:/scratches/coliner', kind: 'directory', name: 'coliner', scope: 'all' },
 * //   { fsPath: '/scratches/scratch.ts', id: 'all:file:/scratches/scratch.ts', kind: 'file', name: 'scratch.ts', scope: 'all' },
 * // ]
 * ```
 */
export function buildChildScratchNodes(
  parent: ScratchTreeNode,
  entries: readonly ScratchDirectoryEntry[],
): ScratchTreeNode[] {
  const sorted = sortScratchDirectoryEntries(entries);

  return sorted.map((entry) => {
    const childPath = join(parent.fsPath, entry.name);
    const kind = entry.isDirectory ? 'directory' : 'file';

    return {
      id: `${parent.scope}:${kind}:${childPath}`,
      name: entry.name,

      fsPath: childPath,
      kind,
      scope: parent.scope,
    };
  });
}

/**
 * Builds the two top-level nodes for the Explorer `Scratches` view:
 * 1. `All Scratches` (entire scratches root directory, collapsed by default)
 * 2. `<projectFolderName>` (current workspace/project scratch subfolder, expanded by default)
 *
 * @param rootPath - Resolved root directory path for all scratches.
 * @param projectFolderName - Sanitized workspace or root project folder name.
 * @returns A two-element tuple `[allScratchesNode, projectScratchesNode]`.
 *
 * @example
 * ```ts
 * buildTopScratchNodes('/scratches', 'coliner');
 * // => [
 * //   { description: 'All Projects', fsPath: '/scratches', id: 'all:allRoot:/scratches', kind: 'allRoot', name: 'All Scratches', scope: 'all' },
 * //   { description: 'Current Workspace', fsPath: '/scratches/coliner', id: 'project:projectRoot:/scratches/coliner', kind: 'projectRoot', name: 'coliner', scope: 'project' },
 * // ]
 * ```
 */
export function buildTopScratchNodes(
  rootPath: string,
  projectFolderName: string,
): [ScratchTreeNode, ScratchTreeNode] {
  const safeProject = sanitizeProjectFolderName(projectFolderName);
  const projectPath = join(rootPath, safeProject);

  return [
    {
      id: `all:allRoot:${rootPath}`,
      name: 'All Scratches',

      description: 'All Projects',
      fsPath: rootPath,
      kind: 'allRoot',
      scope: 'all',
    },
    {
      id: `project:projectRoot:${projectPath}`,
      name: safeProject,

      description: 'Current Workspace',
      fsPath: projectPath,
      kind: 'projectRoot',
      scope: 'project',
    },
  ];
}

/**
 * Merges dynamically discovered VS Code extension language formats with `BUILT_IN_SCRATCH_FORMATS`.
 *
 * @param dynamicFormats - Additional format options extracted from `vscode.extensions.all`.
 * @returns Deduplicated, sorted array of `ScratchFormatOption` items with pinned formats first.
 *
 * @example
 * ```ts
 * const formats = mergeScratchFormats([
 *   { extension: '.prisma', id: 'prisma', label: 'Prisma' },
 * ]);
 * formats.some((f) => f.id === 'prisma' && f.extension === '.prisma'); // => true
 * ```
 */
export function mergeScratchFormats(
  dynamicFormats: readonly ScratchFormatOption[],
): ScratchFormatOption[] {
  const byKey = new Map<string, ScratchFormatOption>(
    BUILT_IN_SCRATCH_FORMATS.map((item) => [item.id.toLowerCase(), item]),
  );

  for (const raw of dynamicFormats) {
    registerDynamicFormat(byKey, raw);
  }

  return [...byKey.values()].toSorted(compareFormatOptions);
}

/**
 * Computes the next non-colliding scratch filename (e.g. `scratch.ts`, `scratch_1.ts`, `scratch_2.ts`)
 * or custom filename within a target directory.
 *
 * @param existingFileNames - Existing filenames in the target scratch subfolder.
 * @param extensionOrFileName - Either a file extension (`'.ts'`) or a custom filename (`'notes.md'`).
 * @param fallbackExt - Fallback extension used when `extensionOrFileName` has no extension.
 * @returns A guaranteed non-colliding filename.
 *
 * @example
 * ```ts
 * resolveNextScratchFileName([], '.ts'); // => 'scratch.ts'
 * resolveNextScratchFileName(['scratch.ts', 'scratch_1.ts'], '.ts'); // => 'scratch_2.ts'
 * resolveNextScratchFileName(['notes.md'], 'notes.md'); // => 'notes_1.md'
 * ```
 */
export function resolveNextScratchFileName(
  existingFileNames: readonly string[],
  extensionOrFileName: string,
  fallbackExt = '.txt',
): string {
  const { ext, stem } = parseStemAndExtension(extensionOrFileName, fallbackExt);
  const lowerExisting = new Set(existingFileNames.map((n) => n.toLowerCase()));
  let index = 0;

  while (lowerExisting.has(formatIndexedFileName(stem, ext, index).toLowerCase())) {
    index += 1;
  }

  return formatIndexedFileName(stem, ext, index);
}

/**
 * Resolves the sanitized workspace or root project folder name to associate scratches with.
 *
 * @param context - Snapshot of clicked path, active editor path, workspace folders, and workspace name.
 * @returns Sanitized folder name (or `'global'` when no workspace or folder is open).
 *
 * @example
 * ```ts
 * resolveProjectScratchFolderName({
 *   clickedFsPath: '/projects/coliner/src/index.ts',
 *   workspaceFolders: [{ fsPath: '/projects/coliner', name: 'coliner' }],
 * }); // => 'coliner'
 * ```
 */
export function resolveProjectScratchFolderName(context: ScratchWorkspaceContext): string {
  return firstValidFolderName([
    findMatchingWorkspaceFolderName(context.clickedFsPath, context.workspaceFolders),
    findMatchingWorkspaceFolderName(context.activeFileFsPath, context.workspaceFolders),
    context.workspaceName,
    context.workspaceFolders[0]?.name,
  ]);
}

/**
 * Resolves the configured scratches root directory, expanding `~` and falling back to `DEFAULT_SCRATCHES_ROOT`.
 *
 * @param configuredPath - User-configured `vscodeTailor.scratches.rootPath` string.
 * @param homeDir - Optional home directory override for deterministic testing.
 * @returns Resolved absolute path to the scratches root folder.
 *
 * @example
 * ```ts
 * resolveScratchesRootPath('~/scratches', '/Users/alice'); // => '/Users/alice/scratches'
 * ```
 */
export function resolveScratchesRootPath(configuredPath?: string, homeDir?: string): string {
  const trimmed = trimOptionalString(configuredPath);

  if (!trimmed) return DEFAULT_SCRATCHES_ROOT;

  return expandHomePrefix(trimmed, homeDir ?? homedir());
}

/**
 * Sanitizes a raw workspace or project folder name into a safe single directory name.
 *
 * @param rawName - Raw workspace or folder name.
 * @returns Safe directory name, or `'global'` if empty.
 *
 * @example
 * ```ts
 * sanitizeProjectFolderName('coliner (Workspace)'); // => 'coliner'
 * sanitizeProjectFolderName('my:project/name'); // => 'my-project-name'
 * ```
 */
export function sanitizeProjectFolderName(rawName = ''): string {
  const cleaned = rawName
    .replace(/\s*\(Workspace\)$/i, '')
    .replace(/\.code-workspace$/i, '')
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .trim();

  return cleaned || 'global';
}

/**
 * Filters out OS metadata files (`.DS_Store`, `Thumbs.db`) and sorts directories first, then files.
 *
 * @param entries - Raw directory entries.
 * @returns Filtered and sorted array of `ScratchDirectoryEntry` items.
 *
 * @example
 * ```ts
 * sortScratchDirectoryEntries([
 *   { isDirectory: false, name: 'b.ts' },
 *   { isDirectory: false, name: '.DS_Store' },
 *   { isDirectory: true, name: 'alpha' },
 * ]); // => [{ isDirectory: true, name: 'alpha' }, { isDirectory: false, name: 'b.ts' }]
 * ```
 */
export function sortScratchDirectoryEntries(
  entries: readonly ScratchDirectoryEntry[],
): ScratchDirectoryEntry[] {
  return entries
    .filter((entry) => !IGNORED_ENTRY_NAMES.has(entry.name))
    .toSorted(compareScratchEntries);
}
