import { describe, expect, it, mock } from 'bun:test';
import { createFeatureRegistry } from '../src/registry.ts';
import type { FeatureConfigAdapter, TailorFeatureModule } from '../src/types.ts';

describe('createFeatureRegistry', () => {
  /**
   * Optional configuration overrides for test setup.
   */
  interface SetupOverrides {
    initialEnabled?: boolean;
  }

  const setup = (overrides: SetupOverrides = {}) => {
    const state = {
      enabled: overrides.initialEnabled ?? true,
    };
    const disposeSpy = mock(() => undefined);
    const deactivateSpy = mock(() => undefined);
    const activateSpy = mock(() => [{ dispose: disposeSpy }]);

    const configAdapter: FeatureConfigAdapter = Object.freeze({
      isEnabled: (key: string) => (key === 'vscodeTailor.csv.enabled' ? state.enabled : false),
      setEnabled: async (key: string, value: boolean) => {
        if (key === 'vscodeTailor.csv.enabled') {
          state.enabled = value;
        }
      },
    });

    const csvModule: TailorFeatureModule = Object.freeze({
      id: 'csv',
      name: 'CSV Workbench',

      description: 'Grid and Rainbow CSV support',
      settingKey: 'vscodeTailor.csv.enabled',

      activate: activateSpy,
      deactivate: deactivateSpy,
    });

    const registry = createFeatureRegistry(configAdapter);

    registry.register(csvModule);

    return {
      activateSpy,
      configAdapter,
      csvModule,
      deactivateSpy,
      disposeSpy,
      registry,
      state,
    };
  };

  it('activates enabled feature modules when activateAll is invoked', () => {
    const { activateSpy, registry } = setup({ initialEnabled: true });

    registry.activateAll();

    expect(registry.isFeatureActive('csv')).toBe(true);
    expect(activateSpy).toHaveBeenCalledTimes(1);
    expect(registry.getFeatures()).toEqual([
      {
        id: 'csv',
        name: 'CSV Workbench',

        active: true,
        description: 'Grid and Rainbow CSV support',
        settingKey: 'vscodeTailor.csv.enabled',
      },
    ]);
  });

  it('skips activating disabled feature modules', () => {
    const { activateSpy, registry } = setup({ initialEnabled: false });

    registry.activateAll();

    expect(registry.isFeatureActive('csv')).toBe(false);
    expect(activateSpy).toHaveBeenCalledTimes(0);
  });

  it('toggles a feature module from active to inactive and disposes subscriptions', async () => {
    const { deactivateSpy, disposeSpy, registry } = setup({ initialEnabled: true });

    registry.activateAll();
    const nextState = await registry.toggleFeature('csv');

    expect(nextState).toBe(false);
    expect(registry.isFeatureActive('csv')).toBe(false);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(deactivateSpy).toHaveBeenCalledTimes(1);
  });

  it('deactivates all running modules when deactivateAll is called', () => {
    const { disposeSpy, registry } = setup({ initialEnabled: true });

    registry.activateAll();
    registry.deactivateAll();

    expect(registry.isFeatureActive('csv')).toBe(false);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('throws an error when toggling an unregistered feature id', async () => {
    const { registry } = setup();

    await expect(registry.toggleFeature('nonexistent')).rejects.toThrow(
      'Unknown feature module: nonexistent',
    );
  });
});
