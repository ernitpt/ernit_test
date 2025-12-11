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
        this.offsetMs += ms;
        console.log(`🕒 [DateHelper] Time advanced by ${ms / 1000 / 60 / 60} hours. Current simulated time: ${this.now().toISOString()}`);
    }

    /**
     * Reset the time offset to 0 (real time).
     */
    static reset() {
        this.offsetMs = 0;
        console.log('🕒 [DateHelper] Time reset to real time.');
    }

    /**
     * Get the current offset in milliseconds.
     */
    static getOffset(): number {
        return this.offsetMs;
    }
}
