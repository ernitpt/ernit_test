# DetailedGoalCard Improvement Plan

## Phase 1: Architecture — Extract hooks & utilities (foundation for everything else)

### 1a. Extract utility functions to a shared file
**New file:** `src/screens/recipient/goalCardUtils.ts`
- Move out: `isoDay`, `addDays`, `rollingWeek`, `day2`, `dayMonth`, `formatNextWeekDay`, `isGoalLocked`, `formatDurationDisplay`, `buildValentineGift`
- Move `COLORS` constant and `TIMER_STORAGE_KEY`
- Create `getApprovalBlockMessage(goal, empoweredName)` — dedup the 3 identical approval check blocks

### 1b. Extract custom hooks
**New file:** `src/screens/recipient/hooks/useGoalProgress.ts`
- `totalSessionsDone`, `totalSessions`, `alreadyLoggedToday`, `completedWeeks`, `weekDates`, `loggedSet`, `hasPersonalizedHintWaiting`
- All the `useMemo` computations that derive from goal state

**New file:** `src/screens/recipient/hooks/useValentinePartner.ts`
- Partner name, avatar, profile image fetching
- Real-time partner goal Firestore listener (`onSnapshot`)
- Partner pulse animation state
- View switcher state (`selectedView`, `handleViewSwitch`, `viewTransitionAnim`)
- All `displayed*` computed values

**New file:** `src/screens/recipient/hooks/useValentineExperience.ts`
- Valentine experience + challenge mode fetching
- Details modal state (`showDetailsModal`)
- Unlock listener for finished goals

**New file:** `src/screens/recipient/hooks/useGoalSession.ts`
- `handleStart`, `handleFinish`, `handleCancel`, `cancelSessionInternal`
- Timer persistence (`clearTimerState`)
- Loading state, hint state, celebration state
- Push notification scheduling/cancelling

### 1c. Extract sub-components
**New file:** `src/screens/recipient/components/WeeklyCalendar.tsx`
- Calendar row with day circles (filled/empty/today states)
- `AnimatedFilledDay` sub-component stays here
- Props: `weekDates`, `loggedSet`, `todayIso`
- Wrap in `React.memo`

**New file:** `src/screens/recipient/components/ProgressBars.tsx`
- "Sessions this week" and "Weeks completed" capsule rows
- `Capsule` component moves here
- Props: `weeklyFilled`, `weeklyTotal`, `completedWeeks`, `overallTotal`
- Wrap in `React.memo`

**New file:** `src/screens/recipient/components/TimerDisplay.tsx`
- Timer text, finish button, cancel button, session duration text
- Timer ring visualization (Phase 2)
- Props: timer state + handlers

**New file:** `src/screens/recipient/components/ValentinePartnerSelector.tsx`
- Partner progress row with avatars and view switcher
- Skeleton loader state when loading
- Props: from `useValentinePartner` hook

**New file:** `src/screens/recipient/components/SessionActionArea.tsx`
- Start button, disabled states, approval messages, waiting states
- "Already logged today" state
- Hint indicator
- Props: goal state + handlers

**New file:** `src/screens/recipient/components/GoalCardModals.tsx`
- Cancel session modal, celebration modal, valentine experience details modal
- Props: visibility states + handlers

### 1d. Type cleanup
- Replace `lastHint: any` with proper `HintObject | string` union type
- Replace `valentineExperience: any` with `Experience | null`
- Type `partnerGoalData.weekStartAt` as `Date | FirestoreTimestamp | null`
- Define interfaces in `goalCardUtils.ts` or a `types.ts`

---

## Phase 2: UX & Visual Improvements (builds on extracted components)

### 2a. Timer ring visualization (`TimerDisplay.tsx`)
- Use `react-native-svg` (`Circle` with `strokeDasharray`/`strokeDashoffset`)
- Show elapsed/target as animated arc behind the timer text
- Emerald gradient stroke (`Colors.primary` → `Colors.accent`)
- Fallback to plain text for goals with no target duration

### 2b. Skeleton loader for partner data (`ValentinePartnerSelector.tsx`)
- When `valentineChallengeId` exists but `partnerGoalData === null`, render skeleton
- Reuse existing `SkeletonBox` from `src/components/SkeletonLoader.tsx`
- Two skeleton avatar circles + text placeholders

### 2c. Animated progress numbers (`ProgressBars.tsx`)
- When `weeklyFilled` or `completedWeeks` changes, trigger a quick scale-bounce (1 → 1.2 → 1) on the count text
- Use `useRef` to track previous value, `useEffect` to trigger animation

### 2d. Streak/week indicator (`ProgressBars.tsx` or new badge)
- Show "Week X of Y" badge near the weeks progress bar when `completedWeeks > 0`
- Small pill with gradient background, e.g., "Week 3 streak!"
- Only shows when weeks completed consecutively (i.e., `currentCount > 0`)

### 2e. Better "already logged today" state (`SessionActionArea.tsx`)
- Replace grey disabled box with:
  - Animated checkmark (scale-in)
  - Soft green gradient background (`Colors.primarySurface` → white)
  - "Great job today!" title + "Come back tomorrow" subtitle
  - Subtle confetti or sparkle

### 2f. Glassmorphism on card (main `DetailedGoalCard.tsx`)
- Apply to card style: `backgroundColor: 'rgba(255, 255, 255, 0.85)'`
- Add `backdropFilter: 'blur(12px)'` (web), `WebkitBackdropFilter` for Safari
- Slightly more prominent shadow + frosted border (`borderColor: 'rgba(255,255,255,0.6)'`)
- Follow exact pattern from HintPopup's `blurOverlay`

### 2g. Haptic on capsule fill (`ProgressBars.tsx`)
- In `Capsule` component, after the fill animation `.start()` callback, call `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
- Only trigger on new fills (not initial render)

---

## Phase 3: Timer UX Enhancements (builds on `TimerDisplay.tsx`)

### 3a. "Almost done" timer state
- When `timeElapsed >= totalGoalSeconds * 0.9` and `totalGoalSeconds > 0`:
  - Change timer text color to `Colors.emerald` / `Colors.primary`
  - Gentle pulse animation on the ring
  - Show "Almost there!" label below timer

### 3b. Background timer banner
- In the existing `useEffect` that checks `visibilitychange`:
  - When app becomes visible and timer is running, show a brief toast/banner
  - "Timer still running - X:XX elapsed"
  - Auto-dismiss after 3 seconds
  - Use `Animated` fade-in/out at the top of the card

### 3c. Long-press to finish
- Replace `onPress={handleFinish}` with a `Pressable` that:
  - On press-in: starts a 1-second fill animation (width: 0% → 100%) overlaid on the button
  - On press-out before 1s: resets animation, doesn't finish
  - On animation complete: triggers `handleFinish` + haptic
  - Visual: gradient fill sweeps across the button left-to-right

---

## Phase 4: Valentine-Specific Enhancements

### 4a. Partner activity indicator (`ValentinePartnerSelector.tsx`)
- When `partnerJustUpdated` is true, show a pulsing green dot on the partner's avatar
- Small "Active" label that fades after 5 seconds
- Leverage existing `partnerPulseAnim`

### 4b. Motivational nudge based on % completion
- In `ValentinePartnerSelector.tsx` or below the progress bars:
- Compare `userWeeklyCount / userSessionsPerWeek` vs `partnerWeeklyCount / partnerSessionsPerWeek`
- If partner is >20% ahead: "Sarah is making great progress — keep going!"
- If user is ahead: "You're ahead — great work!"
- If both are equal: "You're both in sync! Keep it up!"
- Subtle text below the partner selector, fades in/out

---

## Phase 5: Performance (can be done alongside other phases)

### 5a. Lazy Valentine features
- Wrap all Valentine-specific `useState` and `useEffect` calls inside the hooks (Phase 1b)
- In hooks, early-return if `!goal.valentineChallengeId`
- This means no listeners, no fetches, no state for standard goals

### 5b. Debounce partner listener
- In `useValentinePartner`, debounce `onSnapshot` callback by 300ms
- Prevents rapid re-renders during batch Firestore writes

### 5c. `buildValentineGift` already extracted in Phase 1a
- Moved to `goalCardUtils.ts` as a pure async function

---

## File summary

New files:
- `src/screens/recipient/goalCardUtils.ts`
- `src/screens/recipient/hooks/useGoalProgress.ts`
- `src/screens/recipient/hooks/useValentinePartner.ts`
- `src/screens/recipient/hooks/useValentineExperience.ts`
- `src/screens/recipient/hooks/useGoalSession.ts`
- `src/screens/recipient/components/WeeklyCalendar.tsx`
- `src/screens/recipient/components/ProgressBars.tsx`
- `src/screens/recipient/components/TimerDisplay.tsx`
- `src/screens/recipient/components/ValentinePartnerSelector.tsx`
- `src/screens/recipient/components/SessionActionArea.tsx`
- `src/screens/recipient/components/GoalCardModals.tsx`

Modified files:
- `src/screens/recipient/DetailedGoalCard.tsx` (dramatically slimmed down)
- `src/components/SkeletonLoader.tsx` (add ValentinePartnerSkeleton if needed)

## Execution order
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1 is the critical path — everything else layers on top of the clean architecture.
