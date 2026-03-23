import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
} from 'react-native';
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

export default function HowItWorksModal({ visible, onClose }: HowItWorksModalProps) {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <BaseModal visible={visible} onClose={onClose} title="How Ernit Works" variant="bottom" noPadding>
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Example Header */}
                <View style={styles.exampleHeader}>
                    <Text style={styles.exampleIcon}>🧗‍♀️</Text>
                    <Text style={styles.exampleTitle}>
                        Example: Sarah's Rock Climbing Gift
                    </Text>
                </View>

                {/* Step 1 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>1</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Mike buys the experience</Text>
                        <Text style={styles.stepDescription}>
                            Mike chooses a rock climbing session for Sarah and purchases it as a gift. Sarah will know what the gift is once she completes her goal.
                        </Text>
                    </View>
                </View>

                {/* Step 2 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>2</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Sarah sets a goal</Text>
                        <Text style={styles.stepDescription}>
                            Sarah receives a code and sets her challenge: "Go to the gym 3x per week for 4 weeks"
                        </Text>
                    </View>
                </View>

                {/* Step 3 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>3</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Hints reveal clues</Text>
                        <Text style={styles.stepDescription}>
                            Each gym session, Sarah gets AI generated motivational hints.
                        </Text>
                    </View>
                </View>

                {/* Step 4 */}
                <View style={styles.step}>
                    <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>4</Text>
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Goal complete = Surprise unlocked!</Text>
                        <Text style={styles.stepDescription}>
                            Sarah completes her goal and unlocks the surprise: a rock climbing session! 🎉
                        </Text>
                    </View>
                </View>

                {/* Call to Action */}
                <View style={styles.ctaContainer}>
                    <Text style={styles.ctaText}>
                        Motivation meets reward. That's Ernit!
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom Button */}
            <View style={styles.buttonContainer}>
                <Button
                    title="Got it, let's start!"
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
