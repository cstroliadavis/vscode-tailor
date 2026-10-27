import { describe, expect, it } from 'bun:test';
import {
  buildEditorSelectionPayload,
  buildExplorerContextPayloads,
  selectDiagnosticForCursor,
} from '../src/features/antigravity/antigravity-context.ts';
import type { DiagnosticSnapshot } from '../src/features/antigravity/antigravity-types.ts';

describe('antigravity-context payload builders', () => {
  const setup = () => {
    const sampleDiagnostics: readonly DiagnosticSnapshot[] = Object.freeze([
      Object.freeze({
        endLineZeroBased: 4,
        message: 'Missing required attribute "hash_key"',
        startLineZeroBased: 2,
      }),
      Object.freeze({
        endLineZeroBased: 15,
        message: 'Unexpected token "="',
        startLineZeroBased: 15,
      }),
    ]);

    return { sampleDiagnostics };
  };

  it('builds deduplicated file payloads from Explorer multi-selection, single-click, or active editor', () => {
    const multi = buildExplorerContextPayloads(
      'file:///repo/a.ts',
      ['file:///repo/a.ts', 'file:///repo/b.ts', 'file:///repo/a.ts'],
      'file:///repo/c.ts',
    );

    expect(multi).toEqual([
      { type: 'file', uri: 'file:///repo/a.ts' },
      { type: 'file', uri: 'file:///repo/b.ts' },
    ]);

    const single = buildExplorerContextPayloads(
      'file:///repo/infra',
      undefined,
      'file:///repo/c.ts',
    );

    expect(single).toEqual([{ type: 'file', uri: 'file:///repo/infra' }]);

    const fallback = buildExplorerContextPayloads(undefined, undefined, 'file:///repo/main.tf');

    expect(fallback).toEqual([{ type: 'file', uri: 'file:///repo/main.tf' }]);
    expect(buildExplorerContextPayloads()).toEqual([]);
  });

  it('handles non-array second arguments passed by editor/title/context and editor/context menus', () => {
    const mockVscodeUri = {
      scheme: 'file',
      toString: () => 'file:///repo/infra/main.tf',
    };
    const tabContextObject = { editorIndex: 0, groupId: 1 };

    const fromTabMenu = buildExplorerContextPayloads(
      mockVscodeUri,
      tabContextObject,
      'file:///repo/other.ts',
    );

    expect(fromTabMenu).toEqual([{ type: 'file', uri: 'file:///repo/infra/main.tf' }]);

    const fromCommandPalette = buildExplorerContextPayloads({ groupId: 1 }, null, mockVscodeUri);

    expect(fromCommandPalette).toEqual([{ type: 'file', uri: 'file:///repo/infra/main.tf' }]);
  });

  it('builds 1-based line range payloads for non-empty editor selections and whole-file payloads when empty', () => {
    const withSelection = buildEditorSelectionPayload({
      endLineZeroBased: 19,
      isEmpty: false,
      startLineZeroBased: 10,
      uri: 'file:///repo/infra/main.tf',
    });

    expect(withSelection).toEqual({
      range: { endLineNumber: 20, startLineNumber: 11 },
      type: 'file',
      uri: 'file:///repo/infra/main.tf',
    });

    const collapsed = buildEditorSelectionPayload({
      endLineZeroBased: 5,
      isEmpty: true,
      startLineZeroBased: 5,
      uri: 'file:///repo/infra/main.tf',
    });

    expect(collapsed).toEqual({
      type: 'file',
      uri: 'file:///repo/infra/main.tf',
    });
  });

  it('selects the diagnostic overlapping the cursor line or falls back to the first diagnostic', () => {
    const { sampleDiagnostics } = setup();

    const exact = selectDiagnosticForCursor('file:///repo/main.tf', 15, sampleDiagnostics);

    expect(exact).toEqual({
      message: 'Unexpected token "="',
      range: {
        absoluteUri: 'file:///repo/main.tf',
        endLine: 15,
        startLine: 15,
      },
    });

    const fallbackFirst = selectDiagnosticForCursor('file:///repo/main.tf', 99, sampleDiagnostics);

    expect(fallbackFirst?.message).toBe('Missing required attribute "hash_key"');
    expect(selectDiagnosticForCursor('file:///repo/main.tf', 0, [])).toBeNull();
  });
});
