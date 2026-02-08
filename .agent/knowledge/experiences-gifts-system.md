# Experiences & Gifts Architecture

## Overview
Manages the catalog of "Experiences" (products) and the "Gifts" (purchased instances).

## 1. Experiences (`ExperienceService.ts`)
- **Read-Only**: The client treats this as a catalog.
- **Collection**: `experiences`.
- **Fields**: `id`, `title`, `description`, `price`, `imageUrl`, `category`, `location`.

## 2. Gifts (`ExperienceGiftService.ts`)
- **Collection**: `experienceGifts`.
- **Nature**: Represents a *purchased* experience sent to a user.
- **Lookup flow**:
    - Can be looked up by Firestore Document ID.
    - OR by a custom `id` field (legacy support).
- **Personalized Message**: Can be updated after purchase via `updatePersonalizedMessage`.

## Key Relationships
- **User's Wishlist**: Array of ID strings pointing to `experiences`.
- **User's Cart**: Array of objects referencing `experiences` + quantity.
- **Redemption**: When a user "accepts" a gift, it likely converts into a `Goal` (see `GoalSystem`).
