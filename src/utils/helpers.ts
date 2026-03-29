// Utility functions for the Ernit app
import { getRandomBytes } from 'expo-crypto';

export const formatCurrency = (
  amount: number,
  currency: string = 'EUR',
  locale: string = 'de-DE' // German locale for EUR formatting
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * ✅ SECURITY: Generate cryptographically secure claim code
 * Uses expo-crypto for true randomness instead of Math.random()
 */
export const generateClaimCode = async (): Promise<string> => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // 36 chars
  const codeLength = 12; // Must match server-side (stripeWebhook.ts)
  // Rejection sampling to eliminate modulo bias:
  // 256 / 36 = 7.11, so multiples of 36 up to 252 (7 * 36) are unbiased.
  const maxValid = 252; // floor(256 / 36) * 36
  let result = '';
  while (result.length < codeLength) {
    const batch = await getRandomBytes(codeLength - result.length);
    for (const byte of batch) {
      if (byte < maxValid && result.length < codeLength) {
        result += chars[byte % 36];
      }
    }
  }
  return result;
};

// Legacy sync version for non-critical uses (e.g., UI IDs)
export const generateTempId = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const calculateProgressPercentage = (current: number, target: number): number => {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
};

export const getProgressStage = (percentage: number): 'early' | 'mid' | 'late' | 'reveal' => {
  if (percentage <= 33) return 'early';
  if (percentage <= 66) return 'mid';
  if (percentage < 100) return 'late';
  return 'reveal';
};

export const getCategoryDisplayName = (category: string): string => {
  const categoryMap: Record<string, string> = {
    adventure: 'Adventure',
    wellness: 'Wellness',
    creative: 'Creative',
  };
  return categoryMap[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateClaimCode = (code: string): boolean => {
  // Must match server-side 12-char format (stripeWebhook.ts)
  return /^[A-Z0-9]{12}$/.test(code);
};
