/**
 * VenueSelectionModal
 *
 * Triggered on first session start when a goal has no venue set.
 * Allows the user to search for a nearby gym/studio via Google Places
 * Autocomplete (native) or enter a venue name manually (web).
 */

import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
} from 'react';
import {
    View,
    Text,
    TextInput as RNTextInput,
    Modal,
    Animated,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Platform,
    Dimensions,
    Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Search, MapPin, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { vh } from '../utils/responsive';
import Button from './Button';
import { SkeletonBox } from './SkeletonLoader';
import { useToast } from '../context/ToastContext';

// ─── Constants ───────────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const AUTOCOMPLETE_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json';
const DEBOUNCE_MS = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Prediction {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
}

interface VenueResult {
    id: string;
    name: string;
    address: string;
    location: { lat: number; lng: number };
}

export interface VenueSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectVenue: (venue: VenueResult) => void;
    onSkip: () => void;
}

// ─── Skeleton for search results ─────────────────────────────────────────────

const VenueResultSkeleton: React.FC = () => {
    return (
        <View style={skeletonStyles.row}>
            <SkeletonBox width={36} height={36} borderRadius={BorderRadius.sm} />
            <View style={skeletonStyles.textGroup}>
                <SkeletonBox width="60%" height={14} style={{ marginBottom: 6 }} />
                <SkeletonBox width="80%" height={12} />
            </View>
        </View>
    );
};

const skeletonStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        gap: Spacing.md,
    },
    textGroup: {
        flex: 1,
    },
});

// ─── Main Component ───────────────────────────────────────────────────────────

const VenueSelectionModal: React.FC<VenueSelectionModalProps> = ({
    visible,
    onClose,
    onSelectVenue,
    onSkip,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const { showError } = useToast();

    // ─── State ────────────────────────────────────────────────────────────
    const [modalVisible, setModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingDetails, setFetchingDetails] = useState<string | null>(null); // placeId being fetched

    // ─── Refs ─────────────────────────────────────────────────────────────
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<RNTextInput>(null);
    const abortRef = useRef<AbortController | null>(null);

    // ─── Animation: open ──────────────────────────────────────────────────
    useEffect(() => {
        if (visible) {
            setModalVisible(true);
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
            ]).start(() => {
                // Auto-focus after slide-in completes
                setTimeout(() => inputRef.current?.focus(), 50);
            });
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Animation: close ─────────────────────────────────────────────────
    const animateClose = useCallback((callback?: () => void) => {
        Keyboard.dismiss();
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
            setSearchQuery('');
            setPredictions([]);
            setLoading(false);
            if (callback) {
                callback();
            } else {
                onClose();
            }
        });
    }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleClose = useCallback(() => animateClose(), [animateClose]);
    const handleSkip = useCallback(() => animateClose(onSkip), [animateClose, onSkip]);

    // ─── Google Places Autocomplete (native only) ─────────────────────────
    const fetchPredictions = useCallback(async (query: string) => {
        if (!query.trim() || query.trim().length < 2) {
            setPredictions([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            abortRef.current?.abort();
            abortRef.current = new AbortController();

            const url = new URL(AUTOCOMPLETE_ENDPOINT);
            url.searchParams.set('input', query);
            url.searchParams.set('types', 'establishment');
            url.searchParams.set('key', GOOGLE_PLACES_API_KEY);

            const response = await fetch(url.toString(), { signal: abortRef.current.signal });
            const data = await response.json() as {
                status: string;
                predictions: Array<{
                    place_id: string;
                    description: string;
                    structured_formatting: {
                        main_text: string;
                        secondary_text: string;
                    };
                }>;
            };

            if (data.status === 'OK') {
                setPredictions(
                    data.predictions.map((p) => ({
                        placeId: p.place_id,
                        description: p.description,
                        mainText: p.structured_formatting.main_text,
                        secondaryText: p.structured_formatting.secondary_text,
                    }))
                );
            } else {
                setPredictions([]);
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return;
            setPredictions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── Debounced search ─────────────────────────────────────────────────
    const handleSearchChange = useCallback((text: string) => {
        setSearchQuery(text);

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        if (!text.trim()) {
            setPredictions([]);
            setLoading(false);
            return;
        }

        setLoading(true); // Show skeleton immediately while waiting
        debounceTimer.current = setTimeout(() => {
            fetchPredictions(text);
        }, DEBOUNCE_MS);
    }, [fetchPredictions]);

    // Cleanup debounce timer and any in-flight fetch on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
            abortRef.current?.abort();
        };
    }, []);

    // ─── Fetch place details and call onSelectVenue ───────────────────────
    const handleSelectPrediction = useCallback(async (prediction: Prediction) => {
        if (!GOOGLE_PLACES_API_KEY) return;

        setFetchingDetails(prediction.placeId);
        Keyboard.dismiss();

        try {
            const url = new URL(DETAILS_ENDPOINT);
            url.searchParams.set('place_id', prediction.placeId);
            url.searchParams.set('fields', 'place_id,name,formatted_address,geometry');
            url.searchParams.set('key', GOOGLE_PLACES_API_KEY);

            const response = await fetch(url.toString());
            const data = await response.json() as {
                status: string;
                result: {
                    place_id: string;
                    name: string;
                    formatted_address: string;
                    geometry: {
                        location: { lat: number; lng: number };
                    };
                };
            };

            if (data.status === 'OK') {
                const venue: VenueResult = {
                    id: data.result.place_id,
                    name: data.result.name,
                    address: data.result.formatted_address,
                    location: {
                        lat: data.result.geometry.location.lat,
                        lng: data.result.geometry.location.lng,
                    },
                };
                animateClose(() => onSelectVenue(venue));
            } else {
                showError(t('modals.venueSelection.errorLoadFailed'));
            }
        } catch {
            showError(t('modals.venueSelection.errorGeneric'));
        } finally {
            setFetchingDetails(null);
        }
    }, [animateClose, onSelectVenue]);

    // ─── Web fallback: manual venue entry ────────────────────────────────
    const [webVenueName, setWebVenueName] = useState('');

    const handleWebConfirm = useCallback(() => {
        if (!webVenueName.trim()) return;
        const venue: VenueResult = {
            id: `manual_${Date.now()}`,
            name: webVenueName.trim(),
            address: '',
            location: { lat: 0, lng: 0 },
        };
        animateClose(() => onSelectVenue(venue));
    }, [webVenueName, animateClose, onSelectVenue]);

    // ─── Render: prediction item ──────────────────────────────────────────
    const renderPrediction = useCallback(({ item }: { item: Prediction }) => {
        const isFetching = fetchingDetails === item.placeId;
        return (
            <TouchableOpacity
                style={[styles.resultItem, isFetching && styles.resultItemFetching]}
                onPress={() => handleSelectPrediction(item)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={item.description}
                disabled={fetchingDetails !== null}
            >
                <View style={styles.resultIconWrap}>
                    <MapPin size={16} color={colors.primary} />
                </View>
                <View style={styles.resultTextWrap}>
                    <Text style={styles.resultMainText} numberOfLines={1}>
                        {item.mainText}
                    </Text>
                    <Text style={styles.resultSecondaryText} numberOfLines={1}>
                        {item.secondaryText}
                    </Text>
                </View>
                {isFetching && (
                    <View style={styles.resultLoadingDot} />
                )}
            </TouchableOpacity>
        );
    }, [fetchingDetails, handleSelectPrediction, styles, colors.primary]);

    const keyExtractor = useCallback((item: Prediction) => item.placeId, []);

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            {/* Animated backdrop */}
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={handleClose}
                accessibilityLabel={t('modals.venueSelection.dismissA11y')}
                accessibilityRole="button"
            >
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
                    <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlayMedium }]} />
                </Animated.View>
            </TouchableOpacity>

            {/* Bottom sheet */}
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

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerTextGroup}>
                            <Text style={styles.title}>{t('modals.venueSelection.title')}</Text>
                            <Text style={styles.subtitle}>
                                {t('modals.venueSelection.subtitle')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleClose}
                            style={styles.closeButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel={t('modals.venueSelection.closeA11y')}
                            accessibilityRole="button"
                        >
                            <X size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    <View style={styles.body}>
                        {Platform.OS === 'web' ? (
                            /* ── Web: manual entry ── */
                            <View>
                                <View style={styles.searchRow}>
                                    <View style={styles.searchIconWrap}>
                                        <Search size={18} color={colors.textMuted} />
                                    </View>
                                    <RNTextInput
                                        ref={inputRef}
                                        style={styles.searchInput}
                                        placeholder={t('modals.venueSelection.webPlaceholder')}
                                        placeholderTextColor={colors.textMuted}
                                        value={webVenueName}
                                        onChangeText={setWebVenueName}
                                        returnKeyType="done"
                                        onSubmitEditing={handleWebConfirm}
                                        accessibilityLabel={t('modals.venueSelection.venueInputA11y')}
                                    />
                                    {webVenueName.length > 0 && (
                                        <TouchableOpacity
                                            onPress={() => setWebVenueName('')}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            accessibilityLabel={t('modals.venueSelection.clearA11y')}
                                        >
                                            <X size={16} color={colors.textMuted} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {webVenueName.trim().length > 0 && (
                                    <Button
                                        title={t('modals.venueSelection.confirmVenue')}
                                        onPress={handleWebConfirm}
                                        fullWidth
                                        gradient
                                        style={styles.confirmButton}
                                    />
                                )}
                            </View>
                        ) : (
                            /* ── Native: Google Places ── */
                            <View>
                                {/* Search input */}
                                <View style={styles.searchRow}>
                                    <View style={styles.searchIconWrap}>
                                        <Search size={18} color={colors.textMuted} />
                                    </View>
                                    <RNTextInput
                                        ref={inputRef}
                                        style={styles.searchInput}
                                        placeholder={t('modals.venueSelection.nativePlaceholder')}
                                        placeholderTextColor={colors.textMuted}
                                        value={searchQuery}
                                        onChangeText={handleSearchChange}
                                        returnKeyType="search"
                                        clearButtonMode="while-editing"
                                        autoCorrect={false}
                                        accessibilityLabel={t('modals.venueSelection.searchInputA11y')}
                                    />
                                    {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setSearchQuery('');
                                                setPredictions([]);
                                            }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            accessibilityLabel={t('modals.venueSelection.clearSearchA11y')}
                                        >
                                            <X size={16} color={colors.textMuted} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Results / skeletons */}
                                {loading ? (
                                    <View style={styles.skeletonList} accessibilityLabel={t('modals.venueSelection.loadingA11y')}>
                                        <VenueResultSkeleton />
                                        <View style={styles.divider} />
                                        <VenueResultSkeleton />
                                        <View style={styles.divider} />
                                        <VenueResultSkeleton />
                                    </View>
                                ) : predictions.length > 0 ? (
                                    <FlatList
                                        data={predictions}
                                        keyExtractor={keyExtractor}
                                        renderItem={renderPrediction}
                                        style={styles.resultList}
                                        keyboardShouldPersistTaps="handled"
                                        showsVerticalScrollIndicator={false}
                                        ItemSeparatorComponent={() => <View style={styles.divider} />}
                                        accessibilityLabel={t('modals.venueSelection.resultsA11y')}
                                        removeClippedSubviews={false}
                                        maxToRenderPerBatch={10}
                                        windowSize={5}
                                    />
                                ) : searchQuery.trim().length > 0 ? (
                                    <View style={styles.emptyState}>
                                        <Text style={styles.emptyStateText}>
                                            {t('modals.venueSelection.noVenuesFound')}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        )}

                        {/* Skip link */}
                        <TouchableOpacity
                            style={styles.skipButton}
                            onPress={handleSkip}
                            activeOpacity={0.65}
                            accessibilityRole="button"
                            accessibilityLabel={t('modals.venueSelection.skipA11y')}
                        >
                            <Text style={styles.skipText}>
                                {t('modals.venueSelection.skipText')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </Modal>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        // Overlay
        overlay: {
            flex: 1,
        },

        // Sheet
        sheet: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.white,
            borderTopLeftRadius: BorderRadius.xxl,
            borderTopRightRadius: BorderRadius.xxl,
            maxHeight: vh(738),
            ...Shadows.lg,
        },

        // Drag handle
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

        // Header
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingHorizontal: Spacing.screenPadding,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.lg,
        },
        headerTextGroup: {
            flex: 1,
            marginRight: Spacing.md,
        },
        title: {
            ...Typography.heading3,
            color: colors.textPrimary,
            marginBottom: Spacing.xs,
        },
        subtitle: {
            ...Typography.small,
            color: colors.textSecondary,
        },
        closeButton: {
            padding: Spacing.xs,
            marginTop: 2,
        },

        // Body
        body: {
            paddingHorizontal: Spacing.screenPadding,
            paddingBottom: Spacing.xxl,
        },

        // Search row
        searchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: Spacing.md,
            marginBottom: Spacing.md,
            gap: Spacing.sm,
        },
        searchIconWrap: {
            justifyContent: 'center',
            alignItems: 'center',
        },
        searchInput: {
            flex: 1,
            ...Typography.body,
            color: colors.textPrimary,
            paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
            // No border — the searchRow provides it
        },

        // Result list
        resultList: {
            maxHeight: vh(324),
            marginBottom: Spacing.md,
        },
        resultItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            gap: Spacing.md,
        },
        resultItemFetching: {
            opacity: 0.6,
        },
        resultIconWrap: {
            width: 36,
            height: 36,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.primaryLight,
            justifyContent: 'center',
            alignItems: 'center',
        },
        resultTextWrap: {
            flex: 1,
        },
        resultMainText: {
            ...Typography.bodyBold,
            color: colors.textPrimary,
            marginBottom: 2,
        },
        resultSecondaryText: {
            ...Typography.caption,
            color: colors.textSecondary,
        },
        resultLoadingDot: {
            width: 8,
            height: 8,
            borderRadius: BorderRadius.circle,
            backgroundColor: colors.primary,
            opacity: 0.6,
        },

        // Divider
        divider: {
            height: 1,
            backgroundColor: colors.border,
        },

        // Skeleton list
        skeletonList: {
            marginBottom: Spacing.md,
        },

        // Empty state
        emptyState: {
            paddingVertical: Spacing.xxl,
            alignItems: 'center',
        },
        emptyStateText: {
            ...Typography.small,
            color: colors.textMuted,
            textAlign: 'center',
        },

        // Confirm (web only)
        confirmButton: {
            marginBottom: Spacing.md,
        },

        // Skip
        skipButton: {
            alignItems: 'center',
            paddingTop: Spacing.lg,
        },
        skipText: {
            ...Typography.small,
            color: colors.textSecondary,
            textDecorationLine: 'underline',
        },
    });

export default React.memo(VenueSelectionModal);
