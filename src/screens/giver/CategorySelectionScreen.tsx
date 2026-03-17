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
  Image,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import MainScreen from '../MainScreen';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Heart, ShoppingCart, LogIn, Search, X, Gift } from 'lucide-react-native';
// This is required for the gradient text effect
import MaskedView from '@react-native-masked-view/masked-view';
import { MotiView } from 'moti';
import { ExperienceCardSkeleton } from '../../components/SkeletonLoader';
import { useApp } from '../../context/AppContext';
import { cartService } from '../../services/CartService';
import { Experience, ExperienceCategory } from '../../types';
import { useGiverNavigation, useRootNavigation } from '../../types/navigation';
import SharedHeader from '../../components/SharedHeader';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '../../config/colors';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import * as Haptics from 'expo-haptics';

type Category = { id: ExperienceCategory; title: string; experiences: Experience[] };

const ExperienceCard = ({
  experience,
  onPress,
  onToggleWishlist,
  isWishlisted,
}: {
  experience: Experience;
  onPress: () => void;
  onToggleWishlist: () => void;
  isWishlisted: boolean;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.experienceCard, pressed && { opacity: 0.9 }]}
    accessibilityLabel={`View ${experience.title}`}
  >
    <View style={styles.cardImageContainer}>
      <Image
        source={{ uri: experience.coverImageUrl }}
        style={styles.cardImage}
        resizeMode="cover"
        accessibilityLabel={`${experience.title} experience cover image`}
      />

      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onToggleWishlist();
        }}
        style={styles.heartButton}
        accessibilityRole="button"
        accessibilityLabel={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isWishlisted ? (
          <Heart fill={Colors.error} color={Colors.error} size={22} />
        ) : (
          <Heart color={Colors.white} size={22} />
        )}

      </TouchableOpacity>
    </View>

    <View style={styles.cardContent}>
      <View style={styles.textBlock}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {experience.title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {experience.subtitle}
        </Text>
      </View>

      <Text style={styles.cardPrice}>{experience.price.toFixed(0)} €</Text>
    </View>
  </Pressable>
);

const CategoryCarousel = ({
  category,
  onExperiencePress,
  onToggleWishlist,
  wishlist,
}: {
  category: Category;
  onExperiencePress: (experienceId: string) => void;
  onToggleWishlist: (experienceId: string) => void;
  wishlist: string[];
}) => (
  <View style={styles.categorySection}>
    <View style={styles.categoryHeaderInline}>
      <Text style={styles.categoryTitleInline}>{category.title}</Text>
    </View>
    <FlatList
      data={category.experiences}
      renderItem={({ item, index }) => (
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: 'spring',
            delay: index * 100,
          }}
        >
          <ExperienceCard
            experience={item}
            onPress={() => onExperiencePress(item.id)}
            onToggleWishlist={() => onToggleWishlist(item.id)}
            isWishlisted={wishlist.includes(item.id)}
          />
        </MotiView>
      )}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.carouselContentContinuous}
    />
  </View>
);



const CategorySelectionScreen = () => {
  const navigation = useGiverNavigation();
  const rootNavigation = useRootNavigation();
  const route = useRoute();
  const routeParams = route.params as { prefilterCategory?: string } | undefined;
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [categoriesWithExperiences, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const { showError, showInfo } = useToast();

  const empowerContext = state.empowerContext;

  const dismissEmpower = useCallback(() => {
    dispatch({ type: 'SET_EMPOWER_CONTEXT', payload: null });
  }, [dispatch]);

  const auth = getAuth();
  const user = auth.currentUser;
  const isAuthenticated = !!state.user;

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);


  // Calculate cart item count (from user cart or guest cart)
  const currentCart = state.user?.cart || state.guestCart || [];
  const cartItemCount = currentCart.reduce((total, item) => total + item.quantity, 0) || 0;

  // Save guest cart to local storage whenever it changes
  // Use a ref to track previous cart to avoid unnecessary saves
  const prevCartRef = useRef<string>('');
  useEffect(() => {
    if (!state.user && state.guestCart) {
      const cartString = JSON.stringify(state.guestCart);
      // Only save if cart actually changed
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
        } catch (error) {
          logger.error('Error loading guest cart:', error);
        }
      }
    };
    loadGuestCart();
  }, []);

  const handleCartPress = () => {
    navigation.navigate('Cart');
  };

  const handleSignInPress = () => {
    rootNavigation.navigate('Auth', { mode: 'signin' });
  };

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
          const cat = exp.category.toLowerCase();
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

      setCategories(categoriesArray as Category[]);
      setError(false);
    } catch (error) {
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
          // Clear wishlist when user logs out
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
        } catch (error) {
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
    } catch (error) {
      logger.error('Error updating wishlist:', error);
      showError('Failed to update wishlist. Please try again.');
    }
  };

  const filteredCategories = useMemo(() => {
    let categories = categoriesWithExperiences;
    if (routeParams?.prefilterCategory) {
        categories = categories.filter(cat => cat.id === routeParams.prefilterCategory);
    }
    if (!searchQuery.trim()) return categories;
    return categories
      .map((category) => ({
        ...category,
        experiences: category.experiences.filter(
          (experience) =>
            experience.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            experience.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter((category) => category.experiences.length > 0);
  }, [searchQuery, categoriesWithExperiences, routeParams?.prefilterCategory]);

  const handleExperiencePress = (experienceId: string) => {
    const experience = categoriesWithExperiences
      .flatMap((cat) => cat.experiences)
      .find((exp) => exp.id === experienceId);
    if (!experience) return;

    navigation.navigate('ExperienceDetails', { experience });
  };

  const renderEmptyExperiences = useCallback(() => (
    <EmptyState
      icon={searchQuery ? "🔍" : "🎁"}
      title={searchQuery ? `No results for "${searchQuery}"` : "No Experiences Available"}
      message={searchQuery ? "Try a different search term" : "Check back soon for new experiences!"}
    />
  ), [searchQuery]);

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
              <Search color={Colors.textSecondary} size={22} strokeWidth={1.8} />
            </TouchableOpacity>
          }
        />
        {empowerContext && (
          <View style={styles.empowerBanner}>
            <Gift color={Colors.primary} size={18} />
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
              <X color={Colors.primary} size={16} />
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
                placeholderTextColor={Colors.textMuted}
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
                  <X size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.listContainer}>
          {/* Skeleton for multiple category carousels */}
          {[1, 2, 3].map((categoryIndex) => (
            <View key={categoryIndex} style={styles.categorySection}>
              {/* Category header skeleton */}
              <View style={styles.categoryHeaderInline}>
                <View style={{
                  width: 120,
                  height: 24,
                  backgroundColor: Colors.border,
                  borderRadius: BorderRadius.xs
                }} />
              </View>

              {/* Horizontal scrolling skeleton cards */}
              <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.sm, gap: Spacing.md }}>
                <ExperienceCardSkeleton />
                <ExperienceCardSkeleton />
                <ExperienceCardSkeleton />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <ErrorRetry
          message="Could not load experiences"
          onRetry={fetchExperiences}
        />
      ) : (
        <FlatList
          style={styles.listContainer}
          data={filteredCategories}
          ListHeaderComponent={<></>
          }
          renderItem={({ item }) => (
            <CategoryCarousel
              category={item}
              onExperiencePress={handleExperiencePress}
              onToggleWishlist={toggleWishlist}
              wishlist={wishlist}
            />
          )}
          ListEmptyComponent={renderEmptyExperiences}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoriesListMoved}
          showsVerticalScrollIndicator={false}
        />
      )}

    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  empowerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
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
    color: Colors.primary,
  },
  empowerBannerName: {
    fontWeight: '700',
  },
  empowerBannerClose: {
    padding: Spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
  },
  searchBar: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm,
  },
  categoriesListMoved: {
    paddingTop: 0, // REMOVED GAP
    paddingBottom: 80,
  },
  categorySection: {
    marginBottom: 0,
  },
  categoryHeaderInline: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.sm,
  },
  categoryTitleInline: {
    ...Typography.heading2,
    color: Colors.textPrimary,
  },
  carouselContentContinuous: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.sm,
  },
  experienceCard: {
    marginRight: Spacing.md,
    width: 175,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.backgroundLight,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
    height: 200, // <-- 2. ADDED FIXED HEIGHT
  },
  cardImageContainer: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 100,
    backgroundColor: Colors.border,
  },
  heartButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.overlay,
    padding: Spacing.xs,
    borderRadius: BorderRadius.xl,
  },
  cardContent: {
    padding: Spacing.sm,
    height: 90, // fixed consistent text+price zone
    justifyContent: "space-between",
  },

  textBlock: {
    height: 64, // consistent space for title + subtitle (2 lines each)
    overflow: "hidden",
  },

  cardTitle: {
    color: Colors.textPrimary,
    ...Typography.body,
    fontWeight: "bold",
    lineHeight: 18,
  },

  cardSubtitle: {
    color: Colors.textSecondary,
    ...Typography.caption,
    lineHeight: 17,
    marginTop: 2,
  },

  cardPrice: {
    color: Colors.primary,
    ...Typography.small,
    fontWeight: "bold",
    textAlign: "right",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  listContainer: {
    flex: 1,
  },


});

export default CategorySelectionScreen;
