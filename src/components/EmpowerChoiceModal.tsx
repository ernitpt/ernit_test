import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ShoppingBag, Gift } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, ExperienceCategory } from '../types';
import { useApp } from '../context/AppContext';
import { Colors, Typography, Spacing, BorderRadius } from '../config';
import { BaseModal } from './BaseModal';
import Button from './Button';

interface EmpowerChoiceModalProps {
    visible: boolean;
    userName: string;
    experienceTitle?: string;
    experiencePrice?: number;
    pledgedExperienceId?: string;
    goalId: string;
    goalUserId: string;
    onClose: () => void;
    preferredRewardCategory?: ExperienceCategory;
}

const EmpowerChoiceModal: React.FC<EmpowerChoiceModalProps> = ({
    visible,
    userName,
    experienceTitle,
    experiencePrice,
    pledgedExperienceId,
    goalId,
    goalUserId,
    onClose,
    preferredRewardCategory,
}) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { dispatch } = useApp();

    const setEmpowerContext = () => {
        dispatch({
            type: 'SET_EMPOWER_CONTEXT',
            payload: { goalId, userId: goalUserId, userName },
        });
    };

    const handleDirect = () => {
        if (!pledgedExperienceId) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEmpowerContext();
        onClose();
        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: pledgedExperienceId, quantity: 1 }],
        });
    };

    const handleBrowse = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEmpowerContext();
        onClose();
        navigation.navigate('CategorySelection',
            preferredRewardCategory ? { prefilterCategory: preferredRewardCategory } : undefined
        );
    };

    return (
        <BaseModal visible={visible} onClose={onClose} title="Gift an Experience">
            <Text style={styles.subtitle}>
                Celebrate {userName}'s progress
            </Text>

            {/* Option 1: Buy pledged experience */}
            {experienceTitle && pledgedExperienceId && (
                <Button
                    variant="primary"
                    title={`Gift "${experienceTitle}"${experiencePrice != null ? `  €${experiencePrice}` : ''}`}
                    icon={<ShoppingBag size={18} color={Colors.white} />}
                    onPress={handleDirect}
                    style={styles.optionPrimary}
                    fullWidth
                />
            )}

            {/* Option 2: Browse */}
            <Button
                variant="secondary"
                title={
                    preferredRewardCategory && !experienceTitle
                        ? `Browse ${preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)} Experiences`
                        : 'Choose Another Experience'
                }
                icon={<Gift size={18} color={Colors.primary} />}
                onPress={handleBrowse}
                style={styles.optionSecondary}
                fullWidth
            />

            {/* Cancel */}
            <Button
                variant="ghost"
                title="Cancel"
                onPress={onClose}
                style={styles.cancelButton}
                fullWidth
            />
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
        color: Colors.whiteAlpha80,
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

export default EmpowerChoiceModal;
