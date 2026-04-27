# Internationalization (i18n) System

## Overview
The app uses **i18next v26** + **react-i18next v17** with two locales: English (`en`) and Portuguese (`pt`). Translations cover ~1933 keys across all screens, components, and error messages. Default language is English; users can switch to PT-PT at runtime.

## Components

- **Core**: `src/i18n/index.ts` — i18next setup. Registers both locale JSON files under the single `translation` namespace. `lng: 'en'`, `fallbackLng: 'en'`, `compatibilityJSON: 'v4'`, `escapeValue: false`.
- **Context**: `src/context/LanguageContext.tsx` — React context exposing `language: AppLanguage` and `setLanguage(lang)`. Also exports `useLanguageSync(preferredLanguage?)` — a hook called in `AppNavigator` to auto-sync language from the authenticated user's Firestore profile without creating a circular provider dependency.
- **Translations**: `src/i18n/locales/en.json`, `src/i18n/locales/pt.json`
- **Language toggle**: `src/components/SideMenu.tsx` — UI entry point for the user to switch language at runtime.
- **Profile sync**: `src/navigation/AppNavigator.tsx` — calls `useLanguageSync(user.preferredLanguage)` to auto-apply language from the user profile on login.

## Usage Pattern

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

// Simple key
t('common.save')                             // → "Save"

// Interpolation
t('profile.wishlist.viewDetailsAccessibility', { title: experience.title })

// Plural (uses i18next count convention)
t('plurals.goals', { count: 3 })             // → "3 goals"
```

No namespace prefix needed — all keys live in the single `translation` namespace.

## Translation Key Organization

Top-level groups in `en.json`:

| Group | Purpose |
|-------|---------|
| `common` | Shared UI labels: confirm, cancel, save, delete, login, etc. |
| `time` | Relative time strings: justNow, minutesAgo, hoursAgo, daysAgo |
| `plurals` | Plural forms for counts: goals, weeks, sessions, friends, comments |
| `nav` | Bottom tab + sidebar navigation labels |
| `accessibility` | Screen-reader labels and hints |
| `sideMenu` | Side menu items + language toggle |
| `loginPrompt` | AuthGuard "Login required" modal copy |
| `errors` | Generic error strings, including `errors.boundary.*` for `ErrorBoundary` fallback UI |
| `authErrors` | Firebase Auth error code → user-facing message mapping |
| `auth` | Auth screens (login, signup, forgot password) |
| `settings` | Settings screen + subsections |
| `goalDetail` | Goal detail screen |
| `friends` | Friend list, requests, search |
| `giver` | Giver flow screens (CategorySelection, Checkout, Confirmation, Deferred setup, etc.) |
| `wizard` | GiftFlowScreen + ChallengeSetupScreen multi-step wizards |
| `recipient` | Recipient flow screens (Journey, GoalSetting, Share, CompletedGoalCard) |
| `booking` | Booking calendar + venue selection |
| `modals` | Shared modal copy (ContactModal, MotivationModal, etc.) |
| `profile`, `goals`, `feed`, `notifications`, `cart`, `landing` | Per-screen keys |

Helper: `src/utils/i18nHelpers.ts` exports `getLocaleString(lang?)` — returns the IETF locale string for `Intl` APIs (e.g. number/date formatting).

Nested keys use dot notation: `t('profile.achievements.claimExperience')`.

## Language Detection & Switching

1. **Startup default**: `lng: 'en'` in i18next config — app always starts in English.
2. **Persisted preference**: `LanguageProvider` reads `AsyncStorage` key `@ernit_language` on mount. If `'en'` or `'pt'` is found, it calls `i18n.changeLanguage()` immediately.
3. **Profile sync**: `useLanguageSync` (called in `AppNavigator`) switches language whenever `user.preferredLanguage` changes — e.g. after login or profile update.
4. **Manual toggle**: User opens SideMenu → selects language → `setLanguage(lang)` is called, which calls `i18n.changeLanguage(lang)` and persists to AsyncStorage.

## Adding New Keys

1. Add the key to `src/i18n/locales/en.json` under the appropriate group.
2. Add the matching key + Portuguese translation to `src/i18n/locales/pt.json`.
3. Reference in code via `t('group.key')`.
4. For new screens, create a top-level group named after the screen (e.g. `"myScreen": { ... }`).

## Common Patterns

```tsx
// Interpolation
t('time.startsInDays', { count: 5 })        // "Starts in 5 days"

// Pluralization — use _one / _other suffixes in JSON
// en.json: "goals_one": "{{count}} goal", "goals_other": "{{count}} goals"
t('plurals.goals', { count: 1 })            // "1 goal"
t('plurals.goals', { count: 3 })            // "3 goals"

// Nested key
t('profile.toast.couldNotLoad')

// Accessibility label with variable
t('profile.wishlist.removeAccessibility', { title: 'Yoga Mat' })
```

## Type: AppLanguage

```ts
export type AppLanguage = 'en' | 'pt';
```

Exported from `src/context/LanguageContext.tsx`. Use this type for any language-related props or Firestore `preferredLanguage` fields.
