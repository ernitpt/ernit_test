import React, { createContext, useContext, useReducer, useMemo, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import { User, ExperienceGift, Goal, Hint, CartItem } from '../types';
import { logger } from '../utils/logger';

interface GoalTimerState {
  startedAt: number;
  elapsedBeforePause: number;
  isRunning: boolean;
}

// State interface
interface AppState {
  user: User | null;
  guestCart?: CartItem[]; // Cart for unauthenticated users
  currentExperienceGift: ExperienceGift | null;
  currentGoal: Goal | null;
  hints: Hint[];
  isLoading: boolean;
  error: string | null;
  goals: Goal[];
  goalTimers: Record<string, GoalTimerState>;
  empowerContext: { goalId: string; userId: string; userName?: string; isMystery?: boolean } | null;
  debugMode: boolean;
}

// Action types
type AppAction =
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_EXPERIENCE_GIFT'; payload: ExperienceGift | null }
  | { type: 'SET_GOAL'; payload: Goal | null }
  | { type: 'ADD_HINT'; payload: Hint }
  | { type: 'SET_HINTS'; payload: Hint[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_GOAL_PROGRESS'; payload: { goalId: string; currentCount: number } }
  | { type: 'SET_CART'; payload: CartItem[] }
  | {
      type: 'UPDATE_GOAL_WEEKLY';
      payload: {
        goalId: string;
        currentCount: number;
        weeklyCount: number;
        weekStartAt: Date | null;
        isCompleted?: boolean;
      };
    }
  | { type: 'START_GOAL_TIMER'; payload: { goalId: string; startedAt: number; elapsedBeforePause?: number } }
  | { type: 'CLEAR_GOAL_TIMER'; payload: { goalId: string } }
  | { type: 'ADD_TO_CART'; payload: CartItem }
  | { type: 'REMOVE_FROM_CART'; payload: { experienceId: string } }
  | { type: 'UPDATE_CART_ITEM'; payload: { experienceId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_EMPOWER_CONTEXT'; payload: { goalId: string; userId: string; userName?: string; isMystery?: boolean } | null }
  | { type: 'TOGGLE_DEBUG_MODE' }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: AppState = {
  user: null,
  guestCart: [],
  currentExperienceGift: null,
  currentGoal: null,
  hints: [],
  isLoading: false,
  error: null,
  goals: [],
  goalTimers: {},
  empowerContext: null,
  debugMode: false,
};

/** Merge guest cart items into user cart, summing quantities for duplicates */
function mergeGuestCart(guestCart?: CartItem[], userCart?: CartItem[]): CartItem[] {
  const merged = new Map<string, number>();
  for (const item of userCart || []) {
    merged.set(item.experienceId, (merged.get(item.experienceId) || 0) + item.quantity);
  }
  for (const item of guestCart || []) {
    merged.set(item.experienceId, (merged.get(item.experienceId) || 0) + item.quantity);
  }
  return Array.from(merged.entries()).map(([experienceId, quantity]) => ({
    experienceId,
    quantity: Math.min(quantity, 10), // Cap at max quantity
  }));
}

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_USER': {
      if (action.payload && state.guestCart?.length) {
        const mergedCart = mergeGuestCart(state.guestCart, action.payload.cart);
        return {
          ...state,
          user: { ...action.payload, cart: mergedCart },
          guestCart: undefined,
        };
      }
      return {
        ...state,
        user: action.payload,
        guestCart: action.payload ? undefined : state.guestCart,
      };
    }

    case 'SET_EXPERIENCE_GIFT':
      return { ...state, currentExperienceGift: action.payload };

    case 'SET_GOAL':
      return { ...state, currentGoal: action.payload };

    case 'ADD_HINT':
      return { ...state, hints: [...state.hints, action.payload] };

    case 'SET_HINTS':
      return { ...state, hints: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'UPDATE_GOAL_PROGRESS': {
      if (!state.currentGoal) return state;
      if (state.currentGoal.id !== action.payload.goalId) return state;
      return {
        ...state,
        currentGoal: {
          ...state.currentGoal,
          currentCount: action.payload.currentCount,
        },
      };
    }

    case 'UPDATE_GOAL_WEEKLY': {
      if (!state.currentGoal) return state;
      if (state.currentGoal.id !== action.payload.goalId) return state;

      return {
        ...state,
        currentGoal: {
          ...state.currentGoal,
          currentCount: action.payload.currentCount,
          weeklyCount: action.payload.weeklyCount,
          weekStartAt: action.payload.weekStartAt,
          isCompleted:
            typeof action.payload.isCompleted === 'boolean'
              ? action.payload.isCompleted
              : state.currentGoal.isCompleted,
        },
      };
    }

    case 'START_GOAL_TIMER': {
      const { goalId, startedAt, elapsedBeforePause = 0 } = action.payload;
      // Prevent starting duplicate timers for the same goal
      if (state.goalTimers[goalId]?.isRunning) return state;
      return {
        ...state,
        goalTimers: {
          ...state.goalTimers,
          [goalId]: {
            startedAt,
            elapsedBeforePause,
            isRunning: true,
          },
        },
      };
    }

    case 'CLEAR_GOAL_TIMER': {
      const { [action.payload.goalId]: _removed, ...rest } = state.goalTimers;
      return {
        ...state,
        goalTimers: rest,
      };
    }

    case 'ADD_TO_CART': {
      // Get current cart (user cart or guest cart)
      const existingCart = state.user?.cart || state.guestCart || [];
      const existingItemIndex = existingCart.findIndex(
        (item) => item.experienceId === action.payload.experienceId
      );

      let newCart: CartItem[];
      if (existingItemIndex >= 0) {
        // Update quantity if item already exists
        newCart = existingCart.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + action.payload.quantity }
            : item
        );
      } else {
        // Add new item
        newCart = [...existingCart, action.payload];
      }

      // If user is logged in, update user cart
      if (state.user) {
        return {
          ...state,
          user: {
            ...state.user,
            cart: newCart,
          },
        };
      }
      
      // For guest users, store cart in state (persistence handled by useEffect in AppProvider)
      return {
        ...state,
        guestCart: newCart,
      };
    }

    case 'REMOVE_FROM_CART': {
      const existingCart = state.user?.cart || state.guestCart || [];
      const newCart = existingCart.filter(
        (item) => item.experienceId !== action.payload.experienceId
      );

      if (state.user) {
        return {
          ...state,
          user: {
            ...state.user,
            cart: newCart,
          },
        };
      }
      
      return {
        ...state,
        guestCart: newCart,
      };
    }

    case 'UPDATE_CART_ITEM': {
      const existingCart = state.user?.cart || state.guestCart || [];
      const newCart = existingCart.map((item) =>
        item.experienceId === action.payload.experienceId
          ? { ...item, quantity: action.payload.quantity }
          : item
      );

      if (state.user) {
        return {
          ...state,
          user: {
            ...state.user,
            cart: newCart,
          },
        };
      }
      
      return {
        ...state,
        guestCart: newCart,
      };
    }

    case 'CLEAR_CART': {
      if (state.user) {
        return {
          ...state,
          user: {
            ...state.user,
            cart: [],
          },
        };
      }
      
      return {
        ...state,
        guestCart: [],
      };
    }
    
    case "SET_CART": {
      if (state.user) {
        return {
          ...state,
          user: {
            ...state.user,
            cart: action.payload,
          },
        };
      }
      
      return {
        ...state,
        guestCart: action.payload,
      };
    }
    
    case 'SET_EMPOWER_CONTEXT':
      return { ...state, empowerContext: action.payload };

    case 'TOGGLE_DEBUG_MODE':
      return { ...state, debugMode: !state.debugMode };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
};

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider component
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Persist guest cart to localStorage (extracted from reducer for purity)
  useEffect(() => {
    if (Platform.OS === 'web' && state.guestCart !== undefined) {
      try {
        localStorage.setItem('guest_cart', JSON.stringify(state.guestCart));
      } catch (error: unknown) {
        logger.error('Failed to persist cart:', error);
      }
    }
  }, [state.guestCart]);

  // Restore guest cart from localStorage on mount
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const savedCart = localStorage.getItem('guest_cart');
        if (savedCart) {
          const parsedCart = JSON.parse(savedCart);
          if (Array.isArray(parsedCart) && parsedCart.length > 0) {
            dispatch({ type: 'SET_CART', payload: parsedCart });
          }
        }
      } catch (error: unknown) {
        logger.error('Failed to restore cart:', error);
      }
    }
  }, []);

  const contextValue = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// Hook to use the context
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
