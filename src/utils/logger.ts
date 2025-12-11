/**
 * Production-safe logging utility
 * Automatically disables all logs in production builds
 */

const isDev = __DEV__;

class Logger {
    log(...args: any[]) {
        if (isDev) {
            console.log(...args);
        }
    }

    info(...args: any[]) {
        if (isDev) {
            console.info(...args);
        }
    }

    warn(...args: any[]) {
        if (isDev) {
            console.warn(...args);
        }
    }

    error(...args: any[]) {
        // Always log errors, even in production
        // But you could add error reporting service here (e.g., Sentry)
        console.error(...args);
    }

    debug(...args: any[]) {
        if (isDev) {
            console.debug(...args);
        }
    }

    table(data: any) {
        if (isDev && console.table) {
            console.table(data);
        }
    }

    group(label: string) {
        if (isDev && console.group) {
            console.group(label);
        }
    }

    groupEnd() {
        if (isDev && console.groupEnd) {
            console.groupEnd();
        }
    }
}

// Export singleton instance
export const logger = new Logger();

// You can also export as default for convenience
export default logger;
