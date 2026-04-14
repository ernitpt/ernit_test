/**
 * DiscoveryQuizModal
 *
 * Post-session binary-preference quiz shown during the Discovery Engine's
 * early-goal phase (0–15% completion). Presents one question at a time and
 * builds a preference profile used by DiscoveryService for experience matching.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
    Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import * as Haptics from 'expo-haptics';
import { MotiView, AnimatePresence } from 'moti';
import { BaseModal } from './BaseModal';
import Button from './Button';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuizCategory = 'adventure' | 'wellness' | 'creative';

interface QuizOption {
    value: string;
    label: string;
    emoji: string;
}

interface QuizQuestion {
    id: string;
    text: string;
    options: [QuizOption, QuizOption];
}

export interface DiscoveryQuizModalProps {
    visible: boolean;
    onClose: () => void;
    onAnswer: (questionId: string, answer: string) => void;
    questionsCompleted: number; // 0–5, determines which question to show next
    category: QuizCategory;
}

// ─── Questions Bank ───────────────────────────────────────────────────────────

function getQuestions(t: TFunction): Record<QuizCategory, QuizQuestion[]> {
    return {
        adventure: [
            {
                id: 'adv_1',
                text: t('modals.discoveryQuiz.adventure.adv_1.text'),
                options: [
                    { value: 'beach', label: t('modals.discoveryQuiz.adventure.adv_1.opt0'), emoji: '🏖️' },
                    { value: 'mountains', label: t('modals.discoveryQuiz.adventure.adv_1.opt1'), emoji: '⛰️' },
                ],
            },
            {
                id: 'adv_2',
                text: t('modals.discoveryQuiz.adventure.adv_2.text'),
                options: [
                    { value: 'morning', label: t('modals.discoveryQuiz.adventure.adv_2.opt0'), emoji: '🌅' },
                    { value: 'evening', label: t('modals.discoveryQuiz.adventure.adv_2.opt1'), emoji: '🌙' },
                ],
            },
            {
                id: 'adv_3',
                text: t('modals.discoveryQuiz.adventure.adv_3.text'),
                options: [
                    { value: 'solo', label: t('modals.discoveryQuiz.adventure.adv_3.opt0'), emoji: '🦅' },
                    { value: 'group', label: t('modals.discoveryQuiz.adventure.adv_3.opt1'), emoji: '🤝' },
                ],
            },
            {
                id: 'adv_4',
                text: t('modals.discoveryQuiz.adventure.adv_4.text'),
                options: [
                    { value: 'water', label: t('modals.discoveryQuiz.adventure.adv_4.opt0'), emoji: '🌊' },
                    { value: 'sky', label: t('modals.discoveryQuiz.adventure.adv_4.opt1'), emoji: '🪂' },
                ],
            },
            {
                id: 'adv_5',
                text: t('modals.discoveryQuiz.adventure.adv_5.text'),
                options: [
                    { value: 'gentle', label: t('modals.discoveryQuiz.adventure.adv_5.opt0'), emoji: '🍃' },
                    { value: 'adrenaline', label: t('modals.discoveryQuiz.adventure.adv_5.opt1'), emoji: '⚡' },
                ],
            },
        ],

        wellness: [
            {
                id: 'wel_1',
                text: t('modals.discoveryQuiz.wellness.wel_1.text'),
                options: [
                    { value: 'indoor', label: t('modals.discoveryQuiz.wellness.wel_1.opt0'), emoji: '🏠' },
                    { value: 'outdoor', label: t('modals.discoveryQuiz.wellness.wel_1.opt1'), emoji: '🌿' },
                ],
            },
            {
                id: 'wel_2',
                text: t('modals.discoveryQuiz.wellness.wel_2.text'),
                options: [
                    { value: 'active', label: t('modals.discoveryQuiz.wellness.wel_2.opt0'), emoji: '🏃' },
                    { value: 'restorative', label: t('modals.discoveryQuiz.wellness.wel_2.opt1'), emoji: '🛁' },
                ],
            },
            {
                id: 'wel_3',
                text: t('modals.discoveryQuiz.wellness.wel_3.text'),
                options: [
                    { value: 'silence', label: t('modals.discoveryQuiz.wellness.wel_3.opt0'), emoji: '🤫' },
                    { value: 'music', label: t('modals.discoveryQuiz.wellness.wel_3.opt1'), emoji: '🎵' },
                ],
            },
            {
                id: 'wel_4',
                text: t('modals.discoveryQuiz.wellness.wel_4.text'),
                options: [
                    { value: 'heat', label: t('modals.discoveryQuiz.wellness.wel_4.opt0'), emoji: '🔥' },
                    { value: 'cold', label: t('modals.discoveryQuiz.wellness.wel_4.opt1'), emoji: '❄️' },
                ],
            },
            {
                id: 'wel_5',
                text: t('modals.discoveryQuiz.wellness.wel_5.text'),
                options: [
                    { value: 'treatment', label: t('modals.discoveryQuiz.wellness.wel_5.opt0'), emoji: '💆' },
                    { value: 'self_guided', label: t('modals.discoveryQuiz.wellness.wel_5.opt1'), emoji: '🧘' },
                ],
            },
        ],

        creative: [
            {
                id: 'cre_1',
                text: t('modals.discoveryQuiz.creative.cre_1.text'),
                options: [
                    { value: 'hands_on', label: t('modals.discoveryQuiz.creative.cre_1.opt0'), emoji: '🖐️' },
                    { value: 'observing', label: t('modals.discoveryQuiz.creative.cre_1.opt1'), emoji: '👁️' },
                ],
            },
            {
                id: 'cre_2',
                text: t('modals.discoveryQuiz.creative.cre_2.text'),
                options: [
                    { value: 'solo', label: t('modals.discoveryQuiz.creative.cre_2.opt0'), emoji: '🎨' },
                    { value: 'collaborative', label: t('modals.discoveryQuiz.creative.cre_2.opt1'), emoji: '🤝' },
                ],
            },
            {
                id: 'cre_3',
                text: t('modals.discoveryQuiz.creative.cre_3.text'),
                options: [
                    { value: 'traditional', label: t('modals.discoveryQuiz.creative.cre_3.opt0'), emoji: '🏺' },
                    { value: 'modern', label: t('modals.discoveryQuiz.creative.cre_3.opt1'), emoji: '🚀' },
                ],
            },
            {
                id: 'cre_4',
                text: t('modals.discoveryQuiz.creative.cre_4.text'),
                options: [
                    { value: 'structured', label: t('modals.discoveryQuiz.creative.cre_4.opt0'), emoji: '📐' },
                    { value: 'free', label: t('modals.discoveryQuiz.creative.cre_4.opt1'), emoji: '🌀' },
                ],
            },
            {
                id: 'cre_5',
                text: t('modals.discoveryQuiz.creative.cre_5.text'),
                options: [
                    { value: 'visual', label: t('modals.discoveryQuiz.creative.cre_5.opt0'), emoji: '🖼️' },
                    { value: 'performing', label: t('modals.discoveryQuiz.creative.cre_5.opt1'), emoji: '🎭' },
                ],
            },
        ],
    };
}

// ─── Option Card ──────────────────────────────────────────────────────────────

interface OptionCardProps {
    option: QuizOption;
    onSelect: () => void;
    delay: number;
}

const OptionCard: React.FC<OptionCardProps> = ({ option, onSelect, delay }) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.94,
            damping: 12,
            stiffness: 200,
            mass: 0.8,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePressOut = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            damping: 12,
            stiffness: 200,
            mass: 0.8,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePress = useCallback(() => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onSelect();
    }, [onSelect]);

    return (
        <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 280, delay }}
            style={styles.optionCardWrapper}
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1 }}>
                <TouchableOpacity
                    onPress={handlePress}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    activeOpacity={1}
                    style={styles.optionCard}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                >
                    <Text style={styles.optionEmoji}>{option.emoji}</Text>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                </TouchableOpacity>
            </Animated.View>
        </MotiView>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DiscoveryQuizModal: React.FC<DiscoveryQuizModalProps> = ({
    visible,
    onClose,
    onAnswer,
    questionsCompleted,
    category,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const questions = useMemo(() => getQuestions(t)[category], [t, category]);
    // Clamp index within bounds — if all 5 done, nothing to show
    const questionIndex = Math.min(questionsCompleted, questions.length - 1);
    const currentQuestion = questions[questionIndex];

    if (questionsCompleted >= questions.length) return null;

    // ─── Category accent colors (distinct per category for playfulness) ──────
    const CATEGORY_ACCENTS: Record<QuizCategory, { bg: string; border: string; text: string }> = {
        adventure: {
            bg: colors.warningLighter,
            border: colors.warningBorder,
            text: colors.warningMedium,
        },
        wellness: {
            bg: colors.primaryLight,
            border: colors.primaryBorder,
            text: colors.primaryDark,
        },
        creative: {
            bg: colors.pinkLighter,
            border: colors.pinkLight,
            text: colors.pink,
        },
    };

    const accent = CATEGORY_ACCENTS[category];

    const isFirstQuestion = questionsCompleted === 0;
    const titleText = isFirstQuestion ? t('modals.discoveryQuiz.firstQuestion') : t('modals.discoveryQuiz.nextQuestion');

    const handleSelect = useCallback((answer: string) => {
        onAnswer(currentQuestion.id, answer);
        onClose();
    }, [onAnswer, currentQuestion.id, onClose]);

    const handleSkip = useCallback(() => {
        if (Platform.OS !== 'web') {
            Haptics.selectionAsync();
        }
        onClose();
    }, [onClose]);

    return (
        <BaseModal
            visible={visible}
            onClose={onClose}
            variant="center"
        >
            <AnimatePresence exitBeforeEnter>
                {visible && (
                    <MotiView
                        key={currentQuestion.id}
                        from={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: 'timing', duration: 220 }}
                    >
                        {/* Category badge */}
                        <View style={styles.badgeRow}>
                            <View style={[styles.categoryBadge, { backgroundColor: accent.bg, borderColor: accent.border }]}>
                                <Text style={[styles.categoryBadgeText, { color: accent.text }]}>
                                    {category.charAt(0).toUpperCase() + category.slice(1)}
                                </Text>
                            </View>
                            {/* Progress dots */}
                            <View style={styles.progressDots}>
                                {questions.map((_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.dot,
                                            i < questionsCompleted && styles.dotCompleted,
                                            i === questionIndex && styles.dotActive,
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* Title */}
                        <MotiView
                            from={{ opacity: 0, translateY: -8 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 240, delay: 60 }}
                        >
                            <Text style={styles.title}>{titleText}</Text>
                        </MotiView>

                        {/* Question */}
                        <MotiView
                            from={{ opacity: 0, translateY: -6 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 240, delay: 120 }}
                        >
                            <Text style={styles.questionText}>{currentQuestion.text}</Text>
                        </MotiView>

                        {/* Option cards */}
                        <View style={styles.optionsRow}>
                            <OptionCard
                                option={currentQuestion.options[0]}
                                onSelect={() => handleSelect(currentQuestion.options[0].value)}
                                delay={180}
                            />
                            <OptionCard
                                option={currentQuestion.options[1]}
                                onSelect={() => handleSelect(currentQuestion.options[1].value)}
                                delay={240}
                            />
                        </View>

                        {/* Skip */}
                        <MotiView
                            from={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ type: 'timing', duration: 240, delay: 320 }}
                            style={styles.skipRow}
                        >
                            <Button
                                variant="ghost"
                                size="sm"
                                title={t('modals.discoveryQuiz.skipForNow')}
                                onPress={handleSkip}
                            />
                        </MotiView>
                    </MotiView>
                )}
            </AnimatePresence>
        </BaseModal>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        // ── Layout ──────────────────────────────────────────────────────────────
        badgeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: Spacing.lg,
        },
        categoryBadge: {
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.xs,
            borderRadius: BorderRadius.pill,
            borderWidth: 1,
        },
        categoryBadgeText: {
            ...Typography.tiny,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
        },
        progressDots: {
            flexDirection: 'row',
            gap: Spacing.xs,
            alignItems: 'center',
        },
        dot: {
            width: 6,
            height: 6,
            borderRadius: BorderRadius.circle,
            backgroundColor: colors.border,
        },
        dotCompleted: {
            backgroundColor: colors.secondary,
        },
        dotActive: {
            width: 10,
            height: 10,
            backgroundColor: colors.primary,
            ...Shadows.colored(colors.primary),
        },

        // ── Text ────────────────────────────────────────────────────────────────
        title: {
            ...Typography.subheading,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: Spacing.sm,
        },
        questionText: {
            ...Typography.heading2,
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: Spacing.xxl,
        },

        // ── Option cards ────────────────────────────────────────────────────────
        optionsRow: {
            flexDirection: 'row',
            gap: Spacing.md,
            marginBottom: Spacing.xl,
        },
        optionCardWrapper: {
            flex: 1,
        },
        optionCard: {
            backgroundColor: colors.surface,
            borderRadius: BorderRadius.xl,
            borderWidth: 1.5,
            borderColor: colors.border,
            paddingVertical: Spacing.xl,
            paddingHorizontal: Spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            gap: Spacing.sm,
            minHeight: 110,
            ...Shadows.sm,
        },
        optionEmoji: {
            fontSize: Typography.emojiMedium.fontSize,
            lineHeight: 44,
        },
        optionLabel: {
            ...Typography.smallBold,
            color: colors.textPrimary,
            textAlign: 'center',
        },

        // ── Skip ─────────────────────────────────────────────────────────────────
        skipRow: {
            alignItems: 'center',
            marginBottom: Spacing.xs,
        },
    });

export default React.memo(DiscoveryQuizModal);
