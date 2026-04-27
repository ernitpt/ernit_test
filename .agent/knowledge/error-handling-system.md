# Error Handling System

## Overview
Three-layer error handling infrastructure:
1. **ErrorBoundary** — React class component that catches render-phase crashes per screen.
2. **logErrorToFirestore / withErrorLogging** — runtime error capture for async operations in try/catch blocks.
3. **globalErrorHandlers** — catches errors that escape React's tree (unhandled promise rejections, native global exceptions).
All layers write to the Firestore `errors` collection and fire analytics events via `AnalyticsService`.

## Components

| Component | File | Purpose |
|-----------|------|---------|
| `ErrorBoundary` | `src/components/ErrorBoundary.tsx` | Wraps screen trees; catches render crashes, shows fallback UI, lets user retry. |
| `logErrorToFirestore` | `src/utils/errorLogger.ts` | Async function to log any error to Firestore with context fields. |
| `withErrorLogging` | `src/utils/errorLogger.ts` | Generic async wrapper: logs + re-throws so calling code still handles it. |
| `installGlobalErrorHandlers` | `src/utils/globalErrorHandlers.ts` | Installs platform-level hooks (web: window events; native: ErrorUtils). Call once at app boot. |
| `AppError` | `src/utils/AppError.ts` | Custom error subclass with `code` + `category` + `isUserFacing`. |

## ErrorBoundary Pattern

Every screen's root return MUST be wrapped:

```tsx
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';

const { state } = useApp();

return (
  <ErrorBoundary screenName="GoalDetail" userId={state.user?.id}>
    {/* screen content */}
  </ErrorBoundary>
);
```

- `screenName` — required string, used in analytics + Firestore error doc.
- `userId` — optional; pre-auth screens (e.g. LandingScreen) may omit it.
- Fallback UI shows a "Try again" button (up to 2 attempts). After 2 attempts only a permanent error message is shown.
- On web, `handleReset` calls `window.location.reload()`.
- Tracks `error_boundary_triggered` ('error' category) via `AnalyticsService`.

### Implementation note: class + hook wrapper
`src/components/ErrorBoundary.tsx` uses a two-component pattern. The actual React error boundary is a class component (`ErrorBoundaryClass`) because `componentDidCatch` is only available on classes. The exported `ErrorBoundary` is a thin functional wrapper that calls hooks (`useTranslation`, `useColors`) and forwards their results as props to the class. This lets the fallback UI use i18n and theme-aware colors without violating the rules-of-hooks boundary.

All fallback copy is i18n'd via `t('errors.boundary.*')` keys (see `i18n-system.md`).

## logErrorToFirestore

```ts
await logErrorToFirestore(error, {
  screenName?: string,   // e.g. 'CartScreen'
  feature?: string,      // e.g. 'StripePayment' — used as `context` field in Firestore
  userId?: string,       // falls back to auth.currentUser?.uid or 'anonymous'
  additionalData?: Record<string, unknown>,
});
```

- Rate-limited to **10 writes per minute** per client (surplus calls silently dropped).
- Falls back to `localStorage` (key `ernit_error_log`, max 20 entries) if Firestore write fails.
- Fields written: `message`, `stack` (≤2000 chars), `context`, `screenName`, `userId`, `timestamp`, `userAgent`, `additionalData`.

## withErrorLogging

```ts
const result = await withErrorLogging(
  () => someAsyncOperation(),
  { feature: 'PaymentProcessing', userId }
);
```

- Re-throws after logging — the caller must still handle the error (e.g. show a toast).
- Prefer over manual try/catch when you have no other catch-side logic. Use manual try/catch when you need to inspect the error type (e.g. `AppError` category check).

## Global Error Handlers

`installGlobalErrorHandlers()` must be called **once** at app boot (e.g. `App.tsx`). It is idempotent.

| Platform | Hook | Events caught |
|----------|------|---------------|
| Web | `window.addEventListener('unhandledrejection')` | Uncaught async/await |
| Web | `window.addEventListener('error')` | Runtime exceptions outside React |
| Native | `ErrorUtils.setGlobalHandler` | Unhandled JS exceptions (iOS/Android) |

- **Deduplication**: same error signature within a 30-second window is logged only once (prevents double-logging with ErrorBoundary).
- Fires `unhandled_rejection` analytics event (category 'error') with `source` and `message` fields.
- Chains the previous native handler so the RN red box is not suppressed.

## AppError Class

```ts
throw new AppError('GOAL_LIMIT_REACHED', 'You can have up to 3 active goals', 'business');
```

| Field | Type | Notes |
|-------|------|-------|
| `code` | `string` | Machine-readable identifier for programmatic handling. |
| `category` | `ErrorCategory` | `validation` / `business` / `not_found` / `auth` / `rate_limit` / `internal` |
| `isUserFacing` | `boolean` (getter) | `true` when category !== 'internal' — message is safe to show users. |

Helper utilities exported from the same file:
- `getUserMessage(error, fallback?)` — extracts safe user message; handles Firebase Functions error codes.
- `isErrorCode(error, code)` — matches `AppError.code` or `Error.message`.

## Firestore `errors` Collection

**Schema** (`ErrorLogData`):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `message` | string | yes | ≤1000 chars |
| `timestamp` | Timestamp | yes | |
| `stack` | string | no | ≤2000 chars |
| `context` | string | no | feature/screen label ≤200 chars |
| `screenName` | string | no | ≤100 chars |
| `userId` | string | no | ≤128 chars |
| `userAgent` | string | no | ≤500 chars |
| `additionalData` | map | no | arbitrary key/value pairs |

**Security rules**: anyone (including unauthenticated) can `create`; `read`, `update`, `delete` are `false`. Structure and field sizes are validated server-side to prevent DoS. To inspect production errors: Firebase Console → Firestore → `errors` collection.

## Analytics Integration

| Event | Category | Source | Properties |
|-------|----------|--------|------------|
| `error_boundary_triggered` | `error` | `ErrorBoundary.componentDidCatch` | `screenName`, `errorMessage` |
| `unhandled_rejection` | `error` | `globalErrorHandlers` | `source`, `message` |

Both event names are part of the `AnalyticsEventName` union in `src/types/index.ts`.
