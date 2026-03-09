# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation
- updated analytics tracking tables in data-gathering skill and analytics knowledge

### Changed
- migrate all colors to centralized Colors config - fix string literals, update SVG icon gradients to emerald/teal palette
- install react-native-worklets (reanimated v4 peer dep)
- DetailedGoalCard split into hooks, components, and utils with UX improvements
- experience carousel redesign — bigger images, overlay text, no prices, 'you've earned' framing
- landing page polish — centered brand lockup, tighter hero framing, distinct step cards
- redesigned AchievementCard and PledgedExperiencePreview, added completedAt to Goal type
- removed snap-a-photo button from timer, made PledgedExperiencePreview a compact inline strip
- redesigned FAB menu in GoalsScreen, used Ernit logo for redeem option
- improved Antigravity agent skills — firebase network/retry patterns, Ernit verification commands, React/Firebase debugging, cross-platform path fix, moti StyleSheet rewrite, ui-design-system loading/accessibility
- add ErrorBoundary to ConfirmationScreen and JourneyScreen, replace ActivityIndicator with SkeletonBox in UserProfileScreen and ChallengeSetupScreen
- fixed N+1 query in FriendService.searchUsers() with batch fetch
- remove Valentine-specific Cloud Functions code
- surgically remove all Valentine-specific code from GoalService
- remove Valentine flow (keep type fields for backward compat)
- move inline component definitions outside parent components to fix performance issues
- move inline component definitions outside parent components for performance
- replaced Alert.alert with toast system in giver screens (CartScreen, CategorySelectionScreen, ConfirmationScreen, ConfirmationMultipleScreen)
- replaced Alert.alert with toast in ExperienceCheckoutScreen, ExperienceDetailsScreen (native/web), CompletionScreen
- replace ActivityIndicator spinners with skeleton loaders in 6 screen files
- migrated hardcoded hex colors to design tokens in 12 component files
- extract coupon generation logic into shared CouponService
- fully redesigned MysteryChoiceScreen — wizard-style UI with animated progressive hint demo, radio-select cards, experience reveal animation, and GoalSettingScreen-matching CTA
- generalize streak indicator on GoalsScreen — user-level banner replaces per-goal badges
- unified active goal layout into single card with dividers
- unified JourneyScreen active goal into one card, removed orange StreakBanner from GoalsScreen
- rewrite AchievementDetailScreen - unified vertical layout with inline sessions/hints, no celebratory hero, matches JourneyScreen completed-goal design
- fix N+1 queries in Partner App dashboard pages
- harden cloud functions - path traversal, MIME whitelist, field validation, array limits, cleanup on failure
- fix N+1 query in partners page, parallelize coupon fetches in coupons and analytics
- harden app for production — delete debug tools, validate Firestore error writes, add security headers, strengthen Cloud Functions input validation
- replace dangerous any types with proper TypeScript types — ChallengeSetupPrefill, Goal hints, GoalService casts
- store AnalyticsService AppState listener subscription for proper cleanup
- update firebase 12.10, stripe-js 8.9, react-stripe 5.6; fix npm audit vulnerabilities
- eliminated 32 navigation as-any casts with CompositeNavigationProp typed hooks

### Fixed
- added Samsung Browser/Chrome Mobile PWA notification crash protection in PushNotificationService
- navigation reset using correct CategorySelection route name instead of non-existent Main
- error guard on free goal creation, stale prefill date recovery, removed dead code (PledgeGoalSetting, OnboardingScreen, advanceBothPartners, onboardingStatus)
- CTA buy buttons now go directly to checkout for current goal instead of creating new goal
- notification system bugs - memory leak, type safety, clearable bypass, double-attach guard, push routing, query performance
- comprehensive FeedPost system fixes — security rules, transaction-based reactions, memory leak cleanup, performance optimizations, haptic feedback, error alerts
- critical security audit fixes - server-side price validation, mystery gift protection, user search Cloud Function, payment ownership checks, Firestore rules hardening, transaction-safe session logging, logout state clearing
- atomic comment add/delete with count updates using writeBatch
- make reaction creation fully transactional with deterministic doc IDs
- atomic gift claiming with transaction to prevent race condition (T1-4)
- 12 logic bug fixes from system audit (goal sweep completion, webhook error handling, atomic transactions, price rounding, double-tap prevention, friend ops atomicity, count desync, gift claiming race, week boundary, reverse friend requests, orphaned notifications, listener memory leak)
- move hooks before early return in FriendProfileScreen to fix Rules of Hooks violation
- per-item image error tracking in FriendsListScreen and AddFriendScreen to prevent one broken avatar hiding all avatars
- move useRef and useEffect above early return in ExperienceCheckoutScreen to fix Rules of Hooks violation
- restore emoji encoding in share messages and empty state icons
- resolve Rules of Hooks violation in ConfirmationScreen and null crash in ConfirmationMultipleScreen
- add null guards and error handling in MysteryChoiceScreen, NotificationsScreen, and PurchasedGiftsScreen
- resolve React Rules of Hooks violation in ExperienceDetailsScreen.web.tsx by moving all hook declarations before the early return
- P0 critical bugs - hooks violations, null guards, emoji encoding, error handling, imageLoadError isolation
- resolve Colors is not defined runtime error - add missing imports and fix 252 quoted Colors string literals across 18 files
- wrap App with SafeAreaProvider so ToastOverlay can use useSafeAreaInsets
- replace nested TouchableOpacity with Pressable in ExperienceCard to avoid nested button HTML on web
- goal flow audit - fix finishLock stuck on early return, free goal completion nav, canFinish prod enforcement, session interval validation, hint off-by-one, UTC date, week penalty reset, projected finish date, coupon dedup, hint rate limiting
- feed posts show 'earned' for free goals without reward, now says 'completed their challenge'; hide misleading experience card for ungifted free goals; add free goal fields to session progress posts
- feedpost button consistency — removed unreadable white text on empower button, unified button styling across all post types, eliminated duplicate gift buttons when experience preview is visible
- skip 60-second session cooldown in debug mode for faster testing
- replace broken time picker with custom popbox — two-column hour+minute selector
- restore create partner and invite management to partners page
- redirect authenticated users away from landing pages
- replace mock types with real imports in CategorySelectionScreen
- add draft filter and order sort to ChallengeSetupScreen, JourneyDemo, JourneyScreen
- prevent duplicate category seeding with deterministic doc IDs
- AdminInviteManager copy link URL format mismatch
- replace alert() with toast in CreatePartner, add drag optimization to ImageManager
- added comprehensive input validation to 4 Cloud Functions (sendContactEmail, aiGenerateHint, updatePaymentIntentMetadata, getGiftsByPaymentIntent)
- removed all high-priority 'any' type issues - added ChallengeSetupPrefill interface, fixed route params, removed unnecessary type casts

### Added
- Automatic changelog system with `npm run log` script
- implemented Free Goals (The Pledge) feature - users can set experience goals without purchasing, friends can track progress, leave motivations, and empower by gifting the experience
- general landing page with free challenge creation flow
- general landing page with free challenge creation flow, milestone notifications, empower experience card on feed
- moti animations on challenge landing, dial-style rotating word, fix notification clear color
- horizontal image carousel with visible neighbors and spring slide animation
- remove surprise me from free goal creation flow
- migrate skeleton loaders to Moti, replace spinners with skeletons across app, add entrance animations
- interactive journey demo animation replaces carousel on landing page
- journey demo empowerment step + real experience carousel with staggered animations
- hero image carousel synced with rotating title word
- experience carousel moved inside demo card with reward cards and pagination dots
- inline calendar in challenge setup with calculated end date
- stacked experience carousels by category with All/Adventure/Wellness/Creative filter
- step 5 buy-now-or-pledge in challenge creation with motivational stats
- auto-attach gift to goal on self-purchase confirmation
- goals screen improvements - completed goals section, streak badge top-right, milestone celebrations (7/14/21/30), upgraded empty state with CTA
- redesigned FeedPost and CelebrationModal with consistent layout — media on top, capsule progress bars for sessions/week and weeks/total
- improved goal_completed feed posts - contextual text for goals with/without rewards, achievement card with trophy for no-reward goals, Gift an Experience button for friends to congratulate
- empower flow - friends can gift experiences to goal owners with auto-attach via notification, choice modal for pledged vs browse, empowerContext threading through checkout
- Phase 2 Empower & Motivate ecosystem — mystery experience flow, notification rework with Empower+Motivate buttons, inline journey motivations, already-empowered indicator
- add ErrorBoundary to 12 critical screens, create AnalyticsService with buffered Firestore writes, add screen view tracking, high-value event tracking, data-gathering skill, and Firestore rules for events/errors collections
- added 7 missing analytics tracking calls (friend_request_sent, feed_reaction, feed_comment, cta_shown, cta_dismissed, mystery_choice_selected, coupon_redeemed)
- added ErrorBoundary to CouponEntryScreen and FreeGoalCompletionScreen
- added AppState flush listener to AnalyticsService for background event persistence
- added ErrorBoundary to 5 remaining screens and analytics tracking to GoalService, SessionService, FriendService, ExperienceGiftService
- ErrorBoundary now fires error_boundary_triggered analytics event on crash
- added server-side searchUsers Cloud Function with rate limiting and safe data filtering
- add error states with retry UI to 5 screens (Feed, FriendsList, UserProfile, Goals, AddFriend)
- redesigned GoalSettingScreen as 4-step wizard with ModernSlider, inline calendar, AnimatePresence transitions, and LinearGradient CTA
- comprehensive accessibility pass across all screens and components
- motivation system - all goals, 1 per session, latest only, with notification
- session reminders, inactivity nudges, weekly recap notifications
- urgency-aware session reminders (last day/days left warnings)
- added production versions of scheduled functions (checkUnstartedGoals, sendInactivityNudges, sendSessionReminders, sendWeeklyRecap)
- cross-goal session streak tracking with personalized streak-loss warnings
- CompletionScreen overhaul — no-reward flow, streak CTA with A/B/C/D variants, social sharing card
- tiered animated streak banner with pulsing flame, glow, floating sparks, and gradient intensity scaling
- added debug toggle button in header (test mode only) to control all debug features
- add AchievementDetailScreen - completion-style retrospective view for past achievements with experience reveal, coupon display, partner contact, share functionality
- add image and audio support to motivation display in SessionCard
- upgrade MotivationModal to support image and voice memo - modeled after PersonalizedHintModal with text/photo and voice memo modes, media uploads, and rich display in session cards
- auto-advance to next step when selecting a goal type in challenge setup
- streak resets on missed weekly target for single-goal users, multi-goal users keep 7-day inactivity rule
- replace fixed reminder time chips with native time picker for any hour selection
- Partner App admin panel Phase 1 — shadcn/ui, sidebar navigation, dashboard layout, placeholder pages for experiences/categories/partners/coupons/analytics
- redesign challenge step 4 - category cards as primary path, experience browsing as secondary, dynamic step count
- added deleteExperience Cloud Function for admin experience deletion
- added updateExperience Cloud Function for admin experience editing
- Phase 2 admin panel - experience CRUD with edit page, image manager, search/filters, updateExperience and deleteExperience cloud functions
- implemented comprehensive analytics dashboard with experience, partner, and coupon metrics
- Phase 3-6 admin panel - category CRUD with drag-and-drop, partner directory, coupon dashboard with cross-partner aggregation, analytics dashboard with stats
- add category-aware messaging to weekly recap notifications
- surface preferredRewardCategory across app — category-only free goals, feed posts, notifications, weekly recap, journey recommendations
- add coupon owner name column to admin coupons dashboard
- add drag-and-drop experience reordering within categories
- main app respects experience order and draft status from admin panel
- added offline detection with toast notifications via @react-native-community/netinfo
