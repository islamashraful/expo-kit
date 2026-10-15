import { describe, expect, test } from 'bun:test';

// The built plugin, exactly what apps load through app.plugin.js.
const withCloudKit = require('../app.plugin.js').default;

type Mods = { ios: Record<string, (config: unknown) => Promise<unknown>> };

/** Runs only the iOS mods we care about, with fake starting files, and returns the results. */
async function runMods(options: unknown, start: { entitlements?: object; infoPlist?: object; podfile?: object; target?: string }) {
  let config = withCloudKit({ name: 'test', slug: 'test', ios: { bundleIdentifier: 'com.test' } }, options);
  const results: Record<string, any> = {};
  const mods = config.mods as Mods;
  const call = async (name: string, modResults: unknown) => {
    const out = (await mods.ios[name]!({ ...config, modResults, modRequest: { platform: 'ios', modName: name, projectRoot: '/tmp', platformProjectRoot: '/tmp', introspect: true } })) as { modResults: unknown };
    results[name] = out.modResults;
  };
  await call('entitlements', { ...(start.entitlements ?? {}) });
  await call('infoPlist', { ...(start.infoPlist ?? {}) });
  await call('podfileProperties', { ...(start.podfile ?? {}) });
  const settings = { IPHONEOS_DEPLOYMENT_TARGET: start.target ?? '16.4' };
  await call('xcodeproj', { pbxXCBuildConfigurationSection: () => ({ a: { buildSettings: settings }, a_comment: 'Debug' }) });
  return { ...results, settings } as Record<string, any>;
}

describe('config plugin', () => {
  test('adds CloudKit, keeps what the app already has', async () => {
    const r = await runMods(
      { containers: ['iCloud.com.test.sync'] },
      {
        entitlements: {
          'com.apple.developer.icloud-container-identifiers': ['iCloud.com.test.docs'],
          'com.apple.developer.icloud-services': ['CloudDocuments'],
          'aps-environment': 'production',
        },
        infoPlist: { UIBackgroundModes: ['audio'] },
      },
    );
    expect(r.entitlements['com.apple.developer.icloud-container-identifiers']).toEqual(['iCloud.com.test.docs', 'iCloud.com.test.sync']);
    expect(r.entitlements['com.apple.developer.icloud-services']).toEqual(['CloudDocuments', 'CloudKit']);
    expect(r.entitlements['aps-environment']).toBe('production');
    expect(r.infoPlist.UIBackgroundModes).toEqual(['audio', 'remote-notification']);
    expect(r.infoPlist.ExpoKitCloudKitContainers).toEqual(['iCloud.com.test.sync']);
    expect(r.podfileProperties['ios.deploymentTarget']).toBe('17.0');
    expect(r.settings.IPHONEOS_DEPLOYMENT_TARGET).toBe('17.0');
  });

  test('sets aps-environment when missing, never lowers a higher iOS version', async () => {
    const r = await runMods({ containers: ['iCloud.com.test.sync'] }, { podfile: { 'ios.deploymentTarget': '18.0' }, target: '18.2' });
    expect(r.entitlements['aps-environment']).toBe('development');
    expect(r.podfileProperties['ios.deploymentTarget']).toBe('18.0');
    expect(r.settings.IPHONEOS_DEPLOYMENT_TARGET).toBe('18.2');
  });

  test('running twice adds nothing twice', async () => {
    const once = await runMods({ containers: ['iCloud.com.test.sync'] }, {});
    const twice = await runMods({ containers: ['iCloud.com.test.sync'] }, { entitlements: once.entitlements, infoPlist: once.infoPlist });
    expect(twice.entitlements['com.apple.developer.icloud-services']).toEqual(['CloudKit']);
    expect(twice.infoPlist.UIBackgroundModes).toEqual(['remote-notification']);
  });

  test('fails clearly without containers', () => {
    expect(() => withCloudKit({ name: 't', slug: 't' }, {})).toThrow('pass at least one iCloud container');
    expect(() => withCloudKit({ name: 't', slug: 't' }, { containers: [] })).toThrow('pass at least one iCloud container');
  });
});

