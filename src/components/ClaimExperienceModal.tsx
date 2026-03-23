import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { ShoppingBag, Search } from 'lucide-react-native';
import Button from './Button';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, ExperienceCategory } from '../types';
import { useApp } from '../context/AppContext';
import { Colors, useColors, Typography, Spacing, BorderRadius } from '../config';
import * as Haptics from 'expo-haptics';
import { BaseModal } from './BaseModal';
import { SkeletonBox } from './SkeletonLoader';

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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { state, dispatch } = useApp();
    const [isNavigating, setIsNavigating] = useState(false);

    useEffect(() => {
        if (!visible) setIsNavigating(false);
    }, [visible]);

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
        if (!pledgedExperienceId || isNavigating) return;
        setIsNavigating(true);
        setEmpowerContext();
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        // Brief delay so user sees loading feedback before modal closes
        setTimeout(() => {
            onClose();
            navigation.navigate('ExperienceCheckout', {
                cartItems: [{ experienceId: pledgedExperienceId, quantity: 1 }],
            });
        }, 400);
    };

    const handleBrowse = () => {
        if (isNavigating) return;
        setIsNavigating(true);
        setEmpowerContext();
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setTimeout(() => {
            onClose();
            navigation.navigate('CategorySelection',
                preferredRewardCategory ? { prefilterCategory: preferredRewardCategory } : undefined
            );
        }, 400);
    };

    return (
        <BaseModal visible={visible} onClose={onClose} title="Claim Your Experience">
            {isNavigating ? (
                <View style={styles.loadingContainer}>
                    <SkeletonBox width="100%" height={52} borderRadius={12} />
                    <SkeletonBox width="100%" height={44} borderRadius={12} />
                    <SkeletonBox width="60%" height={36} borderRadius={8} />
                    <Text style={styles.loadingText}>Taking you there...</Text>
                </View>
            ) : (
                <>
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
                            <ShoppingBag size={18} color={colors.white} />
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
                    <Button
                        title={
                            preferredRewardCategory && !experienceTitle
                                ? `Browse ${preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)} Experiences`
                                : 'Browse Other Experiences'
                        }
                        onPress={handleBrowse}
                        variant="secondary"
                        size="md"
                        fullWidth
                        icon={<Search size={18} color={colors.primary} />}
                        style={{ marginBottom: Spacing.sm }}
                    />

                    {/* Cancel */}
                    <Button
                        title="Cancel"
                        onPress={onClose}
                        variant="ghost"
                        size="sm"
                        fullWidth
                    />
                </>
            )}
        </BaseModal>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    subtitle: {
        ...Typography.small,
        color: colors.textSecondary,
        marginBottom: Spacing.xl,
    },
    optionPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: colors.secondary,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.cardPadding,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
    },
    optionPrimaryText: {
        ...Typography.bodyBold,
        color: colors.white,
    },
    optionPrice: {
        ...Typography.caption,
        color: colors.whiteAlpha80,
        fontWeight: '600',
        marginTop: Spacing.xxs,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xxxl,
        gap: Spacing.lg,
    },
    loadingText: {
        ...Typography.body,
        color: colors.textSecondary,
    },
});

export default ClaimExperienceModal;
