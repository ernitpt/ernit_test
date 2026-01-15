import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

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
    startTimer: (goalId: string, pendingHint?: string | null) => void;
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

    // Load timers from AsyncStorage on mount
    useEffect(() => {
        loadTimers();
    }, []);

    // Save timers to AsyncStorage whenever they change (but only after initial load)
    useEffect(() => {
        if (hasLoaded.current) {
            saveTimers();
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

    const loadTimers = async () => {
        try {
            const stored = await AsyncStorage.getItem(TIMER_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Recalculate elapsed time for running timers
                Object.keys(parsed).forEach(goalId => {
                    if (parsed[goalId].isRunning) {
                        const elapsed = Math.floor((Date.now() - parsed[goalId].startTime) / 1000);
                        parsed[goalId].elapsed = elapsed;
                    }
                });
                setTimers(parsed);
            }
            // Mark as loaded so saves can happen
            hasLoaded.current = true;
        } catch (error) {
            logger.error('Error loading timer state:', error);
            hasLoaded.current = true; // Still mark as loaded even on error
        }
    };

    const saveTimers = async () => {
        try {
            await AsyncStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timers));
        } catch (error) {
            logger.error('Error saving timer state:', error);
        }
    };

    const getTimerState = (goalId: string): TimerState | null => {
        return timers[goalId] || null;
    };

    const startTimer = (goalId: string, pendingHint: string | null = null) => {
        setTimers(prev => ({
            ...prev,
            [goalId]: {
                isRunning: true,
                startTime: Date.now(),
                elapsed: 0,
                pendingHint,
            },
        }));
    };

    const stopTimer = (goalId: string) => {
        setTimers(prev => {
            const updated = { ...prev };
            delete updated[goalId];
            return updated;
        });
    };

    const updateElapsed = (goalId: string, elapsed: number) => {
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
    };

    return (
        <TimerContext.Provider value={{ getTimerState, startTimer, stopTimer, updateElapsed }}>
            {children}
        </TimerContext.Provider>
    );
};
