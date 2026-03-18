import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

import { db } from './firebase';
import { User, Goal, Experience, UserProfile, CartItem } from '../types';
import { experienceService } from './ExperienceService';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { AppError } from '../utils/AppError';

export class UserService {
  private static instance: UserService;

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /** Create a user document after sign-up */
  async createUserProfile(user: User): Promise<void> {
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
      cart: user.cart ?? [],
    });
  }

  /** Get ONLY user.profile (subdocument) */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) return null;
    return snapshot.data().profile ?? null;
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
  }

  /** Get user display name */
  async getUserName(userId: string): Promise<string> {
    // Validate userId to prevent invalid document references
    if (!userId || userId.trim() === '') {
      logger.warn('getUserName called with empty or invalid userId');
      return 'Unknown';
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        return data.displayName || 'Unknown';
      }
      return 'Unknown';
    } catch (error) {
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
    const userDoc = await getDoc(doc(db, 'users', userId));
    const wishlistIds = userDoc.data()?.wishlist || [];

    const experiences = await Promise.all(
      wishlistIds.map((id: string) => experienceService.getExperienceById(id))
    );

    return experiences.filter(Boolean);
  }

  /** Update full user profile OR subdocument */
  async updateUserProfile(userId: string, updates: Partial<User>): Promise<void> {
    const userRef = doc(db, 'users', userId);

    if (updates.profile) {
      const profileUpdates = {
        ...updates.profile,
        updatedAt: new Date().toISOString(),
      };

      const userUpdates: Record<string, unknown> = {
        profile: profileUpdates,
        updatedAt: new Date().toISOString(),
      };

      // Sync profile.name → displayName
      if (updates.profile.name) {
        userUpdates.displayName = updates.profile.name;
      }

      await updateDoc(userRef, userUpdates);
      return;
    }

    // Normal update — restrict to whitelisted fields to prevent unintended overwrites
    const allowedFields = ['profile', 'displayName', 'settings', 'wishlist', 'cart', 'reminderTime', 'reminderEnabled'];
    const sanitizedUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => ({ ...obj, [key]: updates[key as keyof typeof updates] }), {} as Partial<typeof updates>);

    await updateDoc(userRef, {
      ...sanitizedUpdates,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Update cart fully */
  async updateCart(userId: string, cart: CartItem[]): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      cart,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Add item to cart */
  async addToCart(userId: string, cartItem: CartItem): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      cart: arrayUnion(cartItem),
      updatedAt: serverTimestamp(),
    });
  }

  /** Remove item from cart */
  async removeFromCart(userId: string, experienceId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) throw new AppError('USER_NOT_FOUND', 'User not found', 'not_found');

    const currentCart = (userSnap.data().cart as CartItem[]) || [];
    const newCart = currentCart.filter(
      (item) => item.experienceId !== experienceId
    );

    await updateDoc(userRef, {
      cart: newCart,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Clear entire cart */
  async clearCart(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      cart: [],
      updatedAt: new Date().toISOString(),
    });
  }

}

export const userService = UserService.getInstance();
