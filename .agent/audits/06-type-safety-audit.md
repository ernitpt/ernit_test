# Type Safety Audit — Ernit App
**Date:** 2026-03-29
**Auditor:** Scheduled Agent (claude-sonnet-4-6)
**Scope:** `src/**/*.{ts,tsx}`, `functions/src/**/*.ts`

---

## Severity Legend
- 🔴 **HIGH** — Could cause runtime crash or data corruption
- 🟡 **MEDIUM** — Unsafe but mitigated by runtime guards; could break under edge cases
- 🟢 **LOW** — Style/maintainability issue; no realistic crash path

---

## 1. `any` Casts

### Production Code (`src/`)

| Severity | File | Line(s) | Issue |
|----------|------|---------|-------|
| 🟢 | `screens/ChallengeLandingScreen.tsx` | 242–244 | Prop interface has `style?: any`, `glowSelfStyle?: any`, `glowGiftStyle?: any` — should use `StyleProp<ViewStyle>` |
| 🟢 | `screens/ChallengeLandingScreen.tsx` | 356, 370, 378, 731, 1250, 1260, 1295, 1356, 1376 | Style objects cast `as any` to silence TS on web-only CSS properties (`outlineStyle`, `textShadow`). Necessary for web-RN cross-platform, but `as any` is too broad — should use `as StyleProp<TextStyle> & { textShadow?: string }` |
| 🟢 | `screens/HeroPreviewScreen.tsx` | 240–242 | Same prop interface issue as ChallengeLandingScreen |
| 🟢 | `screens/HeroPreviewScreen.tsx` | 354, 368, 376, 715, 1213, 1223, 1258, 1319, 1339 | Same web-CSS `as any` style casts |
| 🟢 | `components/FooterNavigation.tsx` | 302 | Style cast `as any` |
| 🟢 | `components/SpriteAnimation.tsx` | 6 | `source: any` in interface — should use `ImageSourcePropType` from react-native |
| 🟡 | `screens/GoalDetailScreen.tsx` | 94 | `(startRaw as any)?.toDate?.() ?? new Date(startRaw as any)` — Should use `toDateSafe()` from `GoalHelpers.ts` |
| 🟡 | `screens/GoalsScreen.tsx` | 189 | `(goal.approvalDeadline as any)?.toDate?.() ?? null` — Should use `toDateSafe()` |
| 🟢 | `screens/recipient/components/TimerDisplay.tsx` | 145 | `} as any : {}` on style object |
| 🟢 | `services/LocationService.ts` | 6, 11 | `let Location: any` and `Promise<any>` for dynamic `expo-location` import. **Justified** — library is optionally installed; has ESLint suppression comments. Acceptable. |

### Test-Only Files (`functions/src/*_Test.ts`)

All `any` uses in `functions/src` are confined to `*_Test.ts` files (test utilities, not production):

| File | Lines | Issue |
|------|-------|-------|
| `getGiftsByPaymentIntent_Test.ts` | 77, 80 | `d.data() as any`, `.filter((gift: any) =>` |
| `sendBookingReminders_Test.ts` | 75, 90 | `(doc: any)`, `(snap: any)` in forEach callbacks |
| `sendSessionReminders_Test.ts` | 91 | `let mostBehindGoal: any = null` |
| `updatePaymentIntentMetadata_Test.ts` | 98 | `catch (err: any)` |
| `triggers/chargeDeferredGift_Test.ts` | 488 | `catch (error: any)` |
| Multiple `_Test.ts` | Various | `apiVersion: "2024-06-20" as any` — Stripe SDK version cast; low risk in test files |

**Assessment:** Production Cloud Function code (`aiGenerateHint.ts`, `createFreeGift.ts`, etc.) has no `any` casts. Test-file `any` usage is low risk but should be cleaned up to prevent hiding real type errors.

---

## 2. Missing Return Types

| Severity | File | Line | Issue |
|----------|------|------|-------|
| 🟢 | `services/GoalService.ts` | 56 | `export function orderedWeekdaysFrom(start: Date)` — inferred `string[]`, no explicit return type annotation |
| 🟢 | `services/GoalService.ts` | 65 | `export function getAnchoredWeekDates(weekStartAt: Date)` — inferred `Date[]`, no explicit return type annotation |

**Assessment:** Service class methods (`GoalService`, `userService`, `ExperienceGiftService`, etc.) all have explicit `Promise<T>` return types. The two missing cases above are free utility functions. All Cloud Functions handlers have proper return types. Overall return type coverage is good.

---

## 3. Unsafe Type Assertions

### High Concern

| Severity | File | Line(s) | Issue |
|----------|------|---------|-------|
| 🟡 | `services/GoalService.ts` | 953, 1003, 1026, 1061, 1067 | `pendingEditRequest` is read/written on Firestore documents but is **not defined in the `Goal` type**. Access uses `(goal as unknown as Record<string, unknown>).pendingEditRequest` and `(snap.data() as Record<string, unknown>).pendingEditRequest`. If the field structure changes, TypeScript won't catch it. Recommend adding `pendingEditRequest` as an optional field to `GoalCore`. |
| 🟡 | `services/ExperienceGiftService.ts` | 45 | `{ id: foundDoc.id, ...foundDoc.data() } as ExperienceGift` — Blind cast. `foundDoc.data()` returns untyped `DocumentData`. Fields are not validated. If Firestore schema changes, TS won't warn. |
| 🟡 | `services/ExperienceGiftService.ts` | 77 | `doc.data() as ExperienceGift` — Same blind cast in `getExperienceGiftsByUser` |
| 🟡 | `services/AIHintService.ts` | 357 | `snaps.docs.map((d) => d.data() as SessionDoc)` — Direct cast in `getAllSessions`. While docs from `getDocs` always exist, the cast assumes Firestore shape matches `SessionDoc` exactly. |
| 🟡 | `screens/UserProfileScreen.tsx` | 278 | `(goal.completedAt as { toDate: () => Date }).toDate()` — No null/type guard before calling `.toDate()`. If `completedAt` is already a `Date`, this will crash. |

### Medium Concern

| Severity | File | Line(s) | Issue |
|----------|------|---------|-------|
| 🟡 | `screens/FriendProfileScreen.tsx` | 597 | `route.params as { userId: string }` — non-optional cast. If `params` is undefined (deep-link misuse), this crashes. Low risk since `FriendProfile` always requires params. |
| 🟢 | `screens/GoalDetailScreen.tsx` | 94 | `new Date(startRaw as any)` — fallback for unknown date format. Low risk since the `instanceof Date` check runs first. |
| 🟢 | `screens/GoalsScreen.tsx` | 189 | `(goal.approvalDeadline as any)?.toDate?.()` — optional chaining makes this safe. |

---

## 4. Type Narrowing Gaps

| Severity | File | Line(s) | Issue |
|----------|------|---------|-------|
| 🟡 | `services/AIHintService.ts` | 138, 253 | `snap.data() as SessionDoc | undefined` without calling `snap.exists()` first. In Firestore SDK v9, `snap.data()` returns `undefined` if doc doesn't exist, so `| undefined` makes this technically safe. However, `snap.exists()` check is the documented approach and prevents accidental field access. |
| 🟡 | `services/userService.ts` | 59 | `snapshot.data().profile ?? null` — After `!snapshot.exists()` guard, `snapshot.data()` is called but its return value is treated as having a `profile` field. No type annotation on `snapshot.data()` result; TypeScript allows any property access on `DocumentData`. |
| 🟡 | `services/MotivationService.ts` | 217, 259 | `snapshot.data().count` — No `.exists()` check before accessing `.data()`. Although this is inside a `getDocs` forEach (docs always exist), there is no type guard on the `count` field. |
| 🟢 | `services/GoalService.ts` | 416 | `const hints: unknown[] = snap.data()?.hints || []` — Uses `unknown[]` which is good, but subsequent code may cast array elements unsafely. |

---

## 5. Generic Type Usage

### Untyped Firestore References

No Typed Firestore references are used anywhere in `src/services/`. The Firestore v9 SDK supports typed collection refs (`collection<T>(db, 'path')` / `doc<T>(db, 'path')`), but all references in this codebase use the untyped overloads:

```typescript
// Current pattern (untyped):
const ref = doc(db, 'goals', goalId);               // DocumentReference<DocumentData>
const snap = await getDoc(ref);                       // DocumentSnapshot<DocumentData>
const data = snap.data();                             // DocumentData | undefined

// Typed pattern (preferred):
const ref = doc(db, 'goals', goalId) as DocumentReference<Goal>;
```

This is a pervasive pattern across all 25 service files. Files affected:
`GoalService.ts`, `GoalSessionService.ts`, `userService.ts`, `ExperienceGiftService.ts`, `ExperienceService.ts`, `FeedService.ts`, `FriendService.ts`, `NotificationService.ts`, `CommentService.ts`, `ReactionService.ts`, `MotivationService.ts`, `CouponService.ts`, `DiscoveryService.ts`, `PartnerService.ts`, `PushNotificationService.ts`, `SessionService.ts`, `StorageService.ts`, `AIHintService.ts`, `CartService.ts`, `CTAService.ts`.

**Severity:** 🟡 — The `normalizeGoal()` boundary function and explicit `exists()` guards mitigate most crash risk, but the lack of typed refs means all Firestore field access is unchecked by TypeScript.

---

## 6. Firebase Types

| Severity | File | Line(s) | Issue |
|----------|------|---------|-------|
| 🟡 | `src/types/index.ts` | 181, 195 | `GoalCore.startDate: Date \| Timestamp` and `completedAt?: Date \| Timestamp` — Union types with `Timestamp` leak into business logic. Consumers must handle both shapes everywhere. Recommend normalizing to `Date` at the Firestore boundary (already done in `normalizeGoal()` but the type still admits `Timestamp`). |
| 🟡 | `src/types/index.ts` | 491 | `Notification.createdAt: Date \| Timestamp` — Same dual-type issue. `NotificationService.ts` and components handle this correctly, but the union allows callers to skip the check. |
| 🟡 | `screens/UserProfileScreen.tsx` | 278 | `(goal.completedAt as { toDate: () => Date }).toDate()` — If `goal.completedAt` is already a plain `Date`, calling `.toDate()` on it will throw `TypeError: .toDate is not a function`. Should check type first or use `toDateSafe()`. |
| 🟢 | Multiple screens | Various | Inline Timestamp→Date patterns duplicated across many files instead of using centralized `toDateSafe()`: `AchievementDetailScreen.tsx:155,573`, `GoalSettingScreen.tsx:182`, `JourneyScreen.tsx:980,1489,1501`, `CouponEntryScreen.tsx:117,189`, `recipient/hooks/useGoalProgress.ts:54`, `serializeNav.ts:13`. All use the `(val as { toDate: () => Date }).toDate()` pattern — safe because of prior type narrowing, but inconsistent. |
| 🟡 | `functions/src/scheduled/sendBookingReminders.ts` | 94 | `snap.exists ? snap.data()?.experienceId : null` — In the Admin SDK, `.exists` is a **property** (not a method), so this is correct. However, `snap.data()?.experienceId` still returns untyped data. |

---

## 7. Navigation Types

### Screens Using Typed `useRoute<RouteProp<...>>()` ✅
- `FriendProfileScreen.tsx` — `RouteProp<RootStackParamList, 'FriendProfile'>` ✓
- `FeedScreen.tsx` — `RouteProp<RootStackParamList, 'Feed'>` ✓
- `ChallengeLandingScreen.tsx` — `RouteProp<RootStackParamList, 'ChallengeLanding'>` ✓
- `HeroPreviewScreen.tsx` — `RouteProp<RootStackParamList, 'ChallengeLanding'>` ✓ (reuses same key, intentional)

### Screens Using Untyped `useRoute()` with Manual Cast ⚠️

These screens call `useRoute()` (returns `Route<string, object | undefined>`) then cast `route.params as { ... }`:

| Severity | Screen | Cast |
|----------|--------|------|
| 🟡 | `AuthScreen.tsx` | `route.params as { mode?: 'signin' \| 'signup'; fromModal?: boolean }` |
| 🟡 | `ChallengeSetupScreen.tsx` | `route.params as { prefill?: ChallengeSetupPrefill } \| undefined` |
| 🟡 | `GoalDetailScreen.tsx` | `(route.params as { goalId?: string }) ?? {}` |
| 🟡 | `GiftFlowScreen.tsx` | `route.params as { prefill?: GiftFlowPrefill } \| undefined` |
| 🟡 | `giver/ConfirmationScreen.tsx` | `route.params as { experienceGift?: ExperienceGift; goalId?: string } \| undefined` |
| 🟡 | `giver/ConfirmationMultipleScreen.tsx` | `route.params as { experienceGifts?: ExperienceGift[] } \| undefined` |
| 🟡 | `giver/CategorySelectionScreen.tsx` | `route.params as { prefilterCategory?: string } \| undefined` |
| 🟡 | `recipient/AchievementDetailScreen.tsx` | `route.params as { goal?: Goal; experienceGift?: ...; mode?: ... } \| undefined` |
| 🟡 | `giver/ExperienceCheckoutScreen.tsx` | `route.params as { cartItems?: ...; goalId?: ...; isMystery?: ... } \| undefined` (x2) |
| 🟡 | `giver/ExperienceDetailsScreen.native.tsx` | `route.params as { experience?: Experience } \| undefined` |
| 🟡 | `giver/ExperienceDetailsScreen.web.tsx` | `route.params as { experience?: Experience } \| undefined` |
| 🟡 | `giver/MysteryChoiceScreen.tsx` | `route.params as { experience?: Experience; cartItems?: ... } \| undefined` |
| 🟡 | `recipient/JourneyScreen.tsx` | `route.params as { goal?: Goal } \| undefined` |
| 🟡 | `recipient/CouponEntryScreen.tsx` | `route.params as { code?: string } \| undefined` |
| 🟡 | `giver/DeferredSetupScreen.tsx` | `route.params as { setupIntentClientSecret: ...; experienceGift: ... } \| undefined` (x2) |
| 🟡 | `recipient/GoalSettingScreen.tsx` | `route.params as { experienceGift?: ExperienceGift } \| undefined` |

**Impact:** These casts are not verified by the compiler against `RootStackParamList`. If a screen is navigated to with wrong params (or none), the cast succeeds silently and the crash only appears at field access time. All cases use optional `?` fields or `| undefined`, which mitigates immediate crashes, but the type contract is not enforced at call sites.

**Fix pattern:**
```typescript
// Replace:
const route = useRoute();
const routeParams = route.params as { prefill?: GiftFlowPrefill } | undefined;

// With:
const route = useRoute<RouteProp<RootStackParamList, 'GiftFlow'>>();
const routeParams = route.params; // Already typed correctly
```

---

## Pass 2: Verification Summary

### Issues That Could Cause Runtime Crashes

1. **`UserProfileScreen.tsx:278`** — `(goal.completedAt as { toDate: () => Date }).toDate()` with no type check. If `goal.completedAt` is already a `Date` (possible after `normalizeGoal()`), this crashes with `TypeError`.

2. **`GoalService.ts:963,1036,1074`** — `auth.currentUser!.uid` — if called outside an authenticated context (theoretically possible during sign-out race), crashes with `Cannot read properties of null`.

3. **`GoalService.ts:953/1003/1061`** — `pendingEditRequest` written to Firestore but absent from the TypeScript `Goal` type. If the field structure changes, there is no TS protection. Low crash risk today, high maintenance risk.

### Issues That Could Cause Data Corruption

1. **Untyped Firestore spreads** — `{ id: foundDoc.id, ...foundDoc.data() } as ExperienceGift` and `normalizeGoal({ id: snap.id, ...snap.data() })` — If a Firestore document has an unexpected schema (e.g., from a migration or admin write), the data is silently accepted as valid. This can propagate corrupt data into app state.

2. **`pendingEditRequest` outside type system** — Changes to this field's structure in Firestore won't be caught by TypeScript, risking silent data corruption in goal edit flows.

### Prioritized Fixes

| Priority | Fix |
|----------|-----|
| P1 | Add `pendingEditRequest?: { ... }` to `GoalCore` type in `src/types/index.ts` |
| P1 | Guard `UserProfileScreen.tsx:278` with `toDateSafe()` instead of bare cast |
| P2 | Migrate untyped `useRoute()` screens to typed `useRoute<RouteProp<...>>()` (16 screens) |
| P2 | Replace `GoalDetailScreen.tsx:94` and `GoalsScreen.tsx:189` `as any` Timestamp conversions with `toDateSafe()` |
| P3 | Add `snap.exists()` guards before `snap.data()` in `AIHintService.ts:138,253` |
| P3 | Fix `SpriteAnimation.tsx:6` — `source: any` → `ImageSourcePropType` |
| P3 | Add inferred return type annotations to `orderedWeekdaysFrom` and `getAnchoredWeekDates` |
| P4 | Gradually type Firestore collection references with generics |

---

## Files Audited

**Types:** `src/types/index.ts`, `src/types/navigation.ts`, `tsconfig.json`

**Services (25):** `AIHintService.ts`, `AnalyticsService.ts`, `CartService.ts`, `CommentService.ts`, `ContactService.ts`, `CouponService.ts`, `CTAService.ts`, `DiscoveryService.ts`, `ExperienceGiftService.ts`, `ExperienceService.ts`, `FeedService.ts`, `firebase.ts`, `FriendService.ts`, `GoalService.ts`, `GoalSessionService.ts`, `LocationService.ts`, `MotivationService.ts`, `NotificationService.ts`, `PartnerService.ts`, `PushNotificationService.ts`, `ReactionService.ts`, `SessionService.ts`, `StorageService.ts`, `stripeService.ts`, `userService.ts`

**Utils:** `GoalHelpers.ts`, `helpers.ts`, `sanitization.ts`, `timeUtils.ts`, `serializeNav.ts`, `errorLogger.ts`, `AppError.ts`, `analytics.ts`, `retry.ts`

**Screens (22):** All files in `src/screens/`, `src/screens/giver/`, `src/screens/recipient/`

**Components (key):** `ChallengeLandingScreen.tsx`, `HeroPreviewScreen.tsx`, `FooterNavigation.tsx`, `SpriteAnimation.tsx`, `FriendRequestNotification.tsx`, `HintHistoryModal.tsx`

**Cloud Functions:** `aiGenerateHint.ts`, `b2bAcceptInvite.ts`, `b2bCreateCompany.ts`, `b2bCreateGoal.ts`, `b2bGoalMilestone.ts`, `b2bLogSession.ts`, `createDeferredGift.ts`, `createFreeGift.ts`, `deleteGoal.ts`, `getGiftsByPaymentIntent.ts`, `retryFailedCharges.ts`, `searchUsers.ts`, `sendContactEmail.ts`, `stripeCreatePaymentIntent.ts`, `stripeWebhook.ts`, `updatePaymentIntentMetadata.ts`, `updateExperience.ts`, `deleteExperience.ts`; `functions/src/scheduled/` (5 files); `functions/src/triggers/` (2 files); `functions/src/utils/` (5 files)

---

## Overall Assessment

The codebase has **good baseline type discipline**: most service methods have explicit `Promise<T>` return types, error handling uses `catch (error: unknown)` throughout, `normalizeGoal()` serves as a proper Firestore boundary function, and `.exists()` checks are present on nearly all single-document reads.

The main systemic weaknesses are:
1. **Navigation params typed by convention, not by compiler** — 16 screens use untyped `useRoute()` + manual cast
2. **Untyped Firestore references** — None of the 25 service files use typed `collection<T>()` / `doc<T>()` refs
3. **`pendingEditRequest` is an undocumented Firestore field** outside the TypeScript model
4. **Timestamp/Date inconsistency** — `GoalCore.startDate` and `Notification.createdAt` still admit `Timestamp` in their types despite `normalizeGoal()` converting them; some screens do inline conversions instead of using `toDateSafe()`
