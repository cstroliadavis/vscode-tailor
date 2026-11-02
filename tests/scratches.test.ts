import { describe, expect, it } from 'bun:test';
import {
  BUILT_IN_SCRATCH_FORMATS,
  buildChildScratchNodes,
  buildTopScratchNodes,
  DEFAULT_SCRATCHES_ROOT,
  mergeScratchFormats,
  resolveNextScratchFileName,
  resolveProjectScratchFolderName,
  resolveScratchesRootPath,
  sanitizeProjectFolderName,
  sortScratchDirectoryEntries,
} from '../src/features/scratches/scratches-core.ts';
import type { WorkspaceFolderSnapshot } from '../src/features/scratches/scratches-types.ts';

describe('scratches-core pure logic', () => {
  const setup = () => {
    const sampleFolders: readonly WorkspaceFolderSnapshot[] = Object.freeze([
      Object.freeze({ fsPath: '/Users/dev/ag-projects/coliner', name: 'coliner' }),
      Object.freeze({ fsPath: '/Users/dev/ag-projects/csv-lib', name: 'csv-lib' }),
    ]);

    return { sampleFolders };
  };

  it('resolves the default scratches root path and expands tilde home directories', () => {
    expect(resolveScratchesRootPath()).toBe(DEFAULT_SCRATCHES_ROOT);
    expect(resolveScratchesRootPath('   ')).toBe(DEFAULT_SCRATCHES_ROOT);
    expect(resolveScratchesRootPath('~', '/Users/chris')).toBe('/Users/chris');
    expect(resolveScratchesRootPath('~/ag-projects/scratches', '/Users/chris')).toBe(
      '/Users/chris/ag-projects/scratches',
    );
    expect(resolveScratchesRootPath('/custom/scratches')).toBe('/custom/scratches');
  });

  it('sanitizes workspace and folder names into safe single directory names', () => {
    expect(sanitizeProjectFolderName('coliner (Workspace)')).toBe('coliner');
    expect(sanitizeProjectFolderName('my-workspace.code-workspace')).toBe('my-workspace');
    expect(sanitizeProjectFolderName('foo/bar:baz*qux')).toBe('foo-bar-baz-qux');
    expect(sanitizeProjectFolderName('...   ')).toBe('global');
  });

  it('resolves the project scratch folder name from clicked resource, active file, workspace name, or first folder', () => {
    const { sampleFolders } = setup();

    expect(
      resolveProjectScratchFolderName({
        clickedFsPath: '/Users/dev/ag-projects/csv-lib/src/index.ts',
        workspaceFolders: sampleFolders,
        workspaceName: 'multi-root (Workspace)',
      }),
    ).toBe('csv-lib');

    expect(
      resolveProjectScratchFolderName({
        activeFileFsPath: '/Users/dev/ag-projects/coliner/README.md',
        workspaceFolders: sampleFolders,
        workspaceName: 'multi-root (Workspace)',
      }),
    ).toBe('coliner');

    expect(
      resolveProjectScratchFolderName({
        workspaceFolders: sampleFolders,
        workspaceName: 'my-suite (Workspace)',
      }),
    ).toBe('my-suite');

    expect(
      resolveProjectScratchFolderName({
        workspaceFolders: sampleFolders,
      }),
    ).toBe('coliner');

    expect(
      resolveProjectScratchFolderName({
        workspaceFolders: [],
      }),
    ).toBe('global');
  });

  it('generates sequential JetBrains-style scratch filenames and handles custom filenames', () => {
    expect(resolveNextScratchFileName([], '.ts')).toBe('scratch.ts');
    expect(resolveNextScratchFileName(['scratch.ts'], '.ts')).toBe('scratch_1.ts');
    expect(resolveNextScratchFileName(['SCRATCH.TS', 'scratch_1.ts'], '.ts')).toBe('scratch_2.ts');
    expect(resolveNextScratchFileName([], 'notes.md')).toBe('notes.md');
    expect(resolveNextScratchFileName(['notes.md'], 'notes.md')).toBe('notes_1.md');
    expect(resolveNextScratchFileName([], 'custom-stem', '.json')).toBe('custom-stem.json');
  });

  it('builds the two top-level Scratches tree nodes (All Scratches first, Current Workspace second)', () => {
    const [allNode, projectNode] = buildTopScratchNodes('/scratches', 'coliner (Workspace)');

    expect(allNode).toEqual({
      id: 'all:allRoot:/scratches',
      name: 'All Scratches',

      description: 'All Projects',
      fsPath: '/scratches',
      kind: 'allRoot',
      scope: 'all',
    });

    expect(projectNode).toEqual({
      id: 'project:projectRoot:/scratches/coliner',
      name: 'coliner',

      description: 'Current Workspace',
      fsPath: '/scratches/coliner',
      kind: 'projectRoot',
      scope: 'project',
    });
  });

  it('sorts directory entries with folders first and omits OS metadata files', () => {
    const [allNode] = buildTopScratchNodes('/scratches', 'coliner');
    const sorted = sortScratchDirectoryEntries([
      { isDirectory: false, name: 'scratch_2.ts' },
      { isDirectory: false, name: '.DS_Store' },
      { isDirectory: true, name: 'zebra' },
      { isDirectory: false, name: 'scratch.ts' },
      { isDirectory: true, name: 'alpha' },
    ]);

    expect(sorted).toEqual([
      { isDirectory: true, name: 'alpha' },
      { isDirectory: true, name: 'zebra' },
      { isDirectory: false, name: 'scratch.ts' },
      { isDirectory: false, name: 'scratch_2.ts' },
    ]);

    const children = buildChildScratchNodes(allNode, sorted);

    expect(children[0]).toEqual({
      id: 'all:directory:/scratches/alpha',
      name: 'alpha',

      fsPath: '/scratches/alpha',
      kind: 'directory',
      scope: 'all',
    });
    expect(children[2]).toEqual({
      id: 'all:file:/scratches/scratch.ts',
      name: 'scratch.ts',

      fsPath: '/scratches/scratch.ts',
      kind: 'file',
      scope: 'all',
    });
  });

  it('merges dynamic VS Code extension languages with pinned built-in scratch formats without duplicates', () => {
    const merged = mergeScratchFormats([
      { extension: '.ts', id: 'typescript', label: 'Duplicate TypeScript' },
      { aliases: ['proto'], extension: 'proto', id: 'proto3', label: 'Protocol Buffers' },
    ]);

    expect(merged.length).toBe(BUILT_IN_SCRATCH_FORMATS.length + 1);
    expect(merged[0]?.pinned).toBe(true);

    const proto = merged.find((item) => item.id === 'proto3');

    expect(proto).toEqual({
      id: 'proto3',

      aliases: ['proto'],
      extension: '.proto',
      label: 'Protocol Buffers',
      pinned: false,
    });
  });
});
