import type { DisposableLike, TailorFeatureModule } from '../../types.ts';
import { createSyntaxHighlightController } from './syntax-decorator.ts';

/**
 * Creates the Config Syntax Highlighting (`syntax`) feature module for `vscode-tailor`.
 *
 * @returns A `TailorFeatureModule` providing TOML, JSON/JSONC/JSONL, and YAML syntax highlighting and language detection.
 *
 * @example
 * ```ts
 * registry.register(createSyntaxFeatureModule());
 * ```
 */
export function createSyntaxFeatureModule(): TailorFeatureModule {
  return {
    id: 'syntax',
    name: 'Config Syntax Highlighting (TOML / JSON / YAML)',

    description:
      'Syntax highlighting and automatic language detection for TOML (.toml, .tml), JSON (.json, .jsonc, .jsonl), and YAML (.yaml, .yml) files.',
    settingKey: 'vscodeTailor.syntax.enabled',

    activate(): DisposableLike[] {
      return [createSyntaxHighlightController()];
    },
  };
}
