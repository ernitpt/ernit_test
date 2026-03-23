import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing } from 'react-native';
import { Gift, X, Sparkles, ShoppingBag } from 'lucide-react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import Button from './Button';

// ─── Inline CTA (shown post-session in DetailedGoalCard) ──────────────────

interface InlineCTAProps {
    experience: {
        title: string;
        coverImageUrl?: string;
        price?: number;
    };
    statMessage: string;
    statSource?: string | null;
    onGift: () => void;
    onDismiss: () => void;
}

export const InlineExperienceCTA: React.FC<InlineCTAProps> = ({
    experience,
    statMessage,
    statSource,
    onGift,
    onDismiss,
}) => {
    const colors = useColors();
    const inlineStyles = useMemo(() => createInlineStyles(colors), [colors]);

    const slideAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(slideAnim, {
            toValue: 1,
            duration: 400,
            delay: 2000, // 2s delay after celebration
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
        }).start();
    }, []);

    return (
        <Animated.View
            style={[
                inlineStyles.container,
                {
                    opacity: slideAnim,
                    transform: [
                        { translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                    ],
                },
            ]}
        >
            {/* Dismiss */}
            <TouchableOpacity style={inlineStyles.dismiss} onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Stat message */}
            <View style={inlineStyles.statArea}>
                <Sparkles size={14} color={colors.accent} />
                <Text style={inlineStyles.statText}>{statMessage}</Text>
            </View>
            {statSource && (
                <Text style={inlineStyles.statSource}>— {statSource}</Text>
            )}

            {/* Experience preview */}
            <View style={inlineStyles.experienceRow}>
                {experience.coverImageUrl ? (
                    <Image source={{ uri: experience.coverImageUrl }} style={inlineStyles.thumb} />
                ) : (
                    <View style={[inlineStyles.thumb, inlineStyles.thumbPlaceholder]}>
                        <Gift size={16} color={colors.textMuted} />
                    </View>
                )}
                <View style={inlineStyles.experienceInfo}>
                    <Text style={inlineStyles.experienceTitle} numberOfLines={1}>{experience.title}</Text>
                    {experience.price != null && experience.price > 0 && (
                        <Text style={inlineStyles.experiencePrice}>€{experience.price}</Text>
                    )}
                </View>
            </View>

            {/* CTA button */}
            <Button
                variant="primary"
                title="Buy This Experience"
                icon={<ShoppingBag size={16} color={colors.white} />}
                onPress={onGift}
                style={inlineStyles.giftButton}
                fullWidth
            />

            <Button
                variant="ghost"
                title="Maybe Later"
                onPress={onDismiss}
                style={inlineStyles.later}
                fullWidth
            />
        </Animated.View>
    );
};

const createInlineStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        container: {
            backgroundColor: colors.white,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            marginTop: Spacing.lg,
            borderWidth: 1,
            borderColor: colors.primaryBorder,
            shadowColor: colors.black,
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
        },
        dismiss: {
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1,
            padding: Spacing.xs,
        },
        statArea: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: Spacing.xs,
            marginBottom: Spacing.xs,
            paddingRight: Spacing.xxl,
        },
        statText: {
            flex: 1,
            ...Typography.small,
            fontWeight: '600',
            color: colors.textPrimary,
            lineHeight: 20,
        },
        statSource: {
            ...Typography.tiny,
            color: colors.textMuted,
            marginBottom: Spacing.md,
            marginLeft: 20,
            fontStyle: 'italic',
        },
        experienceRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: BorderRadius.sm,
            padding: Spacing.sm,
            marginBottom: Spacing.md,
        },
        thumb: {
            width: 40,
            height: 40,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.border,
        },
        thumbPlaceholder: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        experienceInfo: {
            flex: 1,
        },
        experienceTitle: {
            ...Typography.small,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        experiencePrice: {
            ...Typography.caption,
            fontWeight: '700',
            color: colors.primary,
            marginTop: 1,
        },
        giftButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Spacing.xs,
            backgroundColor: colors.secondary,
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.sm,
        },
        giftButtonText: {
            color: colors.white,
            ...Typography.body,
            fontWeight: '700',
        },
        later: {
            alignItems: 'center',
            paddingTop: Spacing.sm,
        },
        laterText: {
            ...Typography.caption,
            color: colors.textMuted,
            fontWeight: '500',
        },
    });
