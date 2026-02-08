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
