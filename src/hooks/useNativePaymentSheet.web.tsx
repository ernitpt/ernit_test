// useNativePaymentSheet.web.tsx — web stub
// Native payment sheet is never used on web. This stub prevents the bundler
// from pulling in @stripe/stripe-react-native (which imports RN internals).

export const usePaymentSheet = () => ({
  initPaymentSheet: async (_opts: Record<string, unknown>) => ({ error: null as unknown }),
  presentPaymentSheet: async () => ({ error: null as unknown }),
});
