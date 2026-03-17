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

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);

      // Skip the first check to avoid showing "Back online" on app launch
      if (isFirstCheck.current) {
        isFirstCheck.current = false;
        if (!state.isConnected) {
          wasOffline.current = true;
          showError('No internet connection');
        }
        return;
      }

      if (!state.isConnected && !wasOffline.current) {
        wasOffline.current = true;
        showError('No internet connection');
      } else if (state.isConnected && wasOffline.current) {
        wasOffline.current = false;
        showSuccess('Back online');
      }
    });

    return () => unsubscribe();
  }, [showError, showSuccess]);

  return { isConnected };
}
