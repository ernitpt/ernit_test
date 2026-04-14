import React, { createContext, useContext, useState, useEffect } from 'react';
import { useApp } from './AppContext';
import { notificationService } from '../services/NotificationService';

interface NotificationBadgeContextValue {
  unreadCount: number;
}

const NotificationBadgeContext = createContext<NotificationBadgeContextValue>({ unreadCount: 0 });

export const useNotificationBadge = () => useContext(NotificationBadgeContext);

export const NotificationBadgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state } = useApp();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!state.user?.id) {
      setUnreadCount(0);
      return;
    }
    const unsubscribe = notificationService.listenToUserNotifications(
      state.user.id,
      (notifications) => {
        const unread = notifications.filter((n: { read?: boolean }) => !n.read).length;
        setUnreadCount(unread);
      }
    );
    return unsubscribe;
  }, [state.user?.id]);

  return (
    <NotificationBadgeContext.Provider value={{ unreadCount }}>
      {children}
    </NotificationBadgeContext.Provider>
  );
};
