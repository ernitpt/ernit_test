---
name: payment-checkout
description: Enforces consistent Stripe payment and checkout patterns across the Ernit app. Use whenever creating, modifying, or reviewing checkout screens, payment flows, or gift creation logic.
---

# Payment & Checkout Skill

This skill defines the standard patterns for Stripe payments, checkout screens, gift polling, and confirmation flows in the Ernit app.

---

## 1. Checkout Flow Architecture

Every purchase follows this pipeline:

```
Cart / Selection Screen
  -> ExperienceCheckoutScreen (payment form + Stripe Elements)
    -> stripe.confirmPayment() (client-side)
      -> Stripe webhook triggers Cloud Function (server-side gift creation)
        -> Client polls for gift(s)
          -> ConfirmationScreen (single gift) or ConfirmationMultipleScreen (multi-gift)
```

Key files:
- `src/screens/giver/ExperienceCheckoutScreen.tsx` — payment form, Stripe Elements, polling
- `src/screens/giver/ConfirmationScreen.tsx` — post-payment success UI
- `src/services/stripeService.ts` — all Stripe-related API calls
- `src/config/environment.ts` — environment-aware function routing

---

## 2. PaymentIntent Creation

Always create PaymentIntents via the `stripeService` wrapper, never by calling Stripe APIs directly from the client.

```typescript
import { stripeService } from '../../services/stripeService';

const { clientSecret, paymentIntentId } = await stripeService.createPaymentIntent(
  amount,        // number — total in cents
  giverId,       // string — authenticated user ID
  giverName,     // string — display name
  partnerId,     // string — optional partner ID
  cartItems,     // { experienceId, partnerId, quantity }[]
  personalizedMessage  // string — optional message
);
```

Rules:
- The service automatically fetches the Firebase auth token (`currentUser.getIdToken()`).
- The request is sent to `config.functionsUrl / config.stripeFunctions.createPaymentIntent`.
- Environment config (`src/config/environment.ts`) routes to `_Test` suffixed functions in test mode and bare names in production.
- The `paymentIntentId` is extracted from `clientSecret.split("_secret_")[0]`.
- On failure, errors are logged to Firestore via `logErrorToFirestore` with full context (amount, giverId, partnerId, cart count).

---

## 3. Stripe Elements Integration

Standard setup inside `ExperienceCheckoutScreen`:

```typescript
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Top-level: load Stripe once
const stripePromise = loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!);

// Outer component: wrap with Elements provider
<Elements stripe={stripePromise} options={{ clientSecret }}>
  <CheckoutInner ... />
</Elements>

// Inner component: use hooks
const stripe = useStripe();
const elements = useElements();
```

Payment submission pattern:

```typescript
const { error, paymentIntent } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: Platform.OS === 'web'
      ? window.location.href
      : 'https://ernit-nine.vercel.app/payment-success',
  },
  redirect: 'if_required',
});

if (error) throw error;
if (!paymentIntent) throw new Error('No payment intent returned.');
```

Rules:
- Always use `redirect: 'if_required'` so card payments resolve inline while redirect-based methods (MB Way, iDEAL) work too.
- After redirect-based returns, check `payment_intent_client_secret` from URL params (web) or AsyncStorage flag (native) and call `stripe.retrievePaymentIntent()`.
- Store a pending payment flag (`pending_payment_{clientSecret}`) before calling `confirmPayment` and remove it after success.

---

## 4. Gift Polling Pattern

After payment succeeds, the webhook-triggered Cloud Function creates gift(s) asynchronously. The client must poll to pick them up.

```typescript
const pollForGifts = async (
  paymentIntentId: string,
  expectedCount: number,
  maxAttempts: number = 12,
  delayMs: number = 1000
): Promise<ExperienceGift[]> => {
  for (let i = 0; i < maxAttempts; i++) {
    const gifts = await checkGiftCreation(paymentIntentId);
    if (gifts.length === expectedCount) return gifts;
    await new Promise((res) => setTimeout(res, delayMs));
  }
  return [];
};
```

The `checkGiftCreation` helper calls the authenticated `getGiftsByPaymentIntent` Cloud Function.

After polling:
- **1 gift** -> `dispatch({ type: 'SET_EXPERIENCE_GIFT', payload: gifts[0] })` then navigate to `Confirmation` with `{ experienceGift, goalId }`.
- **Multiple gifts** -> `dispatch({ type: 'CLEAR_CART' })` then navigate to `ConfirmationMultiple` with `{ experienceGifts }`.
- **0 gifts (timeout)** -> Show "Payment Processed — gifts are being prepared" alert. Do NOT navigate away; let the user retry or contact support.

Always clear the cart (`dispatch({ type: 'CLEAR_CART' })`) and remove the pending payment storage flag after a successful poll.

---

## 5. Error Handling

### Stripe Errors
Stripe returns structured error objects. Map them to user-friendly messages:

| `error.type` / `error.code` | User Message |
|---|---|
| `card_error` / `card_declined` | "Your card was declined. Please try another payment method." |
| `card_error` / `expired_card` | "Your card has expired. Please update your card details." |
| `card_error` / `insufficient_funds` | "Insufficient funds. Please try another card." |
| `card_error` / `incorrect_cvc` | "Incorrect CVC. Please check and try again." |
| `validation_error` | "Please check your payment details." |
| Network / timeout | "Connection issue. Please check your internet and try again." |

### Logging
Always log payment errors to Firestore with full context:

```typescript
await logErrorToFirestore(error, {
  feature: 'PaymentIntent',       // or 'RedirectReturn', 'GiftPolling'
  screenName: 'ExperienceCheckoutScreen',
  userId: state.user?.id,
  additionalData: {
    amount,
    paymentIntentId,
    cartItemsCount: cartItems?.length || 0,
    errorType: error.name,
  },
});
```

### Polling Timeout
If gift polling exhausts all attempts:
- Show an alert: "Your payment was successful. Your gifts are being prepared and will be available shortly."
- Do NOT treat this as a failure — the webhook may still be processing.
- Provide a path for the user to check later (navigate home, check gifts section).

---

## 6. Empower Context (Buying for Someone Else)

When a user buys an experience to empower another user's goal:

1. **Before checkout**: `empowerContext` is set in AppContext with `{ userId, goalId, userName, isMystery }`.
2. **During checkout**: `goalId` is threaded through as a route param to `ExperienceCheckoutScreen`.
3. **On ConfirmationScreen**: The screen reads `empowerContext` from `state.empowerContext` and checks `isEmpower = Boolean(empowerContext && empowerContext.userId !== state.user?.id)`.

Empower confirmation behavior:
- Send an `experience_empowered` notification to the goal owner via `notificationService.createNotification()`.
- If `isMystery === true`, notification says "mystery experience" (details hidden until goal completion).
- Clear empower context after notification: `dispatch({ type: 'SET_EMPOWER_CONTEXT', payload: null })`.
- Navigation goes "Back to Feed" (not "Back to Home").

Self-purchase with goalId (not empower):
- Auto-attach gift to goal via `goalService.attachGiftToGoal(goalId, giftId, userId)`.
- Navigation goes "Go to My Goals".

---

## 7. Security Rules

- **Never handle raw card data.** All card input goes through Stripe Elements (`PaymentElement`). The client never sees card numbers, CVVs, or expiry dates.
- **Never log sensitive card information.** Error logs must only contain paymentIntentId, amounts, and non-PCI data.
- **Always authenticate Cloud Function calls.** Every call to `stripeService` methods fetches a Firebase ID token and sends it as `Authorization: Bearer {token}`.
- **Server-side only for money operations.** PaymentIntent creation, metadata updates, and gift creation all happen in Cloud Functions. The client only confirms payment via Stripe.js.
- **Environment isolation.** Test mode uses `_Test` suffixed Cloud Functions and Stripe test keys. Never mix test and production function names.

---

## 8. Confirmation Screen Pattern

`ConfirmationScreen` receives `{ experienceGift, goalId }` as route params.

Standard behavior:
1. **Validate data on mount** — If `experienceGift` is missing/invalid (e.g., browser refresh), redirect to `CategorySelection`.
2. **Fetch experience details** — Load full experience data via `experienceService.getExperienceById()`.
3. **Success animation** — Animated scale + fade in for the check icon and hero text.
4. **Display sections** (conditionally based on flow type):
   - Hero section with success message (adapts for empower vs self-purchase vs gift-to-others).
   - Experience card with image, title, price.
   - Personal message input (gift-to-others only, not empower/self-purchase).
   - Gift claim code with copy + share (gift-to-others only).
   - "How It Works" steps (gift-to-others only).
5. **Bottom navigation button** — Adapts label and destination:
   - Empower: "Back to Feed" -> `Feed`
   - Self-purchase with goal: "Go to My Goals" -> `Goals`
   - Gift to others: "Back to Home" -> `CategorySelection`

---

## 9. Checklist

Use this before submitting any PR that touches payment or checkout code:

- [ ] PaymentIntent created via `stripeService.createPaymentIntent()`, not raw fetch
- [ ] Firebase auth token included in all Cloud Function calls
- [ ] Environment-aware function routing used (`config.stripeFunctions.*`)
- [ ] `Elements` provider wraps the checkout component with `clientSecret`
- [ ] `stripe.confirmPayment()` called with `redirect: 'if_required'`
- [ ] Redirect return handling implemented (URL params on web, AsyncStorage on native)
- [ ] Pending payment flag set before `confirmPayment` and cleared after success
- [ ] Gift polling implemented with max attempts and delay
- [ ] Cart cleared after successful payment (`dispatch({ type: 'CLEAR_CART' })`)
- [ ] Polling timeout shows user-friendly message, not an error
- [ ] Stripe errors mapped to user-friendly messages
- [ ] All payment errors logged via `logErrorToFirestore` with full context
- [ ] No raw card data logged or stored anywhere
- [ ] Empower context handled: notification sent, context cleared
- [ ] Self-purchase with goalId: gift auto-attached via `goalService.attachGiftToGoal()`
- [ ] ConfirmationScreen validates route params and redirects if invalid
- [ ] Navigation adapts based on flow type (empower / self-purchase / gift-to-others)
- [ ] Skeleton loaders used for all loading states (no `ActivityIndicator` — CLAUDE.md forbids spinners)
