import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { CartItem } from '../types';

const CART_STORAGE_KEY = 'guest_cart';

/**
 * Service to manage cart for unauthenticated users
 * Cart is stored locally and merged when user logs in
 */
export class CartService {
  /**
   * Get cart from local storage (for unauthenticated users)
   */
  static async getGuestCart(): Promise<CartItem[]> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const stored = localStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log('[CartService] Loaded guest cart from localStorage:', parsed.length, 'items');
          return Array.isArray(parsed) ? parsed : [];
        }
        return [];
      }
      const stored = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('[CartService] Loaded guest cart from AsyncStorage:', parsed.length, 'items');
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (error) {
      console.error('[CartService] Error getting guest cart:', error);
      return [];
    }
  }

  /**
   * Save cart to local storage (for unauthenticated users)
   */
  static async saveGuestCart(cart: CartItem[]): Promise<void> {
    try {
      const cartJson = JSON.stringify(cart);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.setItem(CART_STORAGE_KEY, cartJson);
      } else {
        await AsyncStorage.setItem(CART_STORAGE_KEY, cartJson);
      }
    } catch (error) {
      console.error('Error saving guest cart:', error);
    }
  }

  /**
   * Clear guest cart from local storage
   */
  static async clearGuestCart(): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.removeItem(CART_STORAGE_KEY);
      } else {
        await AsyncStorage.removeItem(CART_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error clearing guest cart:', error);
    }
  }

  /**
   * Merge guest cart with user cart when logging in
   * Combines items, updating quantities if same experience exists
   */
  static mergeCarts(guestCart: CartItem[], userCart: CartItem[]): CartItem[] {
    const merged = [...userCart];
    
    for (const guestItem of guestCart) {
      const existingIndex = merged.findIndex(
        item => item.experienceId === guestItem.experienceId
      );
      
      if (existingIndex >= 0) {
        // Merge quantities
        merged[existingIndex] = {
          ...merged[existingIndex],
          quantity: merged[existingIndex].quantity + guestItem.quantity,
        };
      } else {
        // Add new item
        merged.push(guestItem);
      }
    }
    
    return merged;
  }
}

export const cartService = CartService;

