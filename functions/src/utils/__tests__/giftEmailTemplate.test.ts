import { escapeHtml, buildGiftEmailHtml } from '../giftEmailTemplate';

// ─── escapeHtml ──────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
    it('escapes < to &lt;', () => {
        expect(escapeHtml('<')).toBe('&lt;');
    });

    it('escapes > to &gt;', () => {
        expect(escapeHtml('>')).toBe('&gt;');
    });

    it('escapes & to &amp;', () => {
        expect(escapeHtml('&')).toBe('&amp;');
    });

    it('escapes " to &quot;', () => {
        expect(escapeHtml('"')).toBe('&quot;');
    });

    it("escapes ' to &#39;", () => {
        expect(escapeHtml("'")).toBe('&#39;');
    });

    it('returns empty string unchanged', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('passes through a string with no special chars', () => {
        expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });

    it('escapes multiple special chars in sequence', () => {
        expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
    });

    it('fully escapes a <script> XSS payload', () => {
        const xss = `<script>alert('xss')</script>`;
        const result = escapeHtml(xss);
        // No raw < or > should remain
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        // Verify specific replacements
        expect(result).toContain('&lt;script&gt;');
        expect(result).toContain('&lt;/script&gt;');
        expect(result).toContain('&#39;xss&#39;');
    });
});

// ─── buildGiftEmailHtml ───────────────────────────────────────────────────────

describe('buildGiftEmailHtml', () => {
    const GIVER = 'Alice';
    const TITLE = 'Skydiving Session';
    const CODE = 'ABC123DEF456';
    const CLAIM_URL = `https://ernit.app/recipient/redeem/${CODE}`;

    function build(overrides: {
        giverName?: string;
        experienceTitle?: string;
        claimUrl?: string;
        revealMode?: string;
    } = {}): string {
        return buildGiftEmailHtml(
            overrides.giverName ?? GIVER,
            overrides.experienceTitle ?? TITLE,
            overrides.claimUrl ?? CLAIM_URL,
            overrides.revealMode ?? 'revealed',
        );
    }

    it('contains the escaped giver name in the output', () => {
        const html = build({ giverName: 'Bob' });
        expect(html).toContain('Bob');
    });

    it('contains the escaped experience title when revealMode is not secret', () => {
        const html = build({ experienceTitle: 'Cooking Class', revealMode: 'revealed' });
        expect(html).toContain('Cooking Class');
    });

    it('contains the claim URL with the code', () => {
        const html = build({ claimUrl: CLAIM_URL });
        expect(html).toContain(CLAIM_URL);
    });

    it('contains the unsubscribe/footer text', () => {
        const html = build();
        expect(html).toContain('You received this email because someone sent you an Ernit challenge.');
    });

    it('escapes XSS in giver name — raw <script> tag does not appear in output', () => {
        const html = build({ giverName: "<script>alert('xss')</script>" });
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML injection in experience title', () => {
        const html = build({
            experienceTitle: '<img src=x onerror="alert(1)">',
            revealMode: 'revealed',
        });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('claim URL contains the expected https://ernit.app/recipient/redeem/ prefix', () => {
        const code = 'XYZ987';
        const url = `https://ernit.app/recipient/redeem/${code}`;
        const html = build({ claimUrl: url });
        expect(html).toContain('https://ernit.app/recipient/redeem/');
        expect(html).toContain(code);
    });

    it('shows mystery reward text when revealMode is secret', () => {
        const html = build({ revealMode: 'secret' });
        expect(html).toContain('mystery reward');
        // The actual experience title should NOT appear as a <strong> label
        expect(html).not.toContain(`<strong>${TITLE}</strong>`);
    });

    it('shows experience title wrapped in <strong> when revealMode is revealed', () => {
        const html = build({ revealMode: 'revealed', experienceTitle: 'Bungee Jump' });
        expect(html).toContain('<strong>Bungee Jump</strong>');
    });
});
