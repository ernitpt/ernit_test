/**
 * Input Sanitization Utility
 * 
 * SECURITY: Provides consistent sanitization and validation for all user inputs
 * to prevent XSS, injection attacks, and data corruption.
 */

// Maximum lengths for different input types
export const MAX_LENGTHS = {
    GOAL_TITLE: 100,
    GOAL_DESCRIPTION: 500,
    USER_NAME: 50,
    USER_DESCRIPTION: 300,
    COMMENT_TEXT: 500,
    HINT_TEXT: 500,
    MESSAGE_TEXT: 500,
};

/**
 * Sanitize text input by removing potentially harmful characters
 * and enforcing length limits
 */
export function sanitizeText(
    text: string,
    maxLength: number = MAX_LENGTHS.MESSAGE_TEXT
): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // Trim whitespace
    let sanitized = text.trim();

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters (except newlines and tabs)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Limit length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
}

/**
 * Escape HTML characters to prevent XSS
 * Use this when displaying user-generated content in web views
 */
export function escapeHtml(text: string): string {
    if (!text) return '';

    const htmlEscapes: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };

    return text.replace(/[&<>"'\/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Validate and sanitize email addresses
 */
export function sanitizeEmail(email: string): string {
    if (!email) return '';

    // Trim and lowercase
    const sanitized = email.trim().toLowerCase();

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(sanitized)) {
        throw new Error('Invalid email format');
    }

    return sanitized;
}

/**
 * Sanitize numeric inputs
 */
export function sanitizeNumber(
    value: any,
    min?: number,
    max?: number
): number {
    const num = Number(value);

    if (isNaN(num)) {
        throw new Error('Invalid number');
    }

    if (min !== undefined && num < min) {
        return min;
    }

    if (max !== undefined && num > max) {
        return max;
    }

    return num;
}

/**
 * Sanitize URL to ensure it's valid and safe
 */
export function sanitizeUrl(url: string): string {
    if (!url) return '';

    try {
        const parsed = new URL(url);

        // Only allow https and http protocols
        if (!['https:', 'http:'].includes(parsed.protocol)) {
            throw new Error('Invalid URL protocol');
        }

        return parsed.toString();
    } catch (error) {
        throw new Error('Invalid URL format');
    }
}

/**
 * Sanitize user profile data
 */
export function sanitizeProfileData(data: {
    name?: string;
    description?: string;
    country?: string;
}): {
    name: string;
    description: string;
    country: string;
} {
    return {
        name: sanitizeText(data.name || '', MAX_LENGTHS.USER_NAME),
        description: sanitizeText(data.description || '', MAX_LENGTHS.USER_DESCRIPTION),
        country: sanitizeText(data.country || '', 50),
    };
}

/**
 * Sanitize goal data
 */
export function sanitizeGoalData(data: {
    title?: string;
    description?: string;
}): {
    title: string;
    description: string;
} {
    return {
        title: sanitizeText(data.title || '', MAX_LENGTHS.GOAL_TITLE),
        description: sanitizeText(data.description || '', MAX_LENGTHS.GOAL_DESCRIPTION),
    };
}

/**
 * Check if text contains potentially malicious patterns
 * Returns true if suspicious content detected
 */
export function containsSuspiciousContent(text: string): boolean {
    if (!text) return false;

    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i, // Event handlers like onclick=
        /<iframe/i,
        /<object/i,
        /<embed/i,
        /data:text\/html/i,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(text));
}

/**
 * Validate and sanitize comment text
 */
export function sanitizeComment(text: string): string {
    const sanitized = sanitizeText(text, MAX_LENGTHS.COMMENT_TEXT);

    if (containsSuspiciousContent(sanitized)) {
        throw new Error('Comment contains suspicious content');
    }

    return sanitized;
}
