import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Platform,
    Modal,
    Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Clock, Check, Tag } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Button from './Button';
import { Experience, PartnerUser } from '../types';
import { partnerService } from '../services/PartnerService';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { vh } from '../utils/responsive';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_IMAGE_HEIGHT = vh(260);

interface ExperienceDetailModalProps {
    visible: boolean;
    experience: Experience | null;
    onClose: () => void;
    onSelect: (experience: Experience) => void;
    isSelected?: boolean;
}

const ExperienceDetailModal: React.FC<ExperienceDetailModalProps> = ({
    visible,
    experience,
    onClose,
    onSelect,
    isSelected = false,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [partner, setPartner] = useState<PartnerUser | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    // Animation values
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    useEffect(() => {
        if (!experience?.partnerId) { setPartner(null); return; }
        let cancelled = false;
        partnerService.getPartnerById(experience.partnerId)
            .then(p => { if (!cancelled) setPartner(p); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [experience?.partnerId]);

    // Animate in
    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            setActiveImageIndex(0);
            Animated.parallel([
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: 350,
                    useNativeDriver: true,
                }),
                Animated.spring(sheetTranslateY, {
                    toValue: 0,
                    tension: 45,
                    friction: 10,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    // Animate out
    const animateClose = useCallback(() => {
        Animated.parallel([
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 280,
                useNativeDriver: true,
            }),
            Animated.timing(sheetTranslateY, {
                toValue: SCREEN_HEIGHT,
                duration: 320,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setModalVisible(false);
            onClose();
        });
    }, [onClose]);

    if (!experience) return null;

    const images = Array.isArray(experience.imageUrl) && experience.imageUrl.length > 0
        ? experience.imageUrl
        : [experience.coverImageUrl];

    const handleScroll = (event: { nativeEvent: { layoutMeasurement: { width: number }; contentOffset: { x: number } } }) => {
        const slideWidth = event.nativeEvent.layoutMeasurement.width;
        const offset = event.nativeEvent.contentOffset.x;
        const index = Math.round(offset / slideWidth);
        setActiveImageIndex(index);
    };

    const handleSelect = () => {
        onSelect(experience);
        animateClose();
    };

    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            onRequestClose={animateClose}
        >
            {/* Backdrop */}
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={animateClose}
                accessibilityLabel="Dismiss modal"
                accessibilityRole="button"
            >
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlayLight }]} />
                </Animated.View>
            </TouchableOpacity>

            {/* Sheet */}
            <Animated.View
                style={[
                    styles.sheet,
                    { transform: [{ translateY: sheetTranslateY }] },
                ]}
                pointerEvents="box-none"
            >
                <TouchableOpacity activeOpacity={1}>
                    {/* Drag handle */}
                    <View style={styles.dragHandle}>
                        <View style={styles.dragHandlePill} />
                    </View>

                    <View style={styles.container}>
                        {/* Image carousel */}
                        <View style={styles.imageContainer}>
                            <ScrollView
                                ref={scrollRef}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                onScroll={handleScroll}
                                scrollEventThrottle={16}
                                decelerationRate="fast"
                            >
                                {images.map((url, index) => (
                                    <Image
                                        key={index}
                                        source={{ uri: url }}
                                        style={styles.heroImage}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                        transition={200}
                                    />
                                ))}
                            </ScrollView>

                            {/* Gradient overlay at bottom of image */}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.4)']}
                                style={styles.imageGradient}
                                pointerEvents="none"
                            />

                            {/* Price badge */}
                            <View style={styles.priceBadge}>
                                <Text style={styles.priceText}>
                                    {'\u20AC'}{experience.price}
                                </Text>
                                <Text style={styles.priceLabel}>per person</Text>
                            </View>

                            {/* Image dots */}
                            {images.length > 1 && (
                                <View style={styles.dotsContainer}>
                                    {images.map((_, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.dot,
                                                index === activeImageIndex ? styles.dotActive : styles.dotInactive,
                                            ]}
                                        />
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Content */}
                        <ScrollView
                            style={styles.contentScroll}
                            contentContainerStyle={styles.contentContainer}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                        >
                            {/* Title + subtitle */}
                            <Text style={styles.title}>{experience.title}</Text>
                            {experience.subtitle ? (
                                <Text style={styles.subtitle}>{experience.subtitle}</Text>
                            ) : null}

                            {/* Quick info chips */}
                            {(experience.duration || experience.location || experience.category) && (
                                <View style={styles.chipsRow}>
                                    {experience.duration ? (
                                        <View style={styles.chip}>
                                            <Clock size={14} color={colors.secondary} />
                                            <Text style={styles.chipText}>{experience.duration}</Text>
                                        </View>
                                    ) : null}
                                    {experience.location ? (
                                        <View style={styles.chip}>
                                            <MapPin size={14} color={colors.secondary} />
                                            <Text style={styles.chipText} numberOfLines={1}>
                                                {experience.location}
                                            </Text>
                                        </View>
                                    ) : null}
                                    <View style={[styles.chip, styles.categoryChip]}>
                                        <Tag size={14} color={colors.primary} />
                                        <Text style={[styles.chipText, styles.categoryChipText]}>
                                            {experience.category.charAt(0).toUpperCase() + experience.category.slice(1)}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Location + Map */}
                            {(experience.location || partner?.mapsUrl) && (
                                <View>
                                    <Text style={styles.sectionTitle}>Location</Text>
                                    {(partner?.address || experience.location) && (
                                        <View style={styles.addressRow}>
                                            <MapPin color={colors.textSecondary} size={16} />
                                            <Text style={styles.addressText}>
                                                {partner?.address || experience.location}
                                            </Text>
                                        </View>
                                    )}
                                    {partner?.mapsUrl && Platform.OS === 'web' && (
                                        <View style={styles.mapContainer}>
                                            <iframe
                                                src={partner.mapsUrl.includes('?') ? `${partner.mapsUrl}&layer=` : `${partner.mapsUrl}?layer=`}
                                                width="100%"
                                                height="100%"
                                                style={{ border: 0, borderRadius: BorderRadius.md }}
                                                allowFullScreen
                                                loading="lazy"
                                                title="Location"
                                            />
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Description */}
                            <Text style={styles.sectionTitle}>What to expect</Text>
                            <View style={styles.descriptionCard}>
                                <Text style={styles.descriptionText}>
                                    {experience.description.trim()}
                                </Text>
                            </View>
                        </ScrollView>

                        {/* Fixed bottom CTA */}
                        <View style={styles.ctaContainer}>
                            <Button
                                title={isSelected ? 'Selected' : 'Select this reward'}
                                variant={isSelected ? 'secondary' : 'primary'}
                                onPress={handleSelect}
                                icon={isSelected ? <Check size={18} color={colors.primary} /> : undefined}
                                style={styles.ctaButton}
                            />
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </Modal>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    overlay: {
        flex: 1,
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.white,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        maxHeight: '90%',
        ...Shadows.lg,
    },
    dragHandle: {
        alignItems: 'center',
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.xs,
    },
    dragHandlePill: {
        width: 36,
        height: 4,
        borderRadius: BorderRadius.xs,
        backgroundColor: colors.gray300,
    },
    container: {
        maxHeight: vh(700),
    },

    // Image carousel
    imageContainer: {
        height: MODAL_IMAGE_HEIGHT,
        width: '100%',
        overflow: 'hidden',
    },
    heroImage: {
        width: SCREEN_WIDTH,
        height: MODAL_IMAGE_HEIGHT,
    },
    imageGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 80,
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
    dotsContainer: {
        position: 'absolute',
        bottom: Spacing.md,
        right: Spacing.lg,
        flexDirection: 'row',
        gap: 6,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    dotActive: {
        backgroundColor: colors.textOnImage,
    },
    dotInactive: {
        backgroundColor: colors.whiteAlpha40,
    },

    // Content
    contentScroll: {
        maxHeight: vh(300),
    },
    contentContainer: {
        padding: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    title: {
        ...Typography.heading2,
        color: colors.textPrimary,
        marginBottom: Spacing.xxs,
    },
    subtitle: {
        ...Typography.body,
        color: colors.textSecondary,
        marginBottom: Spacing.sm,
    },

    // Chips
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginTop: Spacing.md,
        marginBottom: Spacing.lg,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: colors.backgroundLight,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.pill,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipText: {
        ...Typography.small,
        color: colors.textSecondary,
        maxWidth: 150,
    },
    categoryChip: {
        backgroundColor: colors.primarySurface,
        borderColor: colors.primaryBorder,
    },
    categoryChipText: {
        color: colors.primary,
    },

    // Location
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    addressText: {
        ...Typography.small,
        color: colors.textSecondary,
        flex: 1,
    },
    mapContainer: {
        width: '100%',
        height: vh(180),
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        marginBottom: Spacing.lg,
        backgroundColor: colors.backgroundLight,
    },

    // Description
    sectionTitle: {
        ...Typography.subheading,
        color: colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    descriptionCard: {
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    descriptionText: {
        ...Typography.body,
        color: colors.gray700,
        lineHeight: 22,
    },

    // CTA
    ctaContainer: {
        padding: Spacing.lg,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.white,
    },
    ctaButton: {
        width: '100%',
    },
});

export default React.memo(ExperienceDetailModal);
