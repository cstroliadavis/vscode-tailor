import * as vscode from 'vscode';
import type { DisposableLike, TailorFeatureModule } from '../../types.ts';
import { registerScratchesCommands } from './scratches-commands.ts';
import { createScratchesTreeProvider } from './scratches-tree-provider.ts';

/**
 * Creates the Scratch Files (`scratches`) feature module for `vscode-tailor`.
 *
 * @returns A `TailorFeatureModule` providing the Explorer `Scratch File` context menu action and the Explorer `Scratches` TreeView.
 *
 * @example
 * ```ts
 * registry.register(createScratchesFeatureModule());
 * ```
 */
export function createScratchesFeatureModule(): TailorFeatureModule {
  return {
    id: 'scratches',
    name: 'Scratch Files & Explorer Scratches View',

    description:
      'JetBrains-style on-the-fly Scratch Files in any supported format with workspace-scoped folders and an Explorer Scratches TreeView.',
    settingKey: 'vscodeTailor.scratches.enabled',

    activate(): DisposableLike[] {
      const provider = createScratchesTreeProvider();
      const treeView = vscode.window.createTreeView('vscodeTailor.scratchesView', {
        showCollapseAll: true,
        treeDataProvider: provider,
      });
      const commandSubs = registerScratchesCommands({ provider, treeView });

      return [provider, treeView, ...commandSubs];
    },
  };
}
