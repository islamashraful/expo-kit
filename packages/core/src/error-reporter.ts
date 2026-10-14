export type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;

let reporter: ErrorReporter | null = null;

/**
 * Tells the kit where to send errors, e.g. Sentry. Call once at app startup.
 * Pass `null` to remove it.
 */
export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next;
}

/**
 * Used by kit packages to report an error to whatever the app set with `setErrorReporter`.
 * In development the error is also logged to the console.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) console.error('[expo-kit]', error, context ?? '');
  if (!reporter) return;
  try {
    reporter(error, context);
  } catch (reporterError) {
    // A broken reporter must never crash the app.
    if (__DEV__) console.error('[expo-kit] Error reporter failed', reporterError);
  }
}
