import * as Application from 'expo-application';
import PostHog, { type PostHogOptions } from 'posthog-react-native';
import { Platform } from 'react-native';

export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

export type AnalyticsOptions = {
  /** The PostHog project key. When empty, nothing is sent. */
  apiKey: string;
  /** Default `'https://eu.i.posthog.com'`. */
  host?: string;
  /** Sends events from development builds too, e.g. to try out a new event. Default `false`. */
  enableInDev?: boolean;
  /** Sent as `app` with every event. Default: the app's name from the native project. */
  appName?: string;
  /** Any other PostHog option. */
  options?: Omit<PostHogOptions, 'host'>;
};

let client: PostHog | null = null;
let appName: string | null = null;

/**
 * Starts PostHog. Call once at app startup. Does nothing in development
 * (unless `enableInDev`) or when `apiKey` is empty, so every other function is safe to call anyway.
 */
export function initAnalytics({
  apiKey,
  host = 'https://eu.i.posthog.com',
  enableInDev = false,
  appName: name,
  options,
}: AnalyticsOptions) {
  if (client || !apiKey || (__DEV__ && !enableInDev)) return;
  appName = name ?? null;
  client = new PostHog(apiKey, { host, ...options });
  // Added to every event, so dashboards can split by app and environment.
  void client.register(baseProperties());
}

/** Sends an event, e.g. `capture('task_saved', { count: 3 })`. */
export function capture(event: string, properties?: AnalyticsProperties) {
  client?.capture(event, properties);
}

/**
 * Adds properties to every following event, e.g. `register({ language: 'de' })`.
 * Call again with the same key to change the value.
 */
export function register(properties: AnalyticsProperties) {
  void client?.register(properties);
}

/** Records a screen view. `useTrackScreens()` does this for every route. */
export function screen(name: string, properties?: AnalyticsProperties) {
  void client?.screen(name, properties);
}

/**
 * Links the following events to one user, e.g. a device or account ID.
 * Also saves the app version the user started with.
 */
export function identify(userId: string, properties?: AnalyticsProperties) {
  client?.identify(userId, {
    $set: { ...baseProperties(), ...properties },
    $set_once: { first_app_version: Application.nativeApplicationVersion ?? null },
  });
}

/** Forgets the current user, e.g. after logging out. */
export function resetAnalytics() {
  client?.reset();
}

/** The PostHog client for anything this package doesn't cover (e.g. feature flags), or `null` when off. */
export function getPostHog() {
  return client;
}

function baseProperties(): AnalyticsProperties {
  return {
    app: appName ?? Application.applicationName ?? null,
    app_version: Application.nativeApplicationVersion ?? null,
    environment: __DEV__ ? 'development' : 'production',
    platform: Platform.OS,
  };
}
