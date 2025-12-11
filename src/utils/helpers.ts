// Utility functions for the Ernit app
import { getRandomBytes } from 'expo-crypto';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 8; // Increased from 6 to 8 for better security
  const randomBytes = await getRandomBytes(codeLength);

  let code = '';
  for (let i = 0; i < codeLength; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
};

// Legacy sync version for non-critical uses (e.g., UI IDs)
export const generateTempId = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const calculateProgressPercentage = (current: number, target: number): number => {
  return Math.min((current / target) * 100, 100);
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
    relaxation: 'Relaxation',
    'food-culture': 'Food & Culture',
    'romantic-getaway': 'Romantic Getaway',
    'foreign-trip': 'Foreign Trip',
  };
  return categoryMap[category] || category;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateClaimCode = (code: string): boolean => {
  // Updated to support 8-char codes (new secure format) and legacy 6-char codes
  return /^[A-Z0-9]{6,8}$/.test(code);
};
