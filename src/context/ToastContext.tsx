import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastMessage = {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
};

type ToastActionsContextType = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  removeToast: (id: string) => void;
};

type ToastStateContextType = {
  toasts: ToastMessage[];
};

// Stable actions context — only changes when functions change (never after mount)
const ToastActionsContext = createContext<ToastActionsContextType | null>(null);

// State context — changes on every toast add/remove, consumed only by the renderer
const ToastStateContext = createContext<ToastStateContextType | null>(null);

/**
 * useToast — returns stable action functions plus the current toasts list.
 * Consumers that only call show/remove functions will NOT re-render when toasts change
 * because the actions context is stable. Only callers that read `toasts` will re-render.
 */
export const useToast = () => {
  const actions = useContext(ToastActionsContext);
  const stateCtx = useContext(ToastStateContext);
  if (!actions || !stateCtx) throw new Error('useToast must be used within ToastProvider');
  return { ...actions, toasts: stateCtx.toasts };
};

/**
 * useToastActions — returns only the stable action functions.
 * Components that only trigger toasts (showError etc.) should prefer this hook
 * so they are never re-rendered by toast queue changes.
 */
export const useToastActions = () => {
  const actions = useContext(ToastActionsContext);
  if (!actions) throw new Error('useToastActions must be used within ToastProvider');
  return actions;
};

/**
 * useToastState — returns only the current toast list.
 * Intended for the toast renderer component.
 */
export const useToastState = () => {
  const stateCtx = useContext(ToastStateContext);
  if (!stateCtx) throw new Error('useToastState must be used within ToastProvider');
  return stateCtx;
};

const DURATION = {
  success: 3000,
  info: 3000,
  error: 5000,
  warning: 4000,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = String(++counterRef.current);
    const duration = DURATION[type];
    setToasts(prev => [...prev.slice(-2), { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showSuccess = useCallback((msg: string) => addToast('success', msg), [addToast]);
  const showError = useCallback((msg: string) => addToast('error', msg), [addToast]);
  const showInfo = useCallback((msg: string) => addToast('info', msg), [addToast]);
  const showWarning = useCallback((msg: string) => addToast('warning', msg), [addToast]);

  // Stable actions value — only the functions, no toast state. Never rebuilds after mount.
  const actionsValue = useMemo(() => ({
    showSuccess, showError, showInfo, showWarning, removeToast,
  }), [showSuccess, showError, showInfo, showWarning, removeToast]);

  // State value — rebuilds on every toast change, but only consumed by the renderer
  const stateValue = useMemo(() => ({ toasts }), [toasts]);

  return (
    <ToastActionsContext.Provider value={actionsValue}>
      <ToastStateContext.Provider value={stateValue}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
};
