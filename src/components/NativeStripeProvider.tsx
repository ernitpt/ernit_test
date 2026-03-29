// NativeStripeProvider.tsx — native-only (iOS/Android)
// Web uses the .web.tsx variant which exports a passthrough.
import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

interface Props {
  children: React.ReactNode;
}

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PK;
if (!STRIPE_PK) {
  console.error('[NativeStripeProvider] EXPO_PUBLIC_STRIPE_PK is not set. Stripe will not work.');
}

const NativeStripeProviderWrapper: React.FC<Props> = ({ children }) => (
  <StripeProvider publishableKey={STRIPE_PK ?? ''}>
    {children}
  </StripeProvider>
);

export default NativeStripeProviderWrapper;
