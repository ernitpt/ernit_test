import React, { useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    BackHandler,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { BaseModal } from './BaseModal';
import Button from './Button';

interface HowItWorksModalProps {
    visible: boolean;
    onClose: () => void;
}

function HowItWorksModal({ visible, onClose }: HowItWorksModalProps) {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    // Android hardware back button
    useEffect(() => {
        if (Platform.OS === 'web') return;
        if (!visible) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => subscription.remove();
    }, [visible, onClose]);

    return (
        <BaseModal visible={visible} onClose={onClose} title={t('modals.howItWorks.title')} variant="bottom" noPadding>
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Example Header */}
                <View style={styles.exampleHeader}>
                    <Text style={styles.exampleIcon}>🧗‍♀️</Text>
                    <Text style={styles.exampleTitle}>
                        {t('modals.howItWorks.exampleTitle')}
                    </Text>
                </View>

                {/* Step 1 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>1</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>{t('modals.howItWorks.step1Title')}</Text>
                        <Text style={styles.stepDescription}>
                            {t('modals.howItWorks.step1Description')}
                        </Text>
                    </View>
                </View>

                {/* Step 2 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>2</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>{t('modals.howItWorks.step2Title')}</Text>
                        <Text style={styles.stepDescription}>
                            {t('modals.howItWorks.step2Description')}
                        </Text>
                    </View>
                </View>

                {/* Step 3 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>3</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>{t('modals.howItWorks.step3Title')}</Text>
                        <Text style={styles.stepDescription}>
                            {t('modals.howItWorks.step3Description')}
                        </Text>
                    </View>
                </View>

                {/* Step 4 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>4</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>{t('modals.howItWorks.step4Title')}</Text>
                        <Text style={styles.stepDescription}>
                            {t('modals.howItWorks.step4Description')}
                        </Text>
                    </View>
                </View>

                {/* Call to Action */}
                <View style={styles.ctaContainer}>
                    <Text style={styles.ctaText}>
                        {t('modals.howItWorks.cta')}
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom Button */}
            <View style={styles.buttonContainer}>
                <Button
                    title={t('modals.howItWorks.close')}
                    onPress={onClose}
                    variant="primary"
                    size="lg"
                    fullWidth
                    gradient
                />
            </View>
        </BaseModal>
    );
}

export default React.memo(HowItWorksModal);

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        scrollView: {
            flex: 1,
        },
        scrollContent: {
            padding: Spacing.xl,
            paddingBottom: Spacing.sm,
        },
        exampleHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: Spacing.xxl,
            backgroundColor: colors.surface,
            padding: Spacing.lg,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        exampleIcon: {
            fontSize: Typography.display.fontSize,
            marginRight: Spacing.md,
        },
        exampleTitle: {
            ...Typography.subheading,
            color: colors.textPrimary,
            flex: 1,
        },
        step: {
            flexDirection: 'row',
            marginBottom: Spacing.xl,
        },
        stepNumber: {
            width: 36,
            height: 36,
            borderRadius: BorderRadius.circle,
            backgroundColor: colors.secondary,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: Spacing.lg,
            marginTop: Spacing.xxs,
        },
        stepNumberText: {
            color: colors.white,
            ...Typography.subheading,
            fontWeight: '700',
        },
        stepContent: {
            flex: 1,
        },
        stepTitle: {
            ...Typography.subheading,
            color: colors.textPrimary,
            marginBottom: Spacing.xs,
        },
        stepDescription: {
            ...Typography.body,
            color: colors.textSecondary,
            lineHeight: 21,
        },
        ctaContainer: {
            marginTop: Spacing.md,
            padding: Spacing.lg,
            backgroundColor: colors.infoLight,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.infoLight,
        },
        ctaText: {
            ...Typography.subheading,
            color: colors.secondary,
            textAlign: 'center',
        },
        buttonContainer: {
            padding: Spacing.xl,
            paddingTop: Spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.backgroundLight,
        },
    });
