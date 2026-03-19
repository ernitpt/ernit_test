# Payments System Architecture

## Overview
Handles payments for Gifting experiences using Stripe.

## Components
- **Client (`stripeService.ts`)**:
    - Wraps `fetch` calls to Firebase Cloud Functions.
    - methods: `createPaymentIntent` (authenticated), `createValentinePaymentIntent`.
- **Backend (`stripeCreatePaymentIntent.ts`)**:
    - **Stripe API**: Creates `PaymentIntent` with `automatic_payment_methods`.
    - **Metadata**: Embeds critical data (`cart`, `giverId`, `personalizedMessage`) directly into Stripe Object.
    - **Webhook (`stripeWebhook.ts`)**: This is the *real* handler. It listens for `payment_intent.succeeded` and creates the actual database records (Goals, Gifts).

## Security
- **Auth**: `createPaymentIntent` verifies Firebase ID Token (`Bearer ...`).
- **Validation**: Checks `content-length` and verifies `giverId` matches the authenticated user.
- **Secrets**: Uses Firebase `defineSecret` for Stripe Keys.

## Flows
1.  **Cart Checkout**:
    - User builds Cart -> `createPaymentIntent(cart)` -> Stripe Client Secret -> Stripe Payment Element (UI) -> Submit.
    - Success -> Webhook triggers -> Creates `ExperienceGift` docs -> Notifies Recipient.
2.  **Valentine Purchase**:
    - `createValentinePaymentIntent` -> Success -> Webhook -> Creates `ValentineChallenge` doc.
3.  **Deferred Gift**:
    - `createDeferredGift` callable -> `DeferredSetupScreen` (card collection via Stripe PaymentSheet) -> `chargeDeferredGift` Cloud Function trigger.
    - Stripe charge is made **OUTSIDE** the Firestore transaction (uses a `processing` lock to prevent double-charges).
    - On success: gift `status` updated, recipient notified via `payment_charged` notification.
    - On failure: `payment_failed` notification sent with optional recovery URL in `data`.
    - Expired deferred gifts: notify both parties and set `status: 'expired'`.
    - `notificationSent` flag on gift doc prevents duplicate `shared_unlock` notifications.

## Rate Limits
- `createFreeGift`: 10 calls/hr per user
- `createDeferredGift`: 10 calls/hr per user
- `stripeCreatePaymentIntent`: 20 calls/hr per user
