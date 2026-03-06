---
name: firebase-patterns
description: Enforces consistent Firebase/Firestore patterns across the Ernit app. Use whenever creating, modifying, or reviewing any screen, component, or service that involves Firestore operations, error handling, or data fetching.
---

# Firebase Patterns

## Overview

The Ernit app uses Firebase/Firestore as its backend. This skill ensures consistent error handling, data fetching, and listener management across the entire codebase.

**Announce at start:** "I'm using the firebase-patterns skill to ensure consistent error handling and Firestore patterns."

## Error Handling — The Non-Negotiables

### 1. Every Screen Must Have ErrorBoundary

Wrap **every screen component** in `<ErrorBoundary>` to catch render-time crashes:

```tsx
import { ErrorBoundary } from '../components/ErrorBoundary';

const MyScreen: React.FC = () => {
  const { state } = useApp();
  const userId = state.user?.id || 'current_user';

  return (
    <ErrorBoundary screenName="MyScreen" userId={userId}>
      <MainScreen activeRoute="Goals">
        {/* screen content */}
      </MainScreen>
    </ErrorBoundary>
  );
};
```

### 2. Every Catch Block Must Log to Firestore

Never silently swallow errors. Every `catch` must call `logErrorToFirestore`:

```tsx
import { logErrorToFirestore } from '../utils/errorLogger';

// ❌ BAD — error goes to console only, invisible in production
} catch (error) {
  logger.error('Something failed:', error);
}

// ✅ GOOD — error is logged to Firestore `errors` collection
} catch (error) {
  logger.error('Something failed:', error);
  await logErrorToFirestore(error, {
    screenName: 'MyScreen',
    feature: 'LoadGoals',
    userId,
    additionalData: { goalId: goal.id },
  });
}
```

**Required context fields:**
- `screenName` — which screen the error occurred on
- `feature` — which action/flow failed (e.g., `'LoadGoals'`, `'StripePayment'`, `'UploadImage'`)
- `userId` — current user ID (use `state.user?.id`)
- `additionalData` — any relevant IDs or state that helps debug

### 3. Use `withErrorLogging` for Simple Async Calls

For straightforward async operations, use the wrapper instead of manual try/catch:

```tsx
import { withErrorLogging } from '../utils/errorLogger';

// Wraps the async call with automatic error logging
await withErrorLogging(
  () => goalService.updateGoal(goalId, updates),
  { screenName: 'JourneyScreen', feature: 'UpdateGoal', userId }
);
```

## Firestore Listener Patterns

### 4. Always Clean Up Listeners

Every `onSnapshot` or `listenTo*` call in `useEffect` must return a cleanup function:

```tsx
// ❌ BAD — listener leaks on unmount
useEffect(() => {
  goalService.listenToUserGoals(userId, (goals) => {
    setGoals(goals);
  });
}, [userId]);

// ✅ GOOD — listener is cleaned up
useEffect(() => {
  const unsubscribe = goalService.listenToUserGoals(userId, (goals) => {
    setGoals(goals);
  });
  return () => unsubscribe();
}, [userId]);
```

### 5. Guard Against Missing User ID

Always early-return if `userId` is not available:

```tsx
useEffect(() => {
  if (!userId) return;
  // ... listener setup
}, [userId]);
```

## Firestore Data Patterns

### 6. Always Handle Timestamps Safely

Firestore timestamps may or may not have `.toDate()`. Always check:

```tsx
// ❌ BAD — crashes if createdAt is already a Date or string
const date = item.createdAt.toDate();

// ✅ GOOD — handles all cases
const date = item.createdAt && typeof item.createdAt.toDate === 'function'
  ? item.createdAt.toDate()
  : new Date(item.createdAt);
```

### 7. Use Service Layer — Never Raw Firestore in Screens

```tsx
// ❌ BAD — raw Firestore call in a screen component
import { doc, getDoc } from 'firebase/firestore';
const snap = await getDoc(doc(db, 'goals', goalId));

// ✅ GOOD — use the service
import { goalService } from '../services/GoalService';
const goal = await goalService.getGoalById(goalId);
```

**Exception:** One-off queries that don't fit any existing service are acceptable, but must be wrapped in `withErrorLogging`.

## Network Error Handling & User Feedback

### 8. Every Async Call Needs Loading + Error + Success States

Never fire-and-forget. Every screen/component with async operations must track three states:

```tsx
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await goalService.getUserGoals(userId);
      setGoals(data);
    } catch (err) {
      setError('Could not load your goals. Pull down to retry.');
      await logErrorToFirestore(err, {
        screenName: 'GoalsScreen',
        feature: 'LoadGoals',
        userId,
      });
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, [userId]);
```

**In JSX — the three states:**
```tsx
// 1. Loading → skeleton loaders (never spinners)
if (loading) return <GoalCardSkeleton />;

// 2. Error → user-facing message with retry
if (error) return (
  <View style={{ alignItems: 'center', padding: Spacing.screenPadding }}>
    <Text style={{ ...Typography.body, color: Colors.textSecondary, textAlign: 'center' }}>
      {error}
    </Text>
    <TouchableOpacity onPress={fetchData} style={{ marginTop: Spacing.md }}>
      <Text style={{ ...Typography.bodyBold, color: Colors.secondary }}>Try Again</Text>
    </TouchableOpacity>
  </View>
);

// 3. Success → render data
return <GoalList goals={goals} />;
```

### 9. User-Facing Error Messages

Never show raw Firebase errors to users. Map them to friendly messages:

```tsx
// ❌ BAD — exposes internals
Alert.alert('Error', error.message);
// Shows: "FirebaseError: Missing or insufficient permissions"

// ✅ GOOD — human-friendly
const getUserMessage = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('network') || msg.includes('unavailable')) {
    return 'No internet connection. Please check your network and try again.';
  }
  if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
    return 'You don\'t have access to this content.';
  }
  if (msg.includes('not-found')) {
    return 'This content is no longer available.';
  }
  return 'Something went wrong. Please try again.';
};
```

### 10. Retry Pattern for Transient Failures

For operations that may fail due to network issues, use retry with backoff:

```tsx
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error('Unreachable');
}

// Usage — combine with error logging
try {
  const result = await withRetry(() => goalService.updateGoal(goalId, updates));
} catch (error) {
  await logErrorToFirestore(error, {
    screenName: 'JourneyScreen',
    feature: 'UpdateGoal',
    userId,
    additionalData: { goalId, attempts: 3 },
  });
  Alert.alert('Error', 'Could not save your changes. Please try again.');
}
```

**When to retry:**
- Network-related errors (`unavailable`, `deadline-exceeded`)
- Temporary server errors

**When NOT to retry:**
- Permission errors (`permission-denied`) — user issue, won't resolve on retry
- Not-found errors — data doesn't exist
- Validation errors — bad input, won't change on retry

### 11. Offline-Aware Patterns

Firestore has built-in offline persistence. Be aware of it:

```tsx
// Writes may "succeed" locally but fail to sync
// Use onSnapshot to detect sync status:
const unsubscribe = onSnapshot(
  doc(db, 'goals', goalId),
  { includeMetadataChanges: true },
  (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) {
      // Local write not yet confirmed by server
      // Show subtle "Saving..." indicator
    } else {
      // Confirmed by server
    }
  }
);
```

## Existing Utilities Reference

| Utility | Location | Purpose |
|---------|----------|---------|
| `logErrorToFirestore` | `utils/errorLogger.ts` | Log any error to Firestore `errors` collection |
| `withErrorLogging` | `utils/errorLogger.ts` | Wrap async calls with auto error logging |
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | Catch render-time crashes per screen |
| `logger` | `utils/logger.ts` | Console logging (dev only, not persisted) |

## Checklist — Before Submitting Any Change

- [ ] Screen is wrapped in `<ErrorBoundary screenName="..." userId={userId}>`
- [ ] All `catch` blocks call `logErrorToFirestore` with full context
- [ ] All `useEffect` listeners return cleanup functions
- [ ] No raw Firestore calls in screen files (use services)
- [ ] Timestamps are safely converted with `.toDate()` check
- [ ] `userId` is guarded before listener setup
- [ ] Async operations have loading + error + success states
- [ ] Error messages are user-friendly (no raw Firebase errors shown)
- [ ] Network-sensitive operations use retry for transient failures
