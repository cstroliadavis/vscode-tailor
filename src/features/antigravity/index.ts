import type { DisposableLike, TailorFeatureModule } from '../../types.ts';
import { registerAntigravityMenuCommands } from './antigravity-commands.ts';

/**
 * Creates the Antigravity Context Menu Integration (`antigravity`) feature module for `vscode-tailor`.
 *
 * @returns A `TailorFeatureModule` providing Explorer, Editor Tab, and Editor right-click actions to send files, selections, and diagnostics to Antigravity Chat.
 *
 * @example
 * ```ts
 * registry.register(createAntigravityFeatureModule());
 * ```
 */
export function createAntigravityFeatureModule(): TailorFeatureModule {
  return {
    id: 'antigravity',
    name: 'Antigravity Chat Context Menus',

    description:
      'Adds Explorer, Editor Tab, and Editor right-click menu actions (Add File/Folder to Chat, Add Selection to Chat, Explain & Fix Problem in Chat) for Google Antigravity.',
    settingKey: 'vscodeTailor.antigravity.enabled',

    activate(): DisposableLike[] {
      return registerAntigravityMenuCommands();
    },
  };
}
