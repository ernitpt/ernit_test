import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';

import { db } from './firebase';
import { User, Goal, Experience, UserProfile, CartItem } from '../types';
import { experienceService } from './ExperienceService';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { AppError } from '../utils/AppError';
import { sanitizeProfileData, sanitizeText } from '../utils/sanitization';

export class UserService {
  private static instance: UserService;
  private _nameCache = new Map<string, string>();

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /** Create a user document after sign-up */
  async createUserProfile(user: User): Promise<void> {
    try {
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        ...user,
        // ✅ SECURITY: Sanitize display name sourced from OAuth providers
        displayName: user.displayName ? sanitizeText(user.displayName, 100) : user.displayName,
        createdAt: user.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
        cart: user.cart ?? [],
      }, { merge: true }); // merge: true makes concurrent creation calls idempotent (no race overwrite)
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('createUserProfile failed'), {
        screenName: 'userService',
        feature: 'createUserProfile',
      });
      throw error;
    }
  }

  /** Get ONLY user.profile (subdocument) */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const snapshot = await getDoc(userRef);

      if (!snapshot.exists()) return null;
      return snapshot.data().profile ?? null;
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('getUserProfile failed'), {
        screenName: 'userService',
        feature: 'getUserProfile',
      });
      return null;
    }
  }

  /** Parse Firestore / string dates */
  private parseDate(value: unknown): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }

  /** Get full User object */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const snapshot = await getDoc(userRef);

      if (!snapshot.exists()) return null;

      const data = snapshot.data();

      return {
        id: userId,
        email: data.email || '',
        displayName: data.displayName || undefined,
        userType: data.userType || 'giver',
        createdAt: this.parseDate(data.createdAt),
        wishlist: Array.isArray(data.wishlist) ? data.wishlist : [],

        // 🔥 ensure cart is always an array of CartItem
        cart: Array.isArray(data.cart)
          ? data.cart.filter((item: unknown): item is CartItem =>
              item != null &&
              typeof item === 'object' &&
              typeof (item as CartItem).experienceId === 'string' &&
              typeof (item as CartItem).quantity === 'number')
          : [],

        profile: data.profile
          ? {
            ...data.profile,
            createdAt: this.parseDate(data.profile.createdAt),
            updatedAt: this.parseDate(data.profile.updatedAt),
          }
          : undefined,
      };
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('getUserById failed'), {
        screenName: 'userService',
        feature: 'getUserById',
      });
      return null;
    }
  }

  /** Get user display name */
  async getUserName(userId: string): Promise<string> {
    // Validate userId to prevent invalid document references
    if (!userId || userId.trim() === '') {
      logger.warn('getUserName called with empty or invalid userId');
      return 'Unknown';
    }

    if (this._nameCache.has(userId)) {
      return this._nameCache.get(userId)!;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const name = data.displayName || 'Unknown';
        this._nameCache.set(userId, name);
        return name;
      }
      this._nameCache.set(userId, 'Unknown');
      return 'Unknown';
    } catch (error: unknown) {
      logger.error('Error fetching user name:', error);
      await logErrorToFirestore(error, {
        screenName: 'UserService',
        feature: 'GetUserName',
        additionalData: { targetUserId: userId }
      });
      return 'Unknown';
    }
  }

  /** Get wishlist as Experience[] */
  async getWishlist(userId: string): Promise<Experience[]> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const wishlistIds = userDoc.data()?.wishlist || [];

      const experiences = await Promise.all(
        wishlistIds.map((id: string) => experienceService.getExperienceById(id))
      );

      return experiences.filter(Boolean);
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('getWishlist failed'), {
        screenName: 'userService',
        feature: 'getWishlist',
      });
      return [];
    }
  }

  /** Update full user profile OR subdocument */
  async updateUserProfile(userId: string, updates: Partial<User>): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);

      if (updates.profile) {
        // ✅ SECURITY: Sanitize user-provided text fields before writing to Firestore
        const sanitized = sanitizeProfileData({
          name: updates.profile.name,
          description: updates.profile.description,
          country: updates.profile.country,
        });

        const profileUpdates = {
          ...updates.profile,
          ...(updates.profile.name !== undefined && { name: sanitized.name }),
          ...(updates.profile.description !== undefined && { description: sanitized.description }),
          ...(updates.profile.country !== undefined && { country: sanitized.country }),
          updatedAt: new Date().toISOString(),
        };

        const userUpdates: Record<string, unknown> = {
          profile: profileUpdates,
          updatedAt: new Date().toISOString(),
        };

        // Sync profile.name → displayName (sanitized)
        if (updates.profile.name) {
          userUpdates.displayName = sanitized.name;
        }

        await updateDoc(userRef, userUpdates);
        return;
      }

      // Normal update — restrict to whitelisted fields to prevent unintended overwrites
      const allowedFields = ['profile', 'displayName', 'settings', 'wishlist', 'cart', 'reminderTime', 'reminderEnabled', 'preferredLanguage'];
      const sanitizedUpdates = Object.keys(updates)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => ({ ...obj, [key]: updates[key as keyof typeof updates] }), {} as Partial<typeof updates>);

      await updateDoc(userRef, {
        ...sanitizedUpdates,
        updatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('updateUserProfile failed'), {
        screenName: 'userService',
        feature: 'updateUserProfile',
      });
      throw error;
    }
  }

  /** Update cart fully */
  async updateCart(userId: string, cart: CartItem[]): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        cart,
        updatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('updateCart failed'), {
        screenName: 'userService',
        feature: 'updateCart',
      });
      throw error;
    }
  }

  /** Add item to cart */
  async addToCart(userId: string, cartItem: CartItem): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      // SECURITY FIX (M18): Use a transaction to read the current cart, remove any existing
      // entry with the same experienceId, then write back the deduped cart with the new item.
      // arrayUnion was not sufficient because it performs equality checks on the whole object,
      // so adding the same experience with a different quantity created duplicate cart entries.
      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const currentCart: CartItem[] = userSnap.exists() ? (userSnap.data().cart ?? []) : [];
        const filteredCart = currentCart.filter(
          (item: CartItem) => item.experienceId !== cartItem.experienceId
        );
        transaction.update(userRef, {
          cart: [...filteredCart, cartItem],
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('addToCart failed'), {
        screenName: 'userService',
        feature: 'addToCart',
      });
      throw error;
    }
  }

  /** Remove item from cart */
  async removeFromCart(userId: string, experienceId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(userRef);
        if (!snap.exists()) return;
        const currentCart: CartItem[] = snap.data()?.cart || [];
        const updatedCart = currentCart.filter(item => item.experienceId !== experienceId);
        transaction.update(userRef, { cart: updatedCart, updatedAt: new Date().toISOString() });
      });
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('removeFromCart failed'), {
        screenName: 'userService',
        feature: 'removeFromCart',
      });
      throw error;
    }
  }

  /** Clear entire cart */
  async clearCart(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        cart: [],
        updatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logErrorToFirestore(error instanceof Error ? error : new Error('clearCart failed'), {
        screenName: 'userService',
        feature: 'clearCart',
      });
      // Don't rethrow — cart clear failure is non-critical
    }
  }

}

export const userService = UserService.getInstance();
