# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- migrate all colors to centralized Colors config - fix string literals, update SVG icon gradients to emerald/teal palette
- install react-native-worklets (reanimated v4 peer dep)
- DetailedGoalCard split into hooks, components, and utils with UX improvements
- experience carousel redesign — bigger images, overlay text, no prices, 'you've earned' framing
- landing page polish — centered brand lockup, tighter hero framing, distinct step cards

### Fixed
- added Samsung Browser/Chrome Mobile PWA notification crash protection in PushNotificationService
- navigation reset using correct CategorySelection route name instead of non-existent Main

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
