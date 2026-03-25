import { useEffect } from 'react';
import type { NavigationProp } from '@react-navigation/native';

type BeforeRemoveEvent = {
  preventDefault: () => void;
  data: {
    action: Parameters<NavigationProp<Record<string, object | undefined>>['dispatch']>[0];
  };
};

/**
 * Attaches a `beforeRemove` listener to the navigation object.
 * Eliminates the need for `'beforeRemove' as never` cast across screens.
 *
 * @param navigation - The navigation prop from the current screen.
 * @param handler - Callback fired when the user attempts to navigate back.
 * @param deps - Dependency array (same as useEffect deps).
 */
export function useBeforeRemove(
  navigation: NavigationProp<Record<string, object | undefined>>,
  handler: (e: BeforeRemoveEvent) => void,
  deps: React.DependencyList,
): void {
  useEffect(() => {
    // Cast is required because @react-navigation/native-stack's addListener
    // doesn't expose 'beforeRemove' in its event map type, even though the
    // underlying NavigationContainer does support it at runtime.
    const unsubscribe = (navigation as unknown as {
      addListener: (
        event: string,
        callback: (e: BeforeRemoveEvent) => void,
      ) => () => void;
    }).addListener('beforeRemove', handler);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, ...deps]);
}
