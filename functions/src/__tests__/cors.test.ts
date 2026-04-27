/**
 * Tests for the CORS allowed-origins configuration.
 *
 * Localhost origins are always included so developers running the web app on
 * localhost can call deployed functions during test-environment work.
 */

describe('allowedOrigins', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { allowedOrigins } = require('../cors') as { allowedOrigins: string[] };

    it('includes https://ernit.app', () => {
        expect(allowedOrigins).toContain('https://ernit.app');
    });

    it('includes http://localhost:8081', () => {
        expect(allowedOrigins).toContain('http://localhost:8081');
    });

    it('includes http://localhost:3000', () => {
        expect(allowedOrigins).toContain('http://localhost:3000');
    });

    it('is a non-empty array', () => {
        expect(allowedOrigins.length).toBeGreaterThan(0);
    });
});
