import type { TFunction } from 'i18next';
import i18n from '../i18n';
import type { AppLanguage } from '../context/LanguageContext';

/**
 * Maps app language code to full Intl locale string.
 */
export function getLocaleString(lang?: AppLanguage): string {
  const lng = lang ?? (i18n.language as AppLanguage) ?? 'en';
  return lng === 'pt' ? 'pt-PT' : 'en-US';
}

/**
 * Locale-aware date formatting. Replaces all hardcoded toLocaleDateString('en-US', ...) calls.
 */
export function formatLocalDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const intlLocale = locale ?? getLocaleString();
  return date.toLocaleDateString(intlLocale, options);
}

/**
 * Locale-aware relative time formatting.
 * Replaces custom formatNotificationDate and fmtTimeAgo functions.
 */
export function formatRelativeTime(dateMs: number, t: TFunction): string {
  const diffMs = Date.now() - dateMs;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('time.daysAgo', { count: diffDays });
  if (diffWeeks < 5) return t('time.weeksAgo', { count: diffWeeks });
  if (diffMonths < 12) return t('time.monthsAgo', { count: diffMonths });

  return formatLocalDate(new Date(dateMs), { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Intl-derived weekday abbreviations. Replaces hardcoded weekDays arrays.
 * Returns Sun-Sat order by default.
 */
export function getWeekdayAbbreviations(locale?: string, style: 'narrow' | 'short' = 'narrow'): string[] {
  const intlLocale = locale ?? getLocaleString();
  // Jan 1 2023 is a Sunday
  const ref = new Date(2023, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ref);
    d.setDate(ref.getDate() + i);
    return new Intl.DateTimeFormat(intlLocale, { weekday: style }).format(d);
  });
}

/**
 * Intl-derived month names. Replaces hardcoded monthNames arrays.
 */
export function getMonthNames(locale?: string, style: 'long' | 'short' = 'long'): string[] {
  const intlLocale = locale ?? getLocaleString();
  return Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(intlLocale, { month: style }).format(new Date(2023, i, 1))
  );
}
