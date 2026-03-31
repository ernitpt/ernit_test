# Exhaustive Web vs Android Animation & Layout Audit

## Audit Methodology
Analyzed 204 `Platform.OS` checks, 19 `Platform.select()` calls, 4 platform-split files across 60+ files. Categorized every inconsistency where Android renders differently from web.

---

## CATEGORY 1: Shadow & Glow Effects (HIGH PRIORITY)
**Problem:** Web uses CSS `boxShadow`/`filter: blur()` which Android can't render. Android falls back to `elevation` (gray rectangles) or plain borders.

### 1A. FooterNavigation Icon Glow
- **File:** `src/components/FooterNavigation.tsx` lines 288-312
- **Web:** 36x36 circle + `filter: blur(6px)`, opacity 0.3 — soft, diffused glow
- **Android:** 48x48 hard-edged circle, opacity 0.18 — oversized, dim, no blur
- **Fix:** Reduce Android circle to 36x36, increase opacity to 0.3, add `borderRadius` + low `elevation` for softness

### 1B. ChallengeLanding/HeroPreview Card Glow
- **Files:** `src/screens/ChallengeLandingScreen.tsx` lines 1300-1336, `src/screens/HeroPreviewScreen.tsx` same lines
- **Web:** Multi-layered `boxShadow` with primary color glow (8px + 20px + 40px spread)
- **Android:** Border-only fallback (`borderColor: colors.primary`) — no glow at all
- **Fix:** Add `elevation: 6` + `shadowColor: colors.primary` on Android for colored shadow approximation, plus semi-transparent outer View wrapper

### 1C. ChallengeLanding/HeroPreview Title Blur
- **Files:** `src/screens/ChallengeLandingScreen.tsx` line 1209-1212, `src/screens/HeroPreviewScreen.tsx` same
- **Web:** `filter: 'blur(40px)'` on title glow element
- **Android:** Empty object `{}` — no blur effect
- **Fix:** Use a larger, lower-opacity View with matching background color as blur approximation

### 1D. TimerDisplay Glow
- **File:** `src/screens/recipient/components/TimerDisplay.tsx` lines 134-149, 213
- **Web:** CSS `boxShadow` with multi-layer glow (8px + 20px + 40px)
- **Android:** Colored `backgroundColor` overlay with 25% max opacity — flat, not glowing
- **Fix:** Increase Android overlay opacity to 0.35, add outer glow ring View with low opacity

### 1E. FeedPost Highlight Animation
- **File:** `src/components/FeedPost.tsx` lines 364-374
- **Web:** Animated `boxShadow` interpolation (smooth glow pulse over 3+ seconds)
- **Android:** Static elevation — no animated shadow, no glow pulse
- **Fix:** Add animated `opacity` on a colored underlay View for Android to simulate highlight pulse

### 1F. HintPopup Blur Overlay
- **File:** `src/components/HintPopup.tsx` lines 506-509
- **Web:** CSS `backdropFilter: 'blur(10px)'` — true frosted glass
- **Android:** 3 stacked semi-transparent white layers — washed out, not blurred
- **Fix:** Accept as platform limitation OR use `@react-native-community/blur` if available. Lower priority.

### 1G. FooterNavigation Container Shadow
- **File:** `src/components/FooterNavigation.tsx` lines 248-264
- **Web:** No shadow applied (empty Platform.select for web)
- **Android:** `elevation: 8`
- **Fix:** Add `boxShadow` to web Platform.select to match the visual depth Android has. Wait — directive says Android should match web, and web has NO shadow. So either this is intentional or Android should also have no shadow. **Needs clarification** — if web looks correct without shadow, remove Android elevation.

---

## CATEGORY 2: Modal & Overlay Layout (MEDIUM PRIORITY)

### 2A. BaseModal maxHeight
- **File:** `src/components/BaseModal.tsx` lines 138, 146
- **Web:** 85% maxHeight
- **Android:** 80% maxHeight (5% shorter)
- **Fix:** Change Android to 85% to match web

### 2B. Confetti Particle Counts
- **Files:**
  - `src/components/HintPopup.tsx` line 391: Web=80, Android=48
  - `src/screens/giver/ConfirmationScreen.tsx` line 386: Web=200, Android=120
  - `src/screens/recipient/AchievementDetailScreen.tsx` line 994: Web=150, Android=90
- **Android** consistently gets 40% fewer confetti particles
- **Fix:** Increase Android counts to match web (modern Android devices can handle it), or compromise at 80% of web count

---

## CATEGORY 3: Font & Typography (LOW PRIORITY)

### 3A. ChallengeLanding/HeroPreview Title Font
- **Files:** `src/screens/ChallengeLandingScreen.tsx` lines 1216, 1245
- **Web:** `"DM Serif Display", Georgia, serif` (elegant serif)
- **Android:** `Outfit_700Bold` (clean sans-serif)
- **Fix:** Load DM Serif Display via `expo-font` for Android, or accept visual difference. This is a design decision.

### 3B. Text Shadow on Native Only
- **Files:** `src/screens/ChallengeLandingScreen.tsx` lines 1251-1257
- **Web:** No text shadow
- **Android:** `textShadowColor` with radius 8
- **Fix:** Remove Android text shadow to match web, OR add CSS text-shadow to web. Since web is the reference, remove from Android.

---

## CATEGORY 4: Platform-Specific Layout Adjustments (LOW PRIORITY)

### 4A. ExperienceDetailsScreen Dual Implementation
- **Files:** `ExperienceDetailsScreen.web.tsx` vs `ExperienceDetailsScreen.native.tsx`
- Web has `maxWidth: 800` constraint, native uses full width
- Map rendering: web uses native iframe, native uses WebView wrapper
- **Fix:** These are intentional platform adaptations. No changes needed.

### 4B. ImageViewer Different UX
- **File:** `src/components/ImageViewer.tsx` lines 53, 163, 193
- **Web:** Arrow navigation
- **Android:** FlatList horizontal paging (swipe)
- **Fix:** Intentional platform-native UX. No changes needed.

### 4C. JourneyScreen Per-Session Share Button
- **File:** `src/screens/recipient/JourneyScreen.tsx` line 340
- **Web:** Share button hidden
- **Android:** Share button visible
- **Fix:** If web is reference and doesn't show it, hide on Android too. OR this may be intentional (native sharing is better). **Needs clarification.**

---

## CATEGORY 5: Animations Working Correctly on Both (NO ACTION NEEDED)

These were audited and found to be consistent:
- SideMenu slide + stagger animations (identical)
- Toast MotiView fade/translate/scale (identical)
- ReactionPicker spring animations (identical)
- CompactReactionBar bounce/pulse/wiggle (identical)
- GoalsScreen FAB parallel spring animations (identical)
- NotificationsScreen FadeInDown/ZoomIn entering animations (identical)
- FooterNavigation button spring scale (identical)
- SkeletonLoader MotiView pulse (identical)
- All Moti-based animations (cross-platform by design)
- All Reanimated v2 entering/exiting animations (cross-platform)
- useModalAnimation hook (platform-agnostic)
- KeyboardAvoidingView behavior differences (intentional per-platform)
- Haptic feedback guards (intentional — web can't vibrate)

---

## IMPLEMENTATION PLAN

### Phase 1: Shadow & Glow Parity (8 files, ~2 hours)
1. Fix FooterNavigation icon glow (1A) — match circle size and opacity
2. Fix ChallengeLanding + HeroPreview card glow (1B) — add elevation+shadow approximation
3. Fix ChallengeLanding + HeroPreview title blur (1C) — larger low-opacity View
4. Fix TimerDisplay glow (1D) — increase overlay opacity
5. Fix FeedPost highlight (1E) — add animated colored underlay
6. Remove Android-only text shadow (3B) — match web's clean look

### Phase 2: Modal & Particle Alignment (4 files, ~30 min)
7. Fix BaseModal maxHeight (2A) — 80% → 85%
8. Fix confetti counts across 3 files (2B) — match web counts

### Phase 3: Clarification Needed
9. FooterNavigation container shadow (1G) — confirm if web's no-shadow is intentional
10. JourneyScreen share button visibility (4C) — confirm if hiding on Android is desired
11. Font choice on ChallengeLanding (3A) — design decision on serif vs sans

### Execution Strategy
- Use Sonnet subagents for mechanical edits (Phase 1 & 2)
- Keep Opus for any judgment calls on shadow approximation values
- Run `npm run log` after completion
