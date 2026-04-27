# Experiences & Gifts Architecture

## Overview
Manages the catalog of "Experiences" (products), "Gifts" (purchased instances), and the "Empower" flow for Free Goals.

## 1. Experiences (`ExperienceService.ts`)
- **Read-Only**: The client treats this as a catalog.
- **Collection**: `experiences`.
- **Fields**: `id`, `title`, `description`, `price`, `imageUrl`, `coverImageUrl`, `category`, `location`.

## 2. Gifts (`ExperienceGiftService.ts`)
- **Collection**: `experienceGifts`.
- **Nature**: Represents a *purchased* experience sent to a user.
- **Lookup flow**:
    - Can be looked up by Firestore Document ID.
    - OR by a custom `id` field (legacy support).
- **Personalized Message**: Can be updated after purchase via `updatePersonalizedMessage`.

## 3. Pledged Experiences (Free Goals)
When a user creates a Free Goal, they can optionally pick a "dream reward" from the experience catalog.
- Stored as a snapshot on the Goal: `pledgedExperience: { experienceId, title, coverImageUrl, subtitle, price }`
- **Not a purchase** — just a reference to what the user aspires to.
- Displayed on feed posts and friend profiles to encourage friends to gift it.

## 4. Empower Flow
Friends can buy the pledged experience for a free-goal user at any point during the challenge.
- **Entry points**: Feed post "Empower" button, Friend profile achievement cards, milestone notifications
- **Purchase**: Standard Stripe flow → creates `experienceGift` document
- **Attachment**: `GoalService.attachGiftToGoal()` links the purchased gift to the free goal
- **Redemption**: Goal owner can only redeem after completing the goal
- **Deadline**: 30-day window after completion (`giftAttachDeadline`) for late gifts

## 5. Together/Shared Challenge Gift Flow
- Giver goal is created **atomically** with the gift via a Firestore batch write.
- `togetherData.giverGoalId` is set before the batch commits.
- `recipientGoalId` is stored as a fallback on the gift document if the bidirectional link fails.
- `attachGiftToGoal` transaction sets `isRedeemed: true`, `redeemedAt`, and `redeemedGoalId` on the gift doc.
- **Gift claim revert**: If goal creation fails after gift creation, the gift reverts to `pending` with claim fields cleared.

## 6. Email Security
- Email templates use `escapeHtml` for XSS protection.
- Shared template helper: `functions/src/utils/giftEmailTemplate.ts`.

## Key Relationships
- **User's Wishlist**: Array of ID strings pointing to `experiences`.
- **User's Cart**: Array of objects referencing `experiences` + quantity.
- **Purchased Goal**: `experienceGiftId` on Goal links to `experienceGifts` document.
- **Free Goal**: `pledgedExperience` snapshot on Goal (no purchase required to create).
- **Gift Redeemed**: `isRedeemed` + `redeemedAt` + `redeemedGoalId` set atomically in `attachGiftToGoal`.

## Related Notifications
See `notifications-system.md` for full list. The gift/experience flow fires:
- `gift_received` — recipient gets a new gift.
- `experience_empowered` — a friend bought the pledged experience for a free-goal user.
- `pending_gift_available` — fired by `onGoalCreated` trigger when a new goal is created and the user has unattached gifts waiting to be linked via `attachGiftToGoal`.
- `payment_charged` / `payment_failed` / `payment_cancelled` — deferred gift payment outcomes.
- `shared_start` / `shared_unlock` / `shared_completion` / `shared_session` / `shared_partner_removed` — Together/Shared challenge lifecycle.
