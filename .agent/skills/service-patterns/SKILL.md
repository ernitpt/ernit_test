---
name: service-patterns
description: Enforces consistent service layer architecture across the Ernit app. Use whenever creating, modifying, or reviewing any file in src/services/ that interacts with Firestore, Cloud Functions, or external APIs.
---

# Service Layer Patterns

## Overview

All backend interactions (Firestore, Cloud Functions, external APIs) go through a dedicated service layer in `src/services/`. This skill defines the canonical patterns every service must follow.

**Announce at start:** "I'm using the service-patterns skill to ensure consistent service architecture."

---

## 1. Service Instantiation

### Preferred: Class-Based Singleton

Use this for services with shared state, internal caching, or multiple interdependent methods:

```tsx
import { db } from './firebase';
import { collection } from 'firebase/firestore';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';

class MyService {
  private static instance: MyService;
  private myCollection = collection(db, 'myCollection');

  static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }

  // ... public methods
}

export const myService = MyService.getInstance();
```

**Real examples:**
- `FriendService` — uses `static getInstance()` with `private static instance`
- `GoalService` — class with internal state (`DEBUG_ALLOW_MULTIPLE_PER_DAY`), exported as `new GoalService()`
- `StorageService` — class with private `storage` instance, exported as `new StorageService()`
- `NotificationService` — class exported as `new NotificationService()`

### Alternative: Object Literal

Use this for stateless utility services that wrap external API calls:

```tsx
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';

export const myUtilService = {
  async doSomething(param: string): Promise<Result> {
    try {
      // ... implementation
    } catch (error: any) {
      logger.error('Error in doSomething:', error);
      await logErrorToFirestore(error, {
        feature: 'DoSomething',
        additionalData: { param },
      });
      return null;
    }
  },
};
```

**Real example:** `stripeService` — stateless wrapper around Stripe HTTP endpoints.

### When to Use Which

| Pattern | When |
|---------|------|
| Class-based singleton | Service has internal state, caches, collection refs, or many methods that share context |
| Object literal | Simple stateless utilities, thin wrappers around external APIs, fewer than 5 methods |

---

## 2. Method Error Handling

Every public method MUST follow this structure:

```tsx
async getById(id: string): Promise<MyType | null> {
  try {
    const docRef = doc(db, 'myCollection', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return normalizeMyType({ id: snap.id, ...snap.data() });
  } catch (error: any) {
    logger.error('Error fetching by id:', error);
    await logErrorToFirestore(error, {
      feature: 'MyService.getById',
      additionalData: { id },
    });
    return null; // Sensible default
  }
}
```

### Rules

1. **Wrap the entire body** in `try/catch` -- no unguarded Firestore calls.
2. **Log with `logger.error`** for dev-time console visibility.
3. **Call `logErrorToFirestore`** with context so errors are persisted to the `errors` collection.
4. **Return a sensible default** on error instead of propagating the exception:

| Return type | Default on error |
|-------------|-----------------|
| `T | null` | `null` |
| `T[]` | `[]` |
| `boolean` | `false` |
| `void` | (just return) |
| `string` | `''` |

5. **Exception:** If the caller absolutely needs to know about the failure (e.g., payment processing), you may re-throw after logging. Document this in a JSDoc comment:

```tsx
/** @throws Re-throws after logging -- caller must handle */
async createPaymentIntent(...): Promise<Result> {
  try {
    // ...
  } catch (error: any) {
    logger.error('Error creating payment intent:', error);
    await logErrorToFirestore(error, { feature: 'PaymentIntent', ... });
    throw error; // Caller handles UI feedback
  }
}
```

### Required Imports

Every service file must import these:

```tsx
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
```

---

## 3. Real-Time Listener Methods

For any data the UI needs to stay in sync with, expose a `listenTo*` method:

```tsx
listenToUserItems(userId: string, callback: (items: MyType[]) => void): () => void {
  const q = query(
    collection(db, 'myCollection'),
    where('userId', '==', userId)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      callback(items);
    },
    (error) => {
      logger.error('Error in listenToUserItems:', error);
      logErrorToFirestore(error, {
        feature: 'MyService.listenToUserItems',
        additionalData: { userId },
      });
    }
  );

  return unsubscribe;
}
```

### Rules

1. **Return type is `() => void`** -- the unsubscribe function.
2. **Always pass the error callback** as the third argument to `onSnapshot`.
3. **Normalize data** inside the success callback before passing to the caller.
4. **Never set component state inside the service** -- pass normalized data to the callback and let the component handle state.

### Usage in Components

```tsx
useEffect(() => {
  if (!userId) return;

  const unsubscribe = myService.listenToUserItems(userId, (items) => {
    setItems(items);
    setLoading(false);
  });

  return () => unsubscribe();
}, [userId]);
```

---

## 4. CRUD Methods -- Standard Naming

Every domain service should expose these methods where applicable. Each follows the error handling pattern from section 2.

| Method | Signature | Returns on error |
|--------|-----------|-----------------|
| `getById` | `(id: string) => Promise<MyType \| null>` | `null` |
| `getAll` | `(filters) => Promise<MyType[]>` | `[]` |
| `create` | `(data: Omit<MyType, 'id'>) => Promise<MyType \| null>` | `null` |
| `update` | `(id: string, data: Partial<MyType>) => Promise<boolean>` | `false` |
| `delete` | `(id: string) => Promise<boolean>` | `false` |

Key implementation details:
- `create` must add `createdAt: serverTimestamp()` and `updatedAt: serverTimestamp()`
- `update` must add `updatedAt: serverTimestamp()`
- `getById` must check `snap.exists()` before reading data
- `getAll` should build query constraints dynamically from the filters object
- All methods must normalize data before returning (see section 7)

**Naming convention:** Use domain-specific names when clearer (e.g., `getGoalById`, `createNotification`), but keep the verb pattern consistent: `get*`, `create*`, `update*`, `delete*`.

---

## 5. Firestore Transaction Pattern

Use `runTransaction` when multiple reads and writes must be atomic:

```tsx
async transferCredits(fromId: string, toId: string, amount: number): Promise<boolean> {
  try {
    await runTransaction(db, async (transaction) => {
      const fromRef = doc(db, 'accounts', fromId);
      const toRef = doc(db, 'accounts', toId);
      const fromSnap = await transaction.get(fromRef);
      const toSnap = await transaction.get(toRef);
      if (!fromSnap.exists() || !toSnap.exists()) throw new Error('Account not found');
      if (fromSnap.data().balance < amount) throw new Error('Insufficient balance');
      transaction.update(fromRef, { balance: fromSnap.data().balance - amount });
      transaction.update(toRef, { balance: toSnap.data().balance + amount });
    });
    return true;
  } catch (error: any) {
    logger.error('Error in transferCredits:', error);
    await logErrorToFirestore(error, {
      feature: 'MyService.transferCredits',
      additionalData: { fromId, toId, amount },
    });
    return false;
  }
}
```

### Transaction Rules

1. **All reads before writes** -- Firestore requires this within a transaction.
2. **Validate inside the transaction** -- check `exists()` and business rules.
3. **Throw on invalid state** -- the transaction rolls back automatically.
4. **Wrap the entire `runTransaction`** in standard try/catch error handling.

---

## 6. Cloud Function Calls

When calling server-side Cloud Functions via `httpsCallable`:

```tsx
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { config } from '../config/environment';

async callMyFunction(param1: string, param2: number): Promise<ResultType | null> {
  try {
    const callable = httpsCallable(functions, config.functionNames.myFunction);
    const result = await callable({ param1, param2 });
    return result.data as ResultType;
  } catch (error: any) {
    logger.error('Error calling myFunction:', error);
    await logErrorToFirestore(error, {
      feature: 'MyService.callMyFunction',
      additionalData: { param1, param2 },
    });
    return null;
  }
}
```

For direct HTTP calls (as in `stripeService`), the same pattern applies but also requires:
- Get `idToken` via `auth.currentUser.getIdToken()`
- Set `Authorization: Bearer ${idToken}` header
- Check `response.ok` and parse error body before throwing
- Use `config.functionsUrl` and `config.stripeFunctions` for URLs -- never hardcode

See `stripeService.ts` for the full HTTP call pattern.

### Rules

1. **Always authenticate** -- get `idToken` from `auth.currentUser`.
2. **Use `config.functionNames`** (or `config.stripeFunctions`) -- never hardcode function names.
3. **Check `response.ok`** for HTTP calls and parse error bodies before throwing.

---

## 7. Data Normalization

Services must normalize raw Firestore data before returning it. Never return raw `doc.data()`.

### Standard Normalize Function

Place this at the top of the service file (private helper):

```tsx
function normalizeMyType(raw: any): MyType {
  return {
    id: raw.id,
    // Convert Firestore Timestamps to JS Dates
    createdAt: raw.createdAt && typeof raw.createdAt.toDate === 'function'
      ? raw.createdAt.toDate()
      : new Date(raw.createdAt),
    updatedAt: raw.updatedAt && typeof raw.updatedAt.toDate === 'function'
      ? raw.updatedAt.toDate()
      : new Date(raw.updatedAt),
    // Set defaults for optional fields
    status: raw.status || 'active',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    count: typeof raw.count === 'number' ? raw.count : 0,
    isActive: !!raw.isActive,
    // Pass through required fields
    userId: raw.userId,
    name: raw.name || '',
  };
}
```

### Normalization Rules

1. **Always include `id`** from `doc.id`.
2. **Convert Timestamps** -- check for `.toDate()` method before calling it (the value might already be a Date or a string depending on cache state).
3. **Set defaults for optional fields** -- empty arrays `[]`, zero `0`, empty string `''`, `false`, `null`.
4. **Validate types** -- use `typeof x === 'number'` guards, `Array.isArray()`, etc.
5. **Return the domain type** -- the function return type must be the TypeScript interface, not `any`.

**Real example:** See `normalizeGoal()` in `GoalService.ts` for a thorough implementation.

---

## 8. File Organization

### Rules

1. **One service per domain.** Each Firestore collection or external integration gets its own service file.
2. **Location:** All services live in `src/services/`.
3. **Naming:** `PascalCaseService.ts` for class-based (e.g., `GoalService.ts`, `FriendService.ts`), `camelCaseService.ts` for object literals (e.g., `stripeService.ts`).
4. **Export a singleton instance** at the bottom of the file:
   ```tsx
   export const myService = MyService.getInstance();
   // or
   export const myService = new MyService();
   ```
5. **Types** go in `src/types/index.ts`, not in the service file.
6. **Normalize functions** are private to the service file (not exported unless shared).
7. **Helper functions** (pure utilities) can be at the top of the file before the class.

### Standard File Structure

```
src/services/MyService.ts
  - Imports (firebase, types, logger, errorLogger, config)
  - Helper / normalize functions
  - Class definition with:
      - private static instance (if singleton)
      - private collection ref
      - static getInstance()
      - CRUD methods
      - Listener methods
      - Domain-specific methods
  - Export singleton instance
```

---

## Checklist -- Before Submitting Any Service Change

- [ ] Service uses class-based singleton (or object literal with justification)
- [ ] Every public method has try/catch with `logErrorToFirestore`
- [ ] Every catch block also calls `logger.error` for dev visibility
- [ ] Methods return sensible defaults on error (null, [], false) -- not unhandled throws
- [ ] Listener methods return an unsubscribe function `() => void`
- [ ] Listener `onSnapshot` calls include the error callback (third argument)
- [ ] All Firestore data is normalized before returning (Timestamps converted, defaults set)
- [ ] `id` is added from `doc.id` in all returned objects
- [ ] Types are imported from `src/types/index.ts` (not inline)
- [ ] `config.functionNames` is used for Cloud Function names (no hardcoded strings)
- [ ] Cloud Function HTTP calls include `Authorization: Bearer ${idToken}` header
- [ ] Transactions do all reads before writes
- [ ] File follows standard structure (imports, helpers, class, singleton export at bottom)
