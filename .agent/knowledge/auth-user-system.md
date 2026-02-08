# Auth & User System Architecture

## Overview
Authentication is handled via Firebase Auth, but the app implements a custom "Auth Guard" system to handle protected routes and onboarding flows gracefully.

## Components
- **AuthGuardContext (`AuthGuardContext.tsx`)**:
    - Wraps the app and provides `requireAuth(message, routeName, params)`.
    - Intercepts navigation to protected screens.
    - Shows a custom "Login Prompt" modal instead of redirecting immediately.
    - Post-login: Uses `pendingNavigation` state to send the user where they originally wanted to go.
    - Managers FCM Token health checks (re-registers if missing).
- **UserService (`userService.ts`)**:
    - Manages the `users/{userId}` Firestore document.
    - Handles `profile` sub-object (display name, country).
    - Manages `cart` (array of items) and `wishlist` directly on the user doc.
    - Tracks `onboardingStatus` ('not_started', 'completed', 'skipped').

## Data Model (User)
- `id`: Firebase Auth UID.
- `profile`: { `name`, `profileImageUrl`, `country`, ... }
- `cart`: Array of `{ experienceId, quantity, ... }`.
- `wishlist`: Array of experience IDs.
- `fcmTokens`: Array of push notification tokens (managed by `PushNotificationService`, monitored by AuthGuard).

## Key Patterns
- **User Creation**: `createUserProfile` is called after Firebase Auth sign-up.
- **Navigation Blocking**: `requireAuth` returns `false` if the user isn't logged in, stopping the action and showing the modal.
