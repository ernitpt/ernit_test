import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing } from 'react-native';
import { Gift, X, Sparkles, ShoppingBag } from 'lucide-react-native';
import Colors from '../config/colors';

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
                <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Stat message */}
            <View style={inlineStyles.statArea}>
                <Sparkles size={14} color={Colors.accent} />
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
                        <Gift size={16} color={Colors.textMuted} />
                    </View>
                )}
                <View style={inlineStyles.experienceInfo}>
                    <Text style={inlineStyles.experienceTitle} numberOfLines={1}>{experience.title}</Text>
                    {experience.price != null && experience.price > 0 && (
                        <Text style={inlineStyles.experiencePrice}>${experience.price}</Text>
                    )}
                </View>
            </View>

            {/* CTA button */}
            <TouchableOpacity style={inlineStyles.giftButton} onPress={onGift} activeOpacity={0.8}>
                <ShoppingBag size={16} color="#fff" />
                <Text style={inlineStyles.giftButtonText}>Buy This Experience</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onDismiss} style={inlineStyles.later}>
                <Text style={inlineStyles.laterText}>Maybe Later</Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

const inlineStyles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginTop: 16,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
        shadowColor: '#000',
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
        padding: 4,
    },
    statArea: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginBottom: 4,
        paddingRight: 24,
    },
    statText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        lineHeight: 20,
    },
    statSource: {
        fontSize: 11,
        color: Colors.textMuted,
        marginBottom: 12,
        marginLeft: 20,
        fontStyle: 'italic',
    },
    experienceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 10,
        marginBottom: 12,
    },
    thumb: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: Colors.border,
    },
    thumbPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    experienceInfo: {
        flex: 1,
    },
    experienceTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    experiencePrice: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.primary,
        marginTop: 1,
    },
    giftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.secondary,
        paddingVertical: 12,
        borderRadius: 10,
    },
    giftButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    later: {
        alignItems: 'center',
        paddingTop: 10,
    },
    laterText: {
        fontSize: 13,
        color: Colors.textMuted,
        fontWeight: '500',
    },
});

