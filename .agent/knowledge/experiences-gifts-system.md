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

## Key Relationships
- **User's Wishlist**: Array of ID strings pointing to `experiences`.
- **User's Cart**: Array of objects referencing `experiences` + quantity.
- **Purchased Goal**: `experienceGiftId` on Goal links to `experienceGifts` document.
- **Free Goal**: `pledgedExperience` snapshot on Goal (no purchase required to create).
