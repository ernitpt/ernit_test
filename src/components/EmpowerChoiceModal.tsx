import React, { useMemo, useRef, useCallback } from 'react';
import {
    Text,
    StyleSheet,
    Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { ShoppingBag, Gift } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, ExperienceCategory } from '../types';
import { analyticsService } from '../services/AnalyticsService';
import { useApp } from '../context/AppContext';
import { Colors, useColors, Typography, Spacing, BorderRadius } from '../config';
import { BaseModal } from './BaseModal';
import Button from './Button';
import { formatCurrency } from '../utils/helpers';

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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const pendingRef = useRef(false);

    const setEmpowerContext = useCallback(() => {
        dispatch({
            type: 'SET_EMPOWER_CONTEXT',
            payload: { goalId, userId: goalUserId, userName },
        });
    }, [dispatch, goalId, goalUserId, userName]);

    const handleDirect = useCallback(() => {
        if (!pledgedExperienceId) return;
        if (pendingRef.current) return;
        pendingRef.current = true;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEmpowerContext();
        analyticsService.trackEvent('empower_started', 'social', {
          goalId,
          empowerPath: 'direct',
          experienceId: pledgedExperienceId,
        }, 'EmpowerChoiceModal');
        onClose();
        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: pledgedExperienceId, quantity: 1 }],
        });
        setTimeout(() => { pendingRef.current = false; }, 500);
    }, [pledgedExperienceId, setEmpowerContext, onClose, navigation]);

    const handleBrowse = () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEmpowerContext();
        analyticsService.trackEvent('empower_started', 'social', {
          goalId,
          empowerPath: 'browse',
        }, 'EmpowerChoiceModal');
        onClose();
        navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection', params: preferredRewardCategory ? { prefilterCategory: preferredRewardCategory } : undefined } });
    };

    return (
        <BaseModal visible={visible} onClose={onClose} title={t('modals.empowerChoice.title')}>
            <Text style={styles.subtitle}>
                {t('modals.empowerChoice.subtitle', { name: userName })}
            </Text>

            {/* Option 1: Buy pledged experience */}
            {experienceTitle && pledgedExperienceId && (
                <Button
                    variant="primary"
                    title={`${t('modals.empowerChoice.giftButton', { title: experienceTitle })}${experiencePrice != null ? `  ${formatCurrency(experiencePrice)}` : ''}`}
                    icon={<ShoppingBag size={18} color={colors.white} />}
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
                        ? t('modals.empowerChoice.browseCategory', { category: preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1) })
                        : t('modals.empowerChoice.browseOther')
                }
                icon={<Gift size={18} color={colors.primary} />}
                onPress={handleBrowse}
                style={styles.optionSecondary}
                fullWidth
            />

            {/* Cancel */}
            <Button
                variant="ghost"
                title={t('modals.empowerChoice.cancel')}
                onPress={onClose}
                style={styles.cancelButton}
                fullWidth
            />
        </BaseModal>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
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
        optionSecondary: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            backgroundColor: colors.primarySurface,
            paddingVertical: Spacing.lg,
            paddingHorizontal: Spacing.cardPadding,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.primaryBorder,
            marginBottom: Spacing.sm,
        },
        optionSecondaryText: {
            ...Typography.bodyBold,
            color: colors.primary,
        },
        cancelButton: {
            alignItems: 'center',
            paddingVertical: Spacing.sm,
        },
        cancelText: {
            ...Typography.small,
            color: colors.textMuted,
        },
    });

export default React.memo(EmpowerChoiceModal);
