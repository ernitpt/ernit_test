export class DateHelper {
    private static offsetMs = 0;

    /**
     * Get the current time with the debug offset applied.
     * Use this instead of new Date() or Date.now() throughout the app.
     */
    static now(): Date {
        return new Date(Date.now() + this.offsetMs);
    }

    /**
     * Get the current timestamp (number) with the debug offset applied.
     */
    static nowTimestamp(): number {
        return Date.now() + this.offsetMs;
    }

    /**
     * Add time to the current offset.
     * @param ms Milliseconds to add (can be negative)
     */
    static addOffset(ms: number) {
        if (typeof __DEV__ === 'undefined' || !__DEV__) {
            console.warn('DateHelper.addOffset is disabled in production');
            return;
        }
        this.offsetMs += ms;
    }

    /**
     * Reset the time offset to 0 (real time).
     */
    static reset() {
        this.offsetMs = 0;
    }

    /**
     * Get the current offset in milliseconds.
     */
    static getOffset(): number {
        return this.offsetMs;
    }
}
