# Deployment Checklist

## Pre-Deploy Verification
- [ ] `npx tsc --noEmit` in `/functions` — 0 errors
- [ ] `npx jest` — all tests pass (212/212)
- [ ] `npm audit` — no high/critical vulnerabilities

## Environment Variables Required
- [ ] `EXPO_PUBLIC_APP_ENV` = `production`
- [ ] `EXPO_PUBLIC_GOOGLE_CLIENT_ID` set
- [ ] `EXPO_PUBLIC_FIREBASE_VAPID_KEY` set
- [ ] `GENERAL_EMAIL_USER` + `GENERAL_EMAIL_PASS` in ErnitPartnerApp/.env
- [ ] Firebase secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`

## Deploy Commands (in order)
1. Firestore rules: `firebase deploy --only firestore:rules`
2. Storage rules: `firebase deploy --only storage`
3. Cloud Functions: `firebase deploy --only functions`
4. Partner App: deploy via Vercel (auto from main branch)
5. Mobile App: `expo publish` or EAS build

## Post-Deploy Verification
- [ ] Create a test goal on production
- [ ] Log a session
- [ ] Check Firestore `errors` collection for new entries
- [ ] Check Stripe dashboard for test charge
- [ ] Verify push notification delivery
- [ ] Check partner dashboard login works
- [ ] Verify offline persistence (disconnect wifi, check cached data)

## Rollback Plan
- Firestore rules: `firebase deploy --only firestore:rules` with previous version
- Functions: `firebase functions:delete <functionName>` then redeploy
- App: previous Expo publish channel / EAS build

---

## Gift Flow Functions (added 2026-03-18)

These functions are new and require explicit deploy:

```bash
firebase deploy --only functions:createFreeGift,functions:createDeferredGift,functions:chargeDeferredGift
```

Test variants (`createFreeGift_Test`, `createDeferredGift_Test`, `chargeDeferredGift_Test`) target the `ernitclone2` database and should only be deployed to staging/test environments.

### Post-Deploy Checks (Gift Flow)
- [ ] Test `createFreeGift` via `GiftFlowScreen` with `paymentChoice: 'free'`
- [ ] Test `createDeferredGift` — confirm `setupIntentClientSecret` returned and `DeferredSetupScreen` loads Stripe `PaymentElement`
- [ ] Complete a shared challenge on both accounts — confirm `chargeDeferredGift` trigger fires and both goals unlock
- [ ] Confirm recipient gift email delivered (check `GENERAL_EMAIL_USER` secret is set)
- [ ] Verify `experienceGifts` documents have `claimCode` set and `claimUrl` resolves

### Firestore Indexes Required
The `chargeDeferredGift` trigger queries `experienceGifts` by `id` field (legacy lookup). Ensure the following composite index exists if not already present:

```
Collection: experienceGifts
Fields: id ASC, __name__ ASC
```
