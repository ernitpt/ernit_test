/**
 * Tests for the CORS allowed-origins configuration.
 *
 * cors.ts reads `process.env.FUNCTIONS_EMULATOR` at module-load time, so we
 * must reset the module registry and re-import the module for each test group
 * that needs a different env value.
 */

describe('allowedOrigins — production mode (FUNCTIONS_EMULATOR not set)', () => {
    let allowedOrigins: string[];

    beforeAll(() => {
        // Ensure the env var is absent, then import fresh
        delete process.env.FUNCTIONS_EMULATOR;
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        allowedOrigins = require('../cors').allowedOrigins as string[];
    });

    afterAll(() => {
        jest.resetModules();
    });

    it('includes https://ernit.app', () => {
        expect(allowedOrigins).toContain('https://ernit.app');
    });

    it('all origins use https (no http:// origins)', () => {
        for (const origin of allowedOrigins) {
            expect(origin.startsWith('https://')).toBe(true);
        }
    });

    it('does not include any localhost origin', () => {
        const hasLocalhost = allowedOrigins.some((o) => o.includes('localhost'));
        expect(hasLocalhost).toBe(false);
    });

    it('returns only the production origins (no dev extras)', () => {
        // All entries must be https
        expect(allowedOrigins.every((o) => o.startsWith('https://'))).toBe(true);
        // Must be a non-empty array
        expect(allowedOrigins.length).toBeGreaterThan(0);
    });
});

describe('allowedOrigins — emulator mode (FUNCTIONS_EMULATOR=true)', () => {
    let allowedOrigins: string[];

    beforeAll(() => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        allowedOrigins = require('../cors').allowedOrigins as string[];
    });

    afterAll(() => {
        delete process.env.FUNCTIONS_EMULATOR;
        jest.resetModules();
    });

    it('includes localhost origins in emulator mode', () => {
        const hasLocalhost = allowedOrigins.some((o) => o.includes('localhost'));
        expect(hasLocalhost).toBe(true);
    });

    it('still includes https://ernit.app in emulator mode', () => {
        expect(allowedOrigins).toContain('https://ernit.app');
    });

    it('includes http://localhost:8081', () => {
        expect(allowedOrigins).toContain('http://localhost:8081');
    });

    it('includes http://localhost:3000', () => {
        expect(allowedOrigins).toContain('http://localhost:3000');
    });

    it('has more origins than production mode', () => {
        // In emulator mode, DEV_ORIGINS are prepended so total > prod-only count
        expect(allowedOrigins.length).toBeGreaterThan(2);
    });
});

describe('allowedOrigins — non-emulator false value (FUNCTIONS_EMULATOR=false)', () => {
    let allowedOrigins: string[];

    beforeAll(() => {
        process.env.FUNCTIONS_EMULATOR = 'false';
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        allowedOrigins = require('../cors').allowedOrigins as string[];
    });

    afterAll(() => {
        delete process.env.FUNCTIONS_EMULATOR;
        jest.resetModules();
    });

    it('does not include localhost when FUNCTIONS_EMULATOR is "false"', () => {
        const hasLocalhost = allowedOrigins.some((o) => o.includes('localhost'));
        expect(hasLocalhost).toBe(false);
    });

    it('only contains https origins', () => {
        expect(allowedOrigins.every((o) => o.startsWith('https://'))).toBe(true);
    });
});
