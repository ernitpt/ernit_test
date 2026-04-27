/**
 * Global error handlers — catch errors that escape React's tree.
 *
 * Web (window):
 *   - 'unhandledrejection' for uncaught promise rejections (async/await without catch)
 *   - 'error' for runtime exceptions outside React (e.g. setTimeout/setInterval callbacks)
 *
 * Native (ErrorUtils):
 *   - setGlobalHandler for unhandled JS exceptions on iOS/Android
 *
 * Logs to the `errors` Firestore collection via logErrorToFirestore and to GA4
 * 'exception' events via trackError. Includes deduplication so the same incident
 * raised inside a React component (which would also fire ErrorBoundary) doesn't
 * double-log.
 *
 * Future Sentry/Bugsnag integration: plug into reportError() below.
 */
import { Platform } from 'react-native';
import { logErrorToFirestore } from './errorLogger';
import { trackError } from './analytics';
import { analyticsService } from '../services/AnalyticsService';
import { logger } from './logger';

let installed = false;

const recentSignatures: { sig: string; t: number }[] = [];
const DEDUP_WINDOW_MS = 30_000;
const DEDUP_MAX = 20;

function makeSignature(err: unknown): string {
  if (err instanceof Error) {
    const firstFrame = err.stack?.split('\n').slice(0, 2).join('|') ?? '';
    return `${err.name}|${err.message}|${firstFrame}`.slice(0, 300);
  }
  return String(err).slice(0, 300);
}

function isDuplicate(err: unknown): boolean {
  const sig = makeSignature(err);
  const now = Date.now();
  while (recentSignatures.length && now - recentSignatures[0].t > DEDUP_WINDOW_MS) {
    recentSignatures.shift();
  }
  if (recentSignatures.find(e => e.sig === sig)) return true;
  recentSignatures.push({ sig, t: now });
  if (recentSignatures.length > DEDUP_MAX) recentSignatures.shift();
  return false;
}

type ErrorSource = 'unhandledrejection' | 'window.error' | 'native.global';

async function reportError(err: unknown, source: ErrorSource, extra?: Record<string, unknown>) {
  try {
    if (isDuplicate(err)) {
      logger.warn(`[globalErrorHandler] dedup: ${source}`);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[globalErrorHandler:${source}]`, message);

    trackError(message.substring(0, 150), false);

    analyticsService.trackEvent(
      'unhandled_rejection',
      'error',
      { source, message: message.substring(0, 200), ...extra }
    );

    await logErrorToFirestore(err, {
      feature: source,
      additionalData: extra,
    });
  } catch (loopErr) {
    // Last-resort: console only. Never throw or call into reporter again.
    // eslint-disable-next-line no-console
    console.error('[globalErrorHandler] reporter itself failed:', loopErr);
  }
}

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      reportError(event.reason, 'unhandledrejection');
    });

    window.addEventListener('error', (event: ErrorEvent) => {
      // Skip cross-origin script errors (no info available)
      if (!event.error && event.message === 'Script error.') return;
      reportError(event.error ?? new Error(event.message), 'window.error', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    return;
  }

  // Native (iOS/Android) — ErrorUtils is part of the React Native runtime
  type RNErrorUtils = {
    getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
    setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
  };
  const errorUtils: RNErrorUtils | undefined = (global as unknown as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (!errorUtils) return;

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, 'native.global', { isFatal: !!isFatal });
    if (previousHandler) previousHandler(error, isFatal);
  });
}
