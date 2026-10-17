import * as vscode from 'vscode';
import { createCsvFeatureModule } from './features/csv/index.ts';
import { createHttpFeatureModule } from './features/http/index.ts';
import { createFeatureRegistry } from './registry.ts';
import type { FeatureConfigAdapter, FeatureRegistry } from './types.ts';

const _ = {
  registry: null as FeatureRegistry | null,
};

/**
 * Applies user-selected QuickPick checkbox states to the feature registry.
 */
async function applySelectedFeatureStates(
  registry: FeatureRegistry,
  selectedIds: Set<string>,
): Promise<void> {
  for (const feature of registry.getFeatures()) {
    const shouldBeActive = selectedIds.has(feature.id);

    if (shouldBeActive !== feature.active) {
      await registry.toggleFeature(feature.id);
    }
  }
}

/**
 * Creates a `FeatureConfigAdapter` backed by `vscode.workspace.getConfiguration()`.
 */
function createVscodeConfigAdapter(): FeatureConfigAdapter {
  return {
    isEnabled(settingKey: string): boolean {
      return vscode.workspace.getConfiguration().get<boolean>(settingKey, true);
    },
    async setEnabled(settingKey: string, enabled: boolean): Promise<void> {
      await vscode.workspace
        .getConfiguration()
        .update(settingKey, enabled, vscode.ConfigurationTarget.Global);
    },
  };
}

/**
 * Displays a multi-select QuickPick allowing the user to toggle Tailor feature modules on or off.
 */
async function showToggleFeaturesQuickPick(registry: FeatureRegistry): Promise<void> {
  const items = registry.getFeatures().map((feature) => ({
    description: feature.settingKey,
    detail: feature.description,
    featureId: feature.id,
    label: feature.name,
    picked: feature.active,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Check or uncheck VS Code Tailor feature modules to enable or disable them',
    title: 'VS Code Tailor: Toggle Feature Modules',
  });

  if (!selected) return;

  const selectedIds = new Set(selected.map((item) => item.featureId));

  await applySelectedFeatureStates(registry, selectedIds);
}

/**
 * Activates the `vscode-tailor` extension, initializes the feature registry, and binds commands.
 *
 * @param context - VS Code extension lifecycle context.
 *
 * @example
 * ```ts
 * activate(context);
 * ```
 */
export function activate(context: vscode.ExtensionContext): void {
  const configAdapter = createVscodeConfigAdapter();
  const registry = createFeatureRegistry(configAdapter);

  _.registry = registry;
  registry.register(createCsvFeatureModule(context.extensionUri));
  registry.register(createHttpFeatureModule(context));
  registry.activateAll();

  const toggleCommand = vscode.commands.registerCommand('vscodeTailor.toggleFeatures', () =>
    showToggleFeaturesQuickPick(registry),
  );
  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('vscodeTailor')) {
      registry.syncWithConfig();
    }
  });

  context.subscriptions.push(toggleCommand, configListener, {
    dispose: () => registry.deactivateAll(),
  });
}

/**
 * Deactivates the `vscode-tailor` extension and disposes all active feature modules.
 *
 * @example
 * ```ts
 * deactivate();
 * ```
 */
export function deactivate(): void {
  _.registry?.deactivateAll();
  _.registry = null;
}
