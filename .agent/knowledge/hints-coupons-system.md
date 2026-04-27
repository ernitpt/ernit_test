# Hints & Coupons System

## Hints Architecture
Hints provide motivation and clues for goals. They can be system-generated (AI) or user-generated (Personalized).

### Core Concepts
- **Hint History**: Stored in the `goals` collection under the `hints` array.
- **Personalized Hints**: Givers can set a `personalizedNextHint` on a receiver's goal. This is shown *after* the next session is completed.
- **AI Generation**: `AIHintService` (using `aiGenerateHint` cloud function) generates hints based on goal context.

### Data Model
- `hints`: Array of objects inside `Goal` document.
    - `text`: Maximum 500 chars.
    - `audioUrl` / `imageUrl`: Optional media.
    - `session`: Which session number revealed this hint.
- `personalizedNextHint`: Temporary slot on `Goal` doc. Moved to `hints` array upon reveal.

### Security
- **Validation**: `appendHint` strictly validates URLs (must be `firebasestorage.googleapis.com`) and text sorting.
- **Limits**: Max 1000 hints per goal to prevent document size explosion.

---

## Coupons Architecture
Partner coupons are reward codes issued to recipients on goal completion (B2B and partner integrations).

### Core Concepts
- **Service**: `src/services/CouponService.ts` — generates, issues, and redeems `PartnerCoupon` docs.
- **Generation**: Unique 12-character alphanumeric codes created via CSPRNG (`expo-crypto`) with rejection sampling to eliminate modulo bias. Never seeded from `Math.random`.
- **Storage**: Two places —
  - `PartnerCoupon` records (dedicated collection, see `PartnerCoupon` type in `src/types/index.ts`).
  - `couponCode` snapshot field on the `Goal` document for quick lookup (set via `GoalService.saveCouponCode`).
- **Redemption**: `CouponEntryScreen` validates input codes against the server-side coupon records. Redemption flips `PartnerCoupon.isRedeemed` atomically via `runTransaction` to prevent double-claim.

### Key Files
- `src/services/CouponService.ts` — generation, issuance, redemption (transactional).
- `src/screens/recipient/CouponEntryScreen.tsx` — user-facing code entry UI.
- `src/services/GoalService.ts` — `getCouponCode` / `saveCouponCode` for the snapshot on `goals/{goalId}`.
- `src/types/index.ts` — `PartnerCoupon` type definition.
