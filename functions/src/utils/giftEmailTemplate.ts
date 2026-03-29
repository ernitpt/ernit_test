// ========== SHARED GIFT EMAIL TEMPLATE ==========

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Validates that a URL is an https:// URL and escapes HTML entities so it is
 * safe to embed directly inside an href attribute.
 *
 * Throws if the URL does not start with "https://" to prevent javascript:,
 * data:, and other dangerous schemes from being injected into email markup.
 */
function sanitizeUrl(url: string): string {
    if (!url.startsWith('https://')) {
        throw new Error(`Invalid claim URL: must begin with https://. Received: ${url}`);
    }
    // Encode characters that are meaningful inside an HTML attribute value.
    return url
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function buildGiftEmailHtml(
    giverName: string,
    experienceTitle: string,
    claimUrl: string,
    revealMode: string,
): string {
    const safeName = escapeHtml(giverName);
    const safeTitle = escapeHtml(experienceTitle);

    // Sanitize the URL before injecting it into an href attribute.
    // If the URL fails validation, fall back to a version of the email that
    // omits the broken link rather than exposing malformed markup.
    let safeClaimUrl: string;
    try {
        safeClaimUrl = sanitizeUrl(claimUrl);
    } catch (err) {
        console.error('[giftEmailTemplate] Invalid claimUrl rejected:', (err as Error).message);
        // Return a degraded email without the CTA button so the recipient at
        // least receives the notification even if the link cannot be included.
        return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <span style="font-size: 36px; font-weight: 900; font-style: italic; color: #111827;">ernit<span style="color: #10B981;">.</span></span>
        </div>
        <div style="background: linear-gradient(135deg, #FFF7ED, #FFFBEB); border-radius: 16px; padding: 32px; text-align: center;">
            <p style="font-size: 24px; margin: 0 0 8px;">🎁</p>
            <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px;">
                ${safeName} sent you a challenge!
            </h1>
            <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin: 0 0 24px;">
                Please contact support to claim your challenge.
            </p>
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">
            You received this email because someone sent you an Ernit challenge.
            <br/>If you believe this was sent in error, please ignore this email.
        </p>
        <p style="color: #ccc; font-size: 11px; text-align: center;">
            Ernit · Lisbon, Portugal
        </p>
        <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin-top: 8px;">
            © ${new Date().getFullYear()} Ernit. All rights reserved.
        </p>
    </div>
    `;
    }

    const rewardText = revealMode === 'secret'
        ? 'a mystery reward (hints will be revealed as you progress!)'
        : `<strong>${safeTitle}</strong>`;

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <span style="font-size: 36px; font-weight: 900; font-style: italic; color: #111827;">ernit<span style="color: #10B981;">.</span></span>
        </div>
        <div style="background: linear-gradient(135deg, #FFF7ED, #FFFBEB); border-radius: 16px; padding: 32px; text-align: center;">
            <p style="font-size: 24px; margin: 0 0 8px;">🎁</p>
            <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px;">
                ${safeName} sent you a challenge!
            </h1>
            <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin: 0 0 24px;">
                Set a goal, work towards it, and earn ${rewardText} when you succeed.
            </p>
            <a href="${safeClaimUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #F59E0B, #D97706); color: #fff; font-size: 16px; font-weight: 700; border-radius: 12px; text-decoration: none;">
                Accept Challenge
            </a>
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">
            You received this email because someone sent you an Ernit challenge.
            <br/>If you believe this was sent in error, please ignore this email.
        </p>
        <p style="color: #ccc; font-size: 11px; text-align: center;">
            Ernit · Lisbon, Portugal
        </p>
        <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin-top: 8px;">
            © ${new Date().getFullYear()} Ernit. All rights reserved.
        </p>
    </div>
    `;
}
