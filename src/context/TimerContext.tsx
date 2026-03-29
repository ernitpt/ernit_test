import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { pushNotificationService } from '../services/PushNotificationService';

const TIMER_STORAGE_KEY = 'global_timer_state';

interface TimerState {
    isRunning: boolean;
    startTime: number;
    elapsed: number;
    pendingHint: string | null;
}

interface TimersState {
    [goalId: string]: TimerState;
}

interface TimerContextValue {
    getTimerState: (goalId: string) => TimerState | null;
    startTimer: (goalId: string, pendingHint?: string | null, goalTitle?: string, targetSeconds?: number) => void;
    stopTimer: (goalId: string) => void;
    updateElapsed: (goalId: string, elapsed: number) => void;
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined);

export const useTimerContext = () => {
    const context = useContext(TimerContext);
    if (!context) {
        throw new Error('useTimerContext must be used within TimerProvider');
    }
    return context;
};

interface TimerProviderProps {
    children: ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
    const [timers, setTimers] = useState<TimersState>({});
    const hasLoaded = useRef(false);
    const mountedRef = useRef(false);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Load timers from AsyncStorage on mount
    useEffect(() => {
        loadTimers();
    }, []);

    // Save timers to AsyncStorage whenever they change (but only after initial load)
    // Debounced to at most once every 5 seconds to avoid excessive AsyncStorage writes
    useEffect(() => {
        if (hasLoaded.current) {
            const debounceTimer = setTimeout(() => {
                saveTimers();
            }, 5000);
            return () => clearTimeout(debounceTimer);
        }
    }, [timers]);

    // Single interval to update all running timers
    useEffect(() => {
        const interval = setInterval(() => {
            setTimers(prev => {
                const updated = { ...prev };
                let hasChanges = false;

                Object.keys(updated).forEach(goalId => {
                    if (updated[goalId].isRunning) {
                        const elapsed = Math.floor((Date.now() - updated[goalId].startTime) / 1000);
                        if (elapsed !== updated[goalId].elapsed) {
                            updated[goalId] = { ...updated[goalId], elapsed };
                            hasChanges = true;
                        }
                    }
                });

                return hasChanges ? updated : prev;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Use a ref to always have access to latest timers for immediate flush
    const timersRef = useRef(timers);
    useEffect(() => { timersRef.current = timers; }, [timers]);

    // Flush timer state immediately when app goes to background (prevents data loss on kill)
    useEffect(() => {
        const flushTimers = () => {
            try {
                AsyncStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timersRef.current));
            } catch (error: unknown) {
                logger.error('Error flushing timer state on background:', error);
            }
        };

        if (Platform.OS === 'web') {
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'hidden') flushTimers();
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
        } else {
            const subscription = AppState.addEventListener('change', (nextState) => {
                if (nextState === 'background' || nextState === 'inactive') flushTimers();
            });
            return () => subscription.remove();
        }
    }, []);

    const loadTimers = async () => {
        try {
            const stored = await AsyncStorage.getItem(TIMER_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Recalculate elapsed time for running timers
                const MAX_SESSION_SECONDS = 8 * 3600; // 8 hours — stale sessions are capped
                // Build a new object instead of mutating parsed JSON directly
                const STALE_THRESHOLD = 24 * 3600 * 1000;
                const now = Date.now();
                const restored: TimersState = {};
                Object.keys(parsed as TimersState).forEach(goalId => {
                    const timer: TimerState = parsed[goalId];
                    if (timer.isRunning) {
                        const elapsed = Math.floor((now - timer.startTime) / 1000);
                        if (elapsed > MAX_SESSION_SECONDS) {
                            restored[goalId] = { ...timer, isRunning: false, elapsed: MAX_SESSION_SECONDS };
                        } else {
                            restored[goalId] = { ...timer, elapsed };
                        }
                    } else {
                        // Prune stale stopped timers older than 24 hours
                        if ((now - timer.startTime) <= STALE_THRESHOLD) {
                            restored[goalId] = { ...timer };
                        }
                    }
                });
                if (mountedRef.current) {
                    setTimers(restored);
                }
            }
            // Mark as loaded so saves can happen
            hasLoaded.current = true;
        } catch (error: unknown) {
            logger.error('Error loading timer state:', error);
            hasLoaded.current = true; // Still mark as loaded even on error
        }
    };

    const saveTimers = useCallback(async () => {
        try {
            await AsyncStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timersRef.current));
        } catch (error: unknown) {
            logger.error('Error saving timer state:', error);
        }
    }, []); // timersRef is a ref — always stable, no stale closure risk

    const getTimerState = useCallback((goalId: string): TimerState | null => {
        return timers[goalId] || null;
    }, [timers]);

    const startTimer = useCallback((goalId: string, pendingHint: string | null = null, goalTitle?: string, targetSeconds?: number) => {
        analyticsService.trackEvent('session_start', 'engagement', { goalId });
        setTimers(prev => ({
            ...prev,
            [goalId]: {
                isRunning: true,
                startTime: Date.now(),
                elapsed: 0,
                pendingHint,
            },
        }));
        if (Platform.OS !== 'web') {
            pushNotificationService.showTimerProgressNotification(goalId, goalTitle || 'Session', 0, targetSeconds || 0);
        }
    }, []);

    const stopTimer = useCallback((goalId: string) => {
        setTimers(prev => {
            const updated = { ...prev };
            delete updated[goalId];
            return updated;
        });
        if (Platform.OS !== 'web') {
            pushNotificationService.cancelTimerProgressNotification(goalId);
        }
    }, []);

    const updateElapsed = useCallback((goalId: string, elapsed: number) => {
        setTimers(prev => {
            if (!prev[goalId]) return prev;
            return {
                ...prev,
                [goalId]: {
                    ...prev[goalId],
                    elapsed,
                },
            };
        });
    }, []);

    const contextValue = useMemo(() => ({
        getTimerState, startTimer, stopTimer, updateElapsed,
    }), [getTimerState, startTimer, stopTimer, updateElapsed]);

    return (
        <TimerContext.Provider value={contextValue}>
            {children}
        </TimerContext.Provider>
    );
};
