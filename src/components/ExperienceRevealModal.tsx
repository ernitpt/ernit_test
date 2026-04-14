import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Animated,
    TouchableOpacity,
    Dimensions,
    TouchableWithoutFeedback,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Button from './Button';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { vh } from '../utils/responsive';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_IMAGE_HEIGHT = vh(200);

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevealExperience {
    experienceId: string;
    title: string;
    subtitle: string;
    description: string;
    category: string;
    price: number;
    coverImageUrl: string;
    imageUrl: string[];
    partnerId: string;
    location?: string;
}

interface ExperienceRevealModalProps {
    visible: boolean;
    experience: RevealExperience | null;
    onClose: () => void;
    /** Navigates to ExperienceCheckout */
    onClaim: () => void;
    /** Navigates to experience browser */
    onBrowseOthers: () => void;
    /** Percentage of goal reached (shown in the reveal headline) */
    progressPct?: number;
}

// ─── Animation timing constants ───────────────────────────────────────────────

const BACKDROP_DURATION  = 300;  // ms — backdrop fade-in
const HEADLINE_DELAY     = 200;  // ms — after backdrop starts
const CARD_DELAY         = 1500; // ms — dramatic pause before card slides in
const CTA_DELAY          = 400;  // ms — after card spring settles

// ─── Component ────────────────────────────────────────────────────────────────

const ExperienceRevealModal: React.FC<ExperienceRevealModalProps> = ({
    visible,
    experience,
    onClose,
    onClaim,
    onBrowseOthers,
    progressPct,
}) => {
    // Controls React Native Modal visibility (keeps it mounted during exit animation)
    const [modalVisible, setModalVisible] = useState(false);
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    // ── Mounted guard (prevents setState/navigation after unmount) ────────────
    const isMounted = useRef(true);
    useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    // ── Animated values ───────────────────────────────────────────────────────
    const backdropOpacity  = useRef(new Animated.Value(0)).current;
    const headlineOpacity  = useRef(new Animated.Value(0)).current;
    const headlineScale    = useRef(new Animated.Value(0.7)).current;
    const headlineTranslY  = useRef(new Animated.Value(0)).current; // slides UP when card arrives
    const cardTranslateY   = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const ctaOpacity       = useRef(new Animated.Value(0)).current;

    // ── Animate IN ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (visible && experience) {
            setModalVisible(true);

            // Reset all values
            backdropOpacity.setValue(0);
            headlineOpacity.setValue(0);
            headlineScale.setValue(0.7);
            headlineTranslY.setValue(0);
            cardTranslateY.setValue(SCREEN_HEIGHT);
            ctaOpacity.setValue(0);

            // 1. Backdrop fade-in
            Animated.timing(backdropOpacity, {
                toValue: 1,
                duration: BACKDROP_DURATION,
                useNativeDriver: true,
            }).start();

            // 2. Headline pops in with spring (shortly after backdrop starts)
            Animated.sequence([
                Animated.delay(HEADLINE_DELAY),
                Animated.parallel([
                    Animated.spring(headlineScale, {
                        toValue: 1,
                        tension: 80,
                        friction: 7,
                        useNativeDriver: true,
                    }),
                    Animated.timing(headlineOpacity, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ]),
            ]).start();

            // 3. After dramatic pause: headline slides up, card slides in from bottom
            Animated.sequence([
                Animated.delay(CARD_DELAY),
                Animated.parallel([
                    // Headline floats upward
                    Animated.spring(headlineTranslY, {
                        toValue: -vh(60),
                        tension: 50,
                        friction: 10,
                        useNativeDriver: true,
                    }),
                    // Card springs in from bottom
                    Animated.spring(cardTranslateY, {
                        toValue: 0,
                        tension: 55,
                        friction: 15,
                        useNativeDriver: true,
                    }),
                ]),
                // 4. CTAs fade in once card settles
                Animated.delay(CTA_DELAY),
                Animated.timing(ctaOpacity, {
                    toValue: 1,
                    duration: 350,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Animate OUT ───────────────────────────────────────────────────────────
    const animateClose = useCallback(() => {
        // Stop any running open animations to prevent conflicts
        backdropOpacity.stopAnimation();
        headlineOpacity.stopAnimation();
        headlineScale.stopAnimation();
        headlineTranslY.stopAnimation();
        cardTranslateY.stopAnimation();
        ctaOpacity.stopAnimation();

        Animated.parallel([
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 280,
                useNativeDriver: true,
            }),
            Animated.timing(cardTranslateY, {
                toValue: SCREEN_HEIGHT,
                duration: 320,
                useNativeDriver: true,
            }),
            Animated.timing(headlineOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setModalVisible(false);
            onClose();
        });
    }, [onClose, backdropOpacity, cardTranslateY, headlineOpacity]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleClaim = useCallback(() => {
        animateClose();
        // Small delay so the modal starts closing before nav transition
        setTimeout(() => { if (!isMounted.current) return; onClaim(); }, 150);
    }, [animateClose, onClaim]);

    const handleBrowse = useCallback(() => {
        animateClose();
        setTimeout(() => { if (!isMounted.current) return; onBrowseOthers(); }, 150);
    }, [animateClose, onBrowseOthers]);

    // ── Guard ─────────────────────────────────────────────────────────────────
    if (!experience) return null;

    const heroUri = experience.coverImageUrl ||
        (Array.isArray(experience.imageUrl) && experience.imageUrl[0]) ||
        '';

    const formattedPrice = `\u20AC${experience.price}`;

    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={animateClose}
        >
            {/* ── Blurred backdrop ──────────────────────────────────────────── */}
            <TouchableWithoutFeedback onPress={animateClose} accessibilityLabel={t('modals.experienceReveal.dismissReveal')}>
                <View style={StyleSheet.absoluteFill}>
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
                        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        <LinearGradient
                            colors={[Colors.revealGradientStart, Colors.revealGradientEnd]}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0.3, y: 0 }}
                            end={{ x: 0.7, y: 1 }}
                        />
                    </Animated.View>
                </View>
            </TouchableWithoutFeedback>

            {/* ── Headline — fades in first, then slides up ─────────────────── */}
            <Animated.View
                style={[
                    styles.headlineWrapper,
                    {
                        opacity: headlineOpacity,
                        transform: [
                            { scale: headlineScale },
                            { translateY: headlineTranslY },
                        ],
                    },
                ]}
                pointerEvents="none"
            >
                <Text style={styles.headlineEmoji}>🎉</Text>
                <Text style={styles.headlineText}>{t('modals.experienceReveal.revealedHeadline')}</Text>
                <Text style={styles.headlineSubText}>{t('modals.experienceReveal.progressReached', { pct: progressPct ?? 75 })}</Text>
            </Animated.View>

            {/* ── Experience card — springs in from bottom ───────────────────── */}
            <Animated.View
                style={[
                    styles.card,
                    { transform: [{ translateY: cardTranslateY }] },
                ]}
                pointerEvents="box-none"
            >
                {/* Prevent backdrop tap from closing through the card */}
                <TouchableWithoutFeedback>
                    <View>
                        {/* ── Hero image ────────────────────────────────────────── */}
                        <View style={styles.heroContainer}>
                            <Image
                                source={{ uri: heroUri }}
                                style={styles.heroImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={300}
                                accessibilityLabel={experience.title}
                            />

                            {/* Gradient over image bottom */}
                            <LinearGradient
                                colors={['transparent', Colors.overlayOnImage]}
                                style={styles.heroGradient}
                                pointerEvents="none"
                            />

                            {/* Price badge — bottom-left, same pattern as ExperienceDetailModal */}
                            <View style={styles.priceBadge}>
                                <Text style={styles.priceText}>{formattedPrice}</Text>
                                <Text style={styles.priceLabel}>{t('modals.experienceReveal.perPerson')}</Text>
                            </View>

                            {/* Category chip — top-right */}
                            <View style={styles.categoryBadge}>
                                <Text style={styles.categoryText}>
                                    {experience.category.charAt(0).toUpperCase() + experience.category.slice(1)}
                                </Text>
                            </View>
                        </View>

                        {/* ── Text content ──────────────────────────────────────── */}
                        <View style={styles.textContent}>
                            <Text style={styles.title} numberOfLines={2}>{experience.title}</Text>
                            {!!experience.subtitle && (
                                <Text style={styles.subtitle} numberOfLines={1}>{experience.subtitle}</Text>
                            )}
                            {!!experience.location && (
                                <Text style={styles.location} numberOfLines={1}>
                                    📍 {experience.location}
                                </Text>
                            )}
                            <Text style={styles.description} numberOfLines={3}>
                                {experience.description}
                            </Text>
                        </View>

                        {/* ── CTAs ──────────────────────────────────────────────── */}
                        <Animated.View style={[styles.ctaContainer, { opacity: ctaOpacity }]}>
                            <Button
                                title={t('modals.experienceReveal.claimButton', { price: formattedPrice })}
                                variant="primary"
                                onPress={handleClaim}
                                style={styles.primaryButton}
                            />
                            <TouchableOpacity
                                onPress={handleBrowse}
                                style={styles.browseLink}
                                accessibilityRole="button"
                                accessibilityLabel={t('modals.experienceReveal.browseOthersA11y')}
                                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                            >
                                <Text style={styles.browseLinkText}>{t('modals.experienceReveal.browseOthers')}</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>
                </TouchableWithoutFeedback>
            </Animated.View>
        </Modal>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        // ── Headline ──────────────────────────────────────────────────────────────
        headlineWrapper: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: Spacing.xxl,
        },
        headlineEmoji: {
            fontSize: Typography.emojiLarge.fontSize,
            lineHeight: 72,
            textAlign: 'center',
            marginBottom: Spacing.md,
        },
        headlineText: {
            ...Typography.heading1,
            color: colors.white,
            textAlign: 'center',
            marginBottom: Spacing.sm,
        },
        headlineSubText: {
            ...Typography.body,
            color: colors.whiteAlpha80,
            textAlign: 'center',
        },

        // ── Card ──────────────────────────────────────────────────────────────────
        card: {
            position: 'absolute',
            bottom: 0,
            left: Spacing.lg,
            right: Spacing.lg,
            backgroundColor: colors.white,
            borderRadius: BorderRadius.xxl,
            overflow: 'hidden',
            marginBottom: Spacing.xl,
            ...Shadows.lg,
        },

        // ── Hero image ────────────────────────────────────────────────────────────
        heroContainer: {
            height: HERO_IMAGE_HEIGHT,
            width: '100%',
            overflow: 'hidden',
            borderTopLeftRadius: BorderRadius.xxl,
            borderTopRightRadius: BorderRadius.xxl,
        },
        heroImage: {
            width: '100%',
            height: HERO_IMAGE_HEIGHT,
        },
        heroGradient: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 90,
        },
        priceBadge: {
            position: 'absolute',
            bottom: Spacing.md,
            left: Spacing.lg,
            backgroundColor: colors.white,
            borderRadius: BorderRadius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.xs,
            ...Shadows.md,
        },
        priceText: {
            ...Typography.heading3,
            color: colors.primary,
        },
        priceLabel: {
            ...Typography.tiny,
            color: colors.textMuted,
        },
        categoryBadge: {
            position: 'absolute',
            top: Spacing.md,
            right: Spacing.md,
            backgroundColor: colors.primaryOverlay,
            borderRadius: BorderRadius.pill,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.xxs,
        },
        categoryText: {
            ...Typography.captionBold,
            color: colors.white,
        },

        // ── Text content ──────────────────────────────────────────────────────────
        textContent: {
            paddingHorizontal: Spacing.xl,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.md,
            gap: Spacing.xs,
        },
        title: {
            ...Typography.heading2,
            color: colors.textPrimary,
        },
        subtitle: {
            ...Typography.body,
            color: colors.textSecondary,
        },
        location: {
            ...Typography.small,
            color: colors.textMuted,
            marginTop: Spacing.xxs,
        },
        description: {
            ...Typography.body,
            color: colors.gray600,
            lineHeight: 22,
            marginTop: Spacing.xs,
        },

        // ── CTAs ──────────────────────────────────────────────────────────────────
        ctaContainer: {
            paddingHorizontal: Spacing.xl,
            paddingBottom: Spacing.xxl,
            paddingTop: Spacing.sm,
            gap: Spacing.md,
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.white,
        },
        primaryButton: {
            width: '100%',
        },
        browseLink: {
            paddingVertical: Spacing.xs,
        },
        browseLinkText: {
            ...Typography.small,
            color: colors.textSecondary,
            textDecorationLine: 'underline',
        },
    });

export default React.memo(ExperienceRevealModal);
