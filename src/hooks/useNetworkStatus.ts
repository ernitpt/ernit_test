import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext';

/**
 * Monitors network connectivity and shows toast notifications
 * when the device goes offline or comes back online.
 * Returns { isConnected } so callers can render offline UI.
 */
export function useNetworkStatus() {
  const { showError, showSuccess } = useToast();
  const wasOffline = useRef(false);
  const isFirstCheck = useRef(true);
  const [isConnected, setIsConnected] = useState(true);

  // Keep refs to the latest toast functions so the NetInfo subscription
  // never needs to be torn down and recreated when the functions change identity.
  const showErrorRef = useRef(showError);
  const showSuccessRef = useRef(showSuccess);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);
  useEffect(() => { showSuccessRef.current = showSuccess; }, [showSuccess]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);

      // Skip the first check to avoid showing "Back online" on app launch
      if (isFirstCheck.current) {
        isFirstCheck.current = false;
        if (!state.isConnected) {
          wasOffline.current = true;
          showErrorRef.current('No internet connection');
        }
        return;
      }

      if (!state.isConnected && !wasOffline.current) {
        wasOffline.current = true;
        showErrorRef.current('No internet connection');
      } else if (state.isConnected && wasOffline.current) {
        wasOffline.current = false;
        showSuccessRef.current('Back online');
      }
    });

    return () => unsubscribe();
  }, []); // stable — toast functions accessed via refs

  return { isConnected };
}
