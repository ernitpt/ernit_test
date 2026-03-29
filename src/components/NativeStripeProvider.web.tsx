// NativeStripeProvider.web.tsx — web passthrough
// On web, Stripe is initialized per-screen via @stripe/react-stripe-js.
import React from 'react';

interface Props {
  children: React.ReactNode;
}

const NativeStripeProviderWrapper: React.FC<Props> = ({ children }) => <>{children}</>;

export default NativeStripeProviderWrapper;
