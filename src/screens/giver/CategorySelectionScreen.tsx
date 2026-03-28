import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import ErrorRetry from '../../components/ErrorRetry';
import { EmptyState } from '../../components/EmptyState';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  TextInput,
  Animated,
  Easing,
  Platform,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import MainScreen from '../MainScreen';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Heart, Search, X, Gift, MapPin } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { FeaturedHeroSkeleton, BentoCardSkeleton, SkeletonBox } from '../../components/SkeletonLoader';
import { useApp } from '../../context/AppContext';
import { cartService } from '../../services/CartService';
import { Experience, ExperienceCategory } from '../../types';
import { useGiverNavigation, useRootNavigation } from '../../types/navigation';
import SharedHeader from '../../components/SharedHeader';
import { Chip } from '../../components/Chip';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import { vh } from '../../utils/responsive';
import * as Haptics from 'expo-haptics';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// SCREEN_W and derived card widths are computed inside the component via useWindowDimensions()
const BENTO_HEIGHT = vh(200);
const BENTO_GAP = Spacing.md;

// ─── Types ──────────────────────────────────────────────────────────────────

type CategoryData = { id: ExperienceCategory; title: string; experiences: Experience[] };
const FILTER_CHIPS: Array<ExperienceCategory | 'all'> = ['all', 'adventure', 'wellness', 'creative'];
const FILTER_LABELS: Record<ExperienceCategory | 'all', string> = {
  all: 'All',
  adventure: 'Adventure',
  wellness: 'Wellness',
  creative: 'Creative',
};

// ─── Featured Hero Card ─────────────────────────────────────────────────────

const FeaturedHeroCard = ({
  experience,
  onPress,
  onToggleWishlist,
  isWishlisted,
}: {
  experience: Experience;
  onPress: () => void;
  onToggleWishlist: () => void;
  isWishlisted: boolean;
}) => {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const heroCardW = useMemo(() => screenWidth - Spacing.xxl * 2, [screenWidth]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.heroCard, { width: heroCardW }, pressed && { opacity: 0.95 }]}
      accessibilityLabel={`Featured: ${experience.title}`}
    >
      <Image
        source={{ uri: experience.coverImageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk"
        accessibilityLabel={`${experience.title} cover image`}
      />
      <LinearGradient
        colors={['transparent', Colors.overlayOnImageLight]}
        style={styles.heroGradient}
      />
      <BlurView intensity={25} tint="dark" style={styles.heroTextOverlay}>
        <View style={styles.heroTextInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {experience.title}
            </Text>
            {experience.location && (
              <View style={styles.heroLocationRow}>
                <MapPin size={13} color={colors.textOnImage} />
                <Text style={styles.heroLocation}>{experience.location}</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroPrice}>€{experience.price.toFixed(0)}</Text>
        </View>
      </BlurView>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onToggleWishlist();
        }}
        style={styles.heroHeart}
        accessibilityRole="button"
        accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isWishlisted ? (
          <Heart fill={colors.error} color={colors.error} size={22} />
        ) : (
          <Heart color={colors.textOnImage} size={22} />
        )}
      </TouchableOpacity>
    </Pressable>
  );
};

// ─── Category Filter Bar ────────────────────────────────────────────────────

const CategoryFilterBar = ({
  selectedCategory,
  onSelect,
  availableCategories,
}: {
  selectedCategory: ExperienceCategory | 'all';
  onSelect: (cat: ExperienceCategory | 'all') => void;
  availableCategories: ExperienceCategory[];
}) => {
  const handlePress = useCallback((cat: ExperienceCategory | 'all') => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(cat);
  }, [onSelect]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: Spacing.xxl,
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
      }}
    >
      {FILTER_CHIPS.filter(
        (cat) => cat === 'all' || availableCategories.includes(cat)
      ).map((cat) => (
        <Chip
          key={cat}
          label={FILTER_LABELS[cat]}
          selected={selectedCategory === cat}
          onPress={() => handlePress(cat)}
          size="md"
        />
      ))}
    </ScrollView>
  );
};

// ─── Bento Card ─────────────────────────────────────────────────────────────

const BentoCard = ({
  experience,
  height,
  onPress,
  onToggleWishlist,
  isWishlisted,
}: {
  experience: Experience;
  height: number;
  onPress: () => void;
  onToggleWishlist: () => void;
  isWishlisted: boolean;
}) => {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const bentoCW = useMemo(() => (screenWidth - Spacing.xxl * 2 - BENTO_GAP) / 2, [screenWidth]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bentoCard,
        { height, width: bentoCW },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityLabel={`View ${experience.title}`}
    >
      <Image
        source={{ uri: experience.coverImageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        accessibilityLabel={`${experience.title} cover image`}
      />
      <BlurView intensity={20} tint="dark" style={styles.bentoOverlay}>
        <View style={styles.bentoOverlayInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bentoTitle} numberOfLines={2}>
              {experience.title}
            </Text>
            {experience.subtitle && (
              <Text style={styles.bentoSubtitle} numberOfLines={1}>
                {experience.subtitle}
              </Text>
            )}
          </View>
          <Text style={styles.bentoPrice}>{experience.price.toFixed(0)} €</Text>
        </View>
      </BlurView>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onToggleWishlist();
        }}
        style={styles.bentoHeart}
        accessibilityRole="button"
        accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isWishlisted ? (
          <Heart fill={colors.error} color={colors.error} size={18} />
        ) : (
          <Heart color={colors.textOnImage} size={18} />
        )}
      </TouchableOpacity>
    </Pressable>
  );
};

// ─── Category Carousel (for "All" view) ─────────────────────────────────────

const CategoryCarousel = ({
  category,
  onExperiencePress,
  onToggleWishlist,
  wishlist,
}: {
  category: CategoryData;
  onExperiencePress: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  wishlist: string[];
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.carouselSection}>
      <Text style={styles.carouselSectionTitle}>{category.title}</Text>
      <FlatList
        data={category.experiences}
        keyExtractor={(item) => item.id}
        horizontal
        initialNumToRender={5}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.xxl, gap: Spacing.md }}
        removeClippedSubviews={false}
        maxToRenderPerBatch={8}
        windowSize={3}
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, translateX: 20 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'spring', delay: index * 60 }}
          >
            <BentoCard
              experience={item}
              height={BENTO_HEIGHT}
              onPress={() => onExperiencePress(item.id)}
              onToggleWishlist={() => onToggleWishlist(item.id)}
              isWishlisted={wishlist.includes(item.id)}
            />
          </MotiView>
        )}
      />
    </View>
  );
};

// ─── Main Screen ────────────────────────────────────────────────────────────

const CategorySelectionScreen = () => {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const { BENTO_CARD_W, HERO_CARD_W, HERO_SNAP_INTERVAL } = useMemo(() => {
    const bentoCardW = (screenWidth - Spacing.xxl * 2 - BENTO_GAP) / 2;
    const heroCardW = screenWidth - Spacing.xxl * 2;
    return {
      BENTO_CARD_W: bentoCardW,
      HERO_CARD_W: heroCardW,
      HERO_SNAP_INTERVAL: heroCardW + Spacing.md,
    };
  }, [screenWidth]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useGiverNavigation();
  const rootNavigation = useRootNavigation();
  const route = useRoute();
  const routeParams = route.params as { prefilterCategory?: string } | undefined;
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [categoriesWithExperiences, setCategories] = useState<CategoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const { showError, showInfo } = useToast();
  const [activeCategory, setActiveCategory] = useState<ExperienceCategory | 'all'>(
    (routeParams?.prefilterCategory as ExperienceCategory) ?? 'all'
  );

  const empowerContext = state.empowerContext;

  const dismissEmpower = useCallback(() => {
    dispatch({ type: 'SET_EMPOWER_CONTEXT', payload: null });
  }, [dispatch]);

  const auth = getAuth();
  const user = auth.currentUser;

  // Calculate cart item count (from user cart or guest cart)
  const currentCart = state.user?.cart || state.guestCart || [];
  const cartItemCount = useMemo(() => currentCart.reduce((total, item) => total + item.quantity, 0) || 0, [currentCart]);

  // Save guest cart to local storage whenever it changes
  const prevCartRef = useRef<string>('');
  useEffect(() => {
    if (!state.user && state.guestCart) {
      const cartString = JSON.stringify(state.guestCart);
      if (cartString !== prevCartRef.current) {
        prevCartRef.current = cartString;
        cartService.saveGuestCart(state.guestCart);
      }
    }
  }, [state.guestCart, state.user]);

  // Load guest cart from storage on mount if not authenticated
  useEffect(() => {
    const loadGuestCart = async () => {
      if (!state.user) {
        try {
          const guestCart = await cartService.getGuestCart();
          if (guestCart.length > 0) {
            dispatch({ type: 'SET_CART', payload: guestCart });
          }
        } catch (error: unknown) {
          logger.error('Error loading guest cart:', error);
        }
      }
    };
    loadGuestCart();
  }, []);

  const handleCartPress = useCallback(() => {
    navigation.navigate('Cart');
  }, [navigation]);

  const handleSignInPress = useCallback(() => {
    rootNavigation.navigate('Auth', { mode: 'signin' });
  }, [rootNavigation]);

  // Load experiences from Firestore
  const fetchExperiences = useCallback(async () => {
    setError(false);
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'experiences'));
      const allExperiences = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Experience));

      const validCategories = ['adventure', 'creative', 'wellness'];

      // Filter out draft experiences and group by category
      const grouped = allExperiences
        .filter((exp) => exp.status !== 'draft')
        .reduce((acc, exp) => {
          const cat = (exp.category ?? '').toLowerCase();
          if (validCategories.includes(cat)) {
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(exp);
          }
          return acc;
        }, {} as Record<string, Experience[]>);

      // Sort experiences within each category by admin-defined order
      for (const cat of Object.keys(grouped)) {
        grouped[cat].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      }

      const categoryOrder = ['adventure', 'wellness', 'creative'];

      const categoriesArray = Object.keys(grouped)
        .sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b))
        .map((cat) => ({
          id: cat,
          title:
            cat === 'adventure'
              ? 'Adventure'
              : cat === 'wellness'
                ? 'Wellness'
                : 'Creative',
          experiences: grouped[cat],
        }));

      setCategories(categoriesArray as CategoryData[]);
      setError(false);
    } catch (error: unknown) {
      logger.error('Error fetching experiences:', error);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExperiences();
  }, [fetchExperiences]);

  useFocusEffect(
    useCallback(() => {
      const fetchWishlist = async () => {
        if (!user) {
          setWishlist([]);
          return;
        }
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setWishlist(data.wishlist || []);
          } else {
            setWishlist([]);
          }
        } catch (error: unknown) {
          logger.error('Error fetching wishlist:', error);
        }
      };

      fetchWishlist();
    }, [user])
  );

  const toggleSearch = () => {
    if (showSearch) {
      Animated.timing(searchAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => setShowSearch(false));
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  };

  const toggleWishlist = async (experienceId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!user || !state.user) {
      showInfo('Please log in to use wishlist.');
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const isAlreadyWishlisted = wishlist.includes(experienceId);

    try {
      if (isAlreadyWishlisted) {
        await updateDoc(userRef, { wishlist: arrayRemove(experienceId) });
        setWishlist((prev) => prev.filter((id) => id !== experienceId));
      } else {
        await updateDoc(userRef, { wishlist: arrayUnion(experienceId) });
        setWishlist((prev) => [...prev, experienceId]);
      }
    } catch (error: unknown) {
      logger.error('Error updating wishlist:', error);
      showError('Failed to update wishlist. Please try again.');
    }
  };

  // Derive popular experiences for the hero carousel
  const popularExperiences = useMemo(() => {
    const all = categoriesWithExperiences.flatMap((c) => c.experiences);
    // Featured first, then sorted by recommendedOrder/order
    const sorted = [...all].sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return (a.recommendedOrder ?? a.order ?? 999) - (b.recommendedOrder ?? b.order ?? 999);
    });
    return sorted.slice(0, 5); // Top 5 for the carousel
  }, [categoriesWithExperiences]);

  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);

  // Available categories for filter chips
  const availableCategories = useMemo(
    () => categoriesWithExperiences.map((c) => c.id as ExperienceCategory),
    [categoriesWithExperiences]
  );

  // All category carousels — featured experiences pushed to the back
  const allCarouselCategories = useMemo(() => {
    const popularIds = new Set(popularExperiences.map((e) => e.id));
    return categoriesWithExperiences
      .map((cat) => ({
        ...cat,
        experiences: [
          ...cat.experiences.filter((e) => !popularIds.has(e.id)),
          ...cat.experiences.filter((e) => popularIds.has(e.id)),
        ],
      }))
      .filter((cat) => cat.experiences.length > 0);
  }, [categoriesWithExperiences, popularExperiences]);

  // Which category IDs are visible based on filters
  const visibleCategoryIds = useMemo(() => {
    let cats = allCarouselCategories;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      cats = cats.filter((cat) =>
        cat.experiences.some(
          (e) => (e.title || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q)
        )
      );
    }

    if (activeCategory !== 'all') {
      cats = cats.filter((cat) => cat.id === activeCategory);
    }

    return new Set(cats.map((c) => c.id));
  }, [allCarouselCategories, activeCategory, searchQuery, routeParams?.prefilterCategory]);

  const handleExperiencePress = useCallback((experienceId: string) => {
    const experience = categoriesWithExperiences
      .flatMap((cat) => cat.experiences)
      .find((exp) => exp.id === experienceId);
    if (!experience) return;

    navigation.navigate('ExperienceDetails', { experience });
  }, [categoriesWithExperiences, navigation]);

  // Animate category filter changes
  const handleCategoryChange = useCallback((cat: ExperienceCategory | 'all') => {
    setActiveCategory(cat);
  }, []);

  // Whether to show hero carousel — stays visible regardless of category filter
  const showHero = popularExperiences.length > 0 && !searchQuery.trim();

  const onCarouselScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / HERO_SNAP_INTERVAL);
    setActiveCarouselIndex(Math.max(0, Math.min(index, popularExperiences.length - 1)));
  }, [popularExperiences.length]);

  const renderEmptyExperiences = useCallback(() => (
    <EmptyState
      icon={searchQuery ? '🔍' : '🎁'}
      title={searchQuery ? `No results for "${searchQuery}"` : 'No Experiences Available'}
      message={searchQuery ? 'Try a different search term' : 'Check back soon for new experiences!'}
    />
  ), [searchQuery]);

  const ListHeader = useMemo(() => (
    <>
      {/* Featured Experience Carousel */}
      {showHero && (
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', delay: 0 }}
        >
          <Text style={styles.sectionTitle}>Featured</Text>
          <FlatList
            data={popularExperiences}
            keyExtractor={(item) => item.id}
            horizontal
            initialNumToRender={4}
            pagingEnabled={false}
            snapToInterval={HERO_SNAP_INTERVAL}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={onCarouselScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{
              paddingHorizontal: Spacing.xxl,
              gap: Spacing.md,
            }}
            removeClippedSubviews={false}
            maxToRenderPerBatch={5}
            windowSize={3}
            renderItem={({ item, index }) => (
              <MotiView
                from={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', delay: index * 100 }}
              >
                <FeaturedHeroCard
                  experience={item}
                  onPress={() => handleExperiencePress(item.id)}
                  onToggleWishlist={() => toggleWishlist(item.id)}
                  isWishlisted={wishlist.includes(item.id)}
                />
              </MotiView>
            )}
          />
          {/* Dot indicators */}
          {popularExperiences.length > 1 && (
            <View style={styles.dotsContainer}>
              {popularExperiences.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === activeCarouselIndex ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          )}
        </MotiView>
      )}
      {/* Category Filter Chips */}
      <CategoryFilterBar
        selectedCategory={activeCategory}
        onSelect={handleCategoryChange}
        availableCategories={availableCategories}
      />
    </>
  ), [showHero, popularExperiences, activeCarouselIndex, activeCategory, availableCategories, wishlist, styles, onCarouselScroll, handleCategoryChange]);

  return (
    <ErrorBoundary screenName="CategorySelectionScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <StatusBar style="light" />
        <View style={{ zIndex: 100 }}>
          <SharedHeader
            title="Gift Experiences"
            subtitle="Empower your friends"
            rightActions={
              <TouchableOpacity
                onPress={toggleSearch}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Search experiences"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: Spacing.xs }}
              >
                <Search color={colors.textSecondary} size={22} strokeWidth={1.8} />
              </TouchableOpacity>
            }
          />
          {empowerContext && (
            <View style={styles.empowerBanner}>
              <Gift color={colors.primary} size={18} />
              <Text style={styles.empowerBannerText} numberOfLines={1}>
                Gifting for <Text style={styles.empowerBannerName}>{empowerContext.userName || 'a friend'}</Text>'s challenge
              </Text>
              <TouchableOpacity
                onPress={dismissEmpower}
                style={styles.empowerBannerClose}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Dismiss empower banner"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color={colors.primary} size={16} />
              </TouchableOpacity>
            </View>
          )}
          {showSearch && (
            <Animated.View style={[
              styles.searchContainer,
              {
                opacity: searchAnim,
                height: searchAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 80]
                }),
                transform: [{
                  translateY: searchAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0]
                  })
                }],
                overflow: 'hidden'
              }
            ]}>
              <View style={styles.searchBar}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search experiences..."
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  returnKeyType="search"
                  accessibilityLabel="Search experiences"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          )}
        </View>

        {isLoading ? (
          <ScrollView contentContainerStyle={[styles.loadingContent, { paddingBottom: vh(80) + FOOTER_HEIGHT + insets.bottom }]} showsVerticalScrollIndicator={false}>
            <FeaturedHeroSkeleton />
            <View style={styles.chipRowSkeleton}>
              {[80, 90, 70, 80].map((w, i) => (
                <SkeletonBox key={i} width={w} height={32} borderRadius={BorderRadius.pill} />
              ))}
            </View>
            <View style={styles.bentoSkeletonGrid}>
              <BentoCardSkeleton height={BENTO_HEIGHT} width={BENTO_CARD_W} />
              <BentoCardSkeleton height={BENTO_HEIGHT} width={BENTO_CARD_W} />
              <BentoCardSkeleton height={BENTO_HEIGHT} width={BENTO_CARD_W} />
              <BentoCardSkeleton height={BENTO_HEIGHT} width={BENTO_CARD_W} />
            </View>
          </ScrollView>
        ) : error ? (
          <ErrorRetry
            message="Could not load experiences"
            onRetry={fetchExperiences}
          />
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={[styles.bentoListContent, { paddingBottom: vh(80) + FOOTER_HEIGHT + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {ListHeader}
            <AnimatePresence>
              {allCarouselCategories.map((cat) => {
                const isVisible = visibleCategoryIds.has(cat.id);
                if (!isVisible) return null;
                const q = searchQuery.toLowerCase();
                const filteredExperiences = searchQuery.trim()
                  ? cat.experiences.filter(
                      (e) =>
                        (e.title || '').toLowerCase().includes(q) ||
                        (e.description || '').toLowerCase().includes(q)
                    )
                  : cat.experiences;
                return (
                  <MotiView
                    key={cat.id}
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    exit={{ opacity: 0, translateY: -10 }}
                    transition={{ type: 'timing', duration: 250 }}
                    exitTransition={{ type: 'timing', duration: 200 }}
                  >
                    <CategoryCarousel
                      category={{ ...cat, experiences: filteredExperiences }}
                      onExperiencePress={handleExperiencePress}
                      onToggleWishlist={toggleWishlist}
                      wishlist={wishlist}
                    />
                  </MotiView>
                );
              })}
            </AnimatePresence>
            {visibleCategoryIds.size === 0 && renderEmptyExperiences()}
          </ScrollView>
        )}

      </MainScreen>
    </ErrorBoundary>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  // Empower banner
  empowerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  empowerBannerText: {
    flex: 1,
    ...Typography.small,
    color: colors.primary,
  },
  empowerBannerName: {
    fontWeight: '700',
  },
  empowerBannerClose: {
    padding: Spacing.xs,
  },

  // Search
  searchContainer: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
  },
  searchBar: {
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: colors.textPrimary,
    paddingVertical: Spacing.sm,
  },

  // Hero Carousel
  sectionTitle: {
    ...Typography.heading2,
    color: colors.textPrimary,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  heroCard: {
    height: vh(240),
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.circle,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  heroTextOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  heroTextInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    backgroundColor: colors.blackAlpha25,
  },
  heroTitle: {
    ...Typography.heading3,
    color: colors.textOnImage,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  heroLocation: {
    ...Typography.caption,
    color: colors.textOnImage,
    opacity: 0.85,
  },
  heroPrice: {
    ...Typography.subheading,
    color: colors.textOnImage,
    fontWeight: '700',
  },
  heroHeart: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: colors.overlayLight,
    padding: Spacing.sm,
    borderRadius: BorderRadius.circle,
  },

  // Bento Card
  bentoCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  bentoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  bentoOverlayInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: colors.blackAlpha25,
  },
  bentoTitle: {
    ...Typography.small,
    color: colors.textOnImage,
    fontWeight: '600',
  },
  bentoSubtitle: {
    ...Typography.caption,
    color: colors.textOnImage,
    opacity: 0.8,
    marginTop: Spacing.xxs,
  },
  bentoPrice: {
    ...Typography.caption,
    color: colors.textOnImage,
    fontWeight: '700',
  },
  bentoHeart: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: colors.overlayLight,
    padding: Spacing.xs,
    borderRadius: BorderRadius.circle,
  },

  // Category Carousels (All view)
  carouselSection: {
    marginBottom: Spacing.lg,
  },
  carouselSectionTitle: {
    ...Typography.heading3,
    color: colors.textPrimary,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },

  // List
  listContainer: {
    flex: 1,
  },
  bentoListContent: {
    paddingTop: 0,
    paddingBottom: vh(80) + FOOTER_HEIGHT,
  },

  // Loading skeletons
  loadingContent: {
    paddingBottom: vh(80) + FOOTER_HEIGHT,
  },
  chipRowSkeleton: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  bentoSkeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BENTO_GAP,
    paddingHorizontal: Spacing.xxl,
  },
});

export default CategorySelectionScreen;
