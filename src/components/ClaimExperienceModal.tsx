import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { ShoppingBag, Search } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, ExperienceCategory } from '../types';
import { useApp } from '../context/AppContext';
import { Colors, Typography, Spacing, BorderRadius } from '../config';
import { BaseModal } from './BaseModal';

interface ClaimExperienceModalProps {
    visible: boolean;
    goalId: string;
    experienceTitle?: string;
    experiencePrice?: number;
    pledgedExperienceId?: string;
    preferredRewardCategory?: ExperienceCategory;
    onClose: () => void;
}

const ClaimExperienceModal: React.FC<ClaimExperienceModalProps> = ({
    visible,
    goalId,
    experienceTitle,
    experiencePrice,
    pledgedExperienceId,
    preferredRewardCategory,
    onClose,
}) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { state, dispatch } = useApp();

    const setEmpowerContext = () => {
        dispatch({
            type: 'SET_EMPOWER_CONTEXT',
            payload: {
                goalId,
                userId: state.user?.id || '',
                userName: state.user?.displayName || state.user?.profile?.name || 'You',
            },
        });
    };

    const handleDirect = () => {
        if (!pledgedExperienceId) return;
        setEmpowerContext();
        onClose();
        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: pledgedExperienceId, quantity: 1 }],
        });
    };

    const handleBrowse = () => {
        setEmpowerContext();
        onClose();
        navigation.navigate('CategorySelection',
            preferredRewardCategory ? { prefilterCategory: preferredRewardCategory } : undefined
        );
    };

    return (
        <BaseModal visible={visible} onClose={onClose} title="Claim Your Experience">
            <Text style={styles.subtitle}>
                You've earned it — pick your reward!
            </Text>

            {/* Option 1: Buy pledged experience */}
            {experienceTitle && pledgedExperienceId && (
                <TouchableOpacity
                    style={styles.optionPrimary}
                    onPress={handleDirect}
                    activeOpacity={0.8}
                >
                    <ShoppingBag size={18} color={Colors.white} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.optionPrimaryText} numberOfLines={1}>
                            Claim "{experienceTitle}"
                        </Text>
                        {experiencePrice != null && (
                            <Text style={styles.optionPrice}>
                                {'\u20AC'}{experiencePrice}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>
            )}

            {/* Option 2: Browse */}
            <TouchableOpacity
                style={styles.optionSecondary}
                onPress={handleBrowse}
                activeOpacity={0.8}
            >
                <Search size={18} color={Colors.primary} />
                <Text style={styles.optionSecondaryText}>
                    {preferredRewardCategory && !experienceTitle
                        ? `Browse ${preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)} Experiences`
                        : 'Browse Other Experiences'}
                </Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
            >
                <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
        </BaseModal>
    );
};

const styles = StyleSheet.create({
    subtitle: {
        ...Typography.small,
        color: Colors.textSecondary,
        marginBottom: Spacing.xl,
    },
    optionPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.secondary,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.cardPadding,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
    },
    optionPrimaryText: {
        ...Typography.bodyBold,
        color: Colors.white,
    },
    optionPrice: {
        ...Typography.caption,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '600',
        marginTop: Spacing.xxs,
    },
    optionSecondary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.primarySurface,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.cardPadding,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
        marginBottom: Spacing.sm,
    },
    optionSecondaryText: {
        ...Typography.bodyBold,
        color: Colors.primary,
    },
    cancelButton: {
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    cancelText: {
        ...Typography.small,
        color: Colors.textMuted,
    },
});

export default ClaimExperienceModal;
