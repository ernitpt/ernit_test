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
Coupons are rewards linked to specific goals, often used in B2B or verified partner scenarios.

### Core Concepts
- **Storage**: `couponCode` field directly on the `Goal` document.
- **Generation**: Logic appears to be manual or trigger-based (`saveCouponCode`).
- **Redemption**: Handled via `CouponEntryScreen` which validates codes against backend logic (likely Cloud Functions or hardcoded lists depending on implementation).

### Key Files
- `CouponEntryScreen.tsx`: UI for inputting codes.
- `GoalService.ts`: `getCouponCode` / `saveCouponCode`.
