import {
  createRunOncePlugin,
  withEntitlementsPlist,
  withInfoPlist,
  withPodfileProperties,
  withXcodeProject,
  type ConfigPlugin,
} from 'expo/config-plugins';

export type CloudKitPluginOptions = {
  /** iCloud container IDs the app uses, e.g. `['iCloud.com.example.app']`. */
  containers: string[];
};

// CKSyncEngine needs iOS 17.
const MIN_IOS = '17.0';

const withCloudKit: ConfigPlugin<CloudKitPluginOptions> = (config, options) => {
  const containers = options?.containers ?? [];
  if (containers.length === 0) {
    throw new Error('@expo-kit/cloudkit: pass at least one iCloud container, e.g. { containers: ["iCloud.com.example.app"] }');
  }

  config = withEntitlementsPlist(config, (mod) => {
    const entitlements = mod.modResults;
    entitlements['com.apple.developer.icloud-container-identifiers'] = unique([
      ...asStrings(entitlements['com.apple.developer.icloud-container-identifiers']),
      ...containers,
    ]);
    entitlements['com.apple.developer.icloud-services'] = unique([
      ...asStrings(entitlements['com.apple.developer.icloud-services']),
      'CloudKit',
    ]);
    // Silent pushes tell the app that something changed in iCloud.
    entitlements['aps-environment'] ??= 'development';
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIBackgroundModes = unique([...asStrings(mod.modResults.UIBackgroundModes), 'remote-notification']);
    // Read by the module to refuse unknown containers with a clear error. CloudKit itself
    // crashes the app when a container is missing from the entitlements.
    mod.modResults.ExpoKitCloudKitContainers = containers;
    return mod;
  });

  config = withPodfileProperties(config, (mod) => {
    const current = mod.modResults['ios.deploymentTarget'];
    if (!current || compareVersions(current, MIN_IOS) < 0) mod.modResults['ios.deploymentTarget'] = MIN_IOS;
    return mod;
  });

  // The app target must be at least 17.0 too, or it can't link the module.
  config = withXcodeProject(config, (mod) => {
    const configurations = mod.modResults.pbxXCBuildConfigurationSection() as Record<
      string,
      { buildSettings?: Record<string, string> } | string
    >;
    for (const configuration of Object.values(configurations)) {
      const settings = typeof configuration === 'object' ? configuration.buildSettings : undefined;
      const current = settings?.IPHONEOS_DEPLOYMENT_TARGET;
      if (settings && current && compareVersions(current.replace(/"/g, ''), MIN_IOS) < 0) {
        settings.IPHONEOS_DEPLOYMENT_TARGET = MIN_IOS;
      }
    }
    return mod;
  });

  return config;
};

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export default createRunOncePlugin(withCloudKit, '@expo-kit/cloudkit');
