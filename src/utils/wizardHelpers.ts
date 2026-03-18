import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '../config/colors';

// ─── Experience categories ────────────────────────────────────────────────────
export const EXPERIENCE_CATEGORIES = [
    { key: 'adventure', label: 'Adventure', emoji: '\u{1F3D4}\u{FE0F}', color: Colors.categoryAmber, match: ['adventure'] },
    { key: 'wellness', label: 'Wellness', emoji: '\u{1F9D8}', color: Colors.categoryPink, match: ['relaxation', 'spa', 'health', 'wellness'] },
    { key: 'creative', label: 'Creative', emoji: '\u{1F3A8}', color: Colors.categoryViolet, match: ['culture', 'arts', 'creative', 'workshop', 'food-culture'] },
];

// ─── Storage helper (cross-platform) ─────────────────────────────────────────
export const setStorageItem = async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.setItem(key, value);
    } else {
        await AsyncStorage.setItem(key, value);
    }
};

// ─── Sanitize numeric input ───────────────────────────────────────────────────
export const sanitizeNumericInput = (text: string): string => text.replace(/[^0-9]/g, '');
