import type {
  DisposableLike,
  FeatureConfigAdapter,
  FeatureRegistry,
  FeatureStatusItem,
  TailorFeatureModule,
} from './types.ts';

/**
 * Activates a single feature module if it is not already running.
 */
function activateFeatureEntry(state: RegistryInternalState, feature: TailorFeatureModule): void {
  if (state.activeDisposables.has(feature.id)) return;

  const disposables = feature.activate();

  state.activeDisposables.set(feature.id, disposables);
}

/**
 * Builds the status snapshot list for all registered feature modules.
 */
function buildFeatureStatusList(state: RegistryInternalState): FeatureStatusItem[] {
  const items: FeatureStatusItem[] = [];

  for (const feature of state.features.values()) {
    items.push({
      id: feature.id,
      name: feature.name,

      active: state.activeDisposables.has(feature.id),
      description: feature.description,
      settingKey: feature.settingKey,
    });
  }

  return items;
}

/**
 * Deactivates a single feature module and disposes its active subscriptions.
 */
function deactivateFeatureEntry(state: RegistryInternalState, feature: TailorFeatureModule): void {
  const disposables = state.activeDisposables.get(feature.id);

  if (!disposables) return;

  disposeAllItems(disposables);
  feature.deactivate?.();
  state.activeDisposables.delete(feature.id);
}

/**
 * Disposes every item in a list of disposables.
 */
function disposeAllItems(disposables: DisposableLike[]): void {
  for (const item of disposables) {
    item.dispose();
  }
}

/**
 * Synchronizes all registered feature modules with current configuration settings.
 */
function syncAllFeatures(state: RegistryInternalState, config: FeatureConfigAdapter): void {
  for (const feature of state.features.values()) {
    syncSingleFeature(state, config, feature);
  }
}

/**
 * Synchronizes a single feature module's runtime state with its configuration setting.
 */
function syncSingleFeature(
  state: RegistryInternalState,
  config: FeatureConfigAdapter,
  feature: TailorFeatureModule,
): void {
  const enabled = config.isEnabled(feature.settingKey);

  if (enabled) {
    activateFeatureEntry(state, feature);

    return;
  }

  deactivateFeatureEntry(state, feature);
}

/**
 * Toggles the enabled configuration state of a feature module by its identifier.
 */
async function toggleFeatureById(
  state: RegistryInternalState,
  config: FeatureConfigAdapter,
  id: string,
): Promise<boolean> {
  const feature = state.features.get(id);

  if (!feature) {
    throw new Error(`Unknown feature module: ${id}`);
  }

  const nextState = !config.isEnabled(feature.settingKey);

  await config.setEnabled(feature.settingKey, nextState);
  syncSingleFeature(state, config, feature);

  return nextState;
}

/**
 * Creates a closure-based feature registry that manages modular VS Code enhancements.
 *
 * @param config - Configuration adapter used to read and update module enabled flags.
 * @returns A managed `FeatureRegistry` instance.
 *
 * @example
 * ```ts
 * const registry = createFeatureRegistry(configAdapter);
 * registry.register(csvFeatureModule);
 * registry.activateAll();
 * ```
 */
export function createFeatureRegistry(config: FeatureConfigAdapter): FeatureRegistry {
  const _: RegistryInternalState = {
    activeDisposables: new Map<string, DisposableLike[]>(),
    features: new Map<string, TailorFeatureModule>(),
  };

  const syncWithConfig = (): void => {
    syncAllFeatures(_, config);
  };

  return {
    activateAll: syncWithConfig,
    deactivateAll: () => {
      for (const feature of _.features.values()) {
        deactivateFeatureEntry(_, feature);
      }
    },
    getFeatures: () => buildFeatureStatusList(_),
    isFeatureActive: (id: string) => _.activeDisposables.has(id),
    register: (feature: TailorFeatureModule) => {
      _.features.set(feature.id, feature);
    },
    syncWithConfig,
    toggleFeature: (id: string) => toggleFeatureById(_, config, id),
  };
}

/**
 * Internal state container for the feature registry closure.
 */
interface RegistryInternalState {
  activeDisposables: Map<string, DisposableLike[]>;
  features: Map<string, TailorFeatureModule>;
}
