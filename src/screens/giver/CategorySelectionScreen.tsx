import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MainScreen from '../MainScreen'; // Assuming this path is correct
import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase'; // Assuming this path is correct
import { Heart, ShoppingCart, LogIn } from 'lucide-react-native';
// This is required for the gradient text effect
import MaskedView from '@react-native-masked-view/masked-view';
import { ExperienceCardSkeleton } from '../../components/SkeletonLoader';
import { useApp } from '../../context/AppContext';
import { cartService } from '../../services/CartService';
import { RootStackParamList } from '../../types';
import SharedHeader from '../../components/SharedHeader';
import { logger } from '../../utils/logger';

// Mocking types for the example
type ExperienceCategory = 'adventure' | 'wellness' | 'food-culture' | 'entertainment';
type Experience = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverImageUrl: string;
  category: ExperienceCategory;
  price: number;
};
type GiverStackParamList = {
  CategorySelection: undefined;
  ExperienceDetails: { experience: Experience };
  ExperienceCheckout: { experience?: Experience; cartItems?: any[] };
};
// End of mock types

type Category = { id: ExperienceCategory; title: string; experiences: Experience[] };
type GiverNavigationProp = NativeStackNavigationProp<GiverStackParamList, 'CategorySelection'>;
type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
  <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.experienceCard}>
    <View style={styles.cardImageContainer}>
      <Image source={{ uri: experience.coverImageUrl }} style={styles.cardImage} resizeMode="cover" />

      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onToggleWishlist();
        }}
        style={styles.heartButton}
      >
        {isWishlisted ? (
          <Heart fill="#ef4444" color="#ef4444" size={22} />
        ) : (
          <Heart color="#fff" size={22} />
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


  </TouchableOpacity>
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
      renderItem={({ item }) => (
        <ExperienceCard
          experience={item}
          onPress={() => onExperiencePress(item.id)}
          onToggleWishlist={() => onToggleWishlist(item.id)}
          isWishlisted={wishlist.includes(item.id)}
        />
      )}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.carouselContentContinuous}
    />
  </View>
);

const CategorySelectionScreen = () => {
  logger.log('[CategorySelectionScreen] Rendering...');
  const navigation = useNavigation<GiverNavigationProp>();
  const rootNavigation = useNavigation<RootNavigationProp>();
  const { state, dispatch } = useApp();
  logger.log('[CategorySelectionScreen] State loaded:', { hasUser: !!state?.user, hasState: !!state });
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [categoriesWithExperiences, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const auth = getAuth();
  const user = auth.currentUser;
  const isAuthenticated = !!state.user;

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
        const guestCart = await cartService.getGuestCart();
        if (guestCart.length > 0) {
          dispatch({ type: 'SET_CART', payload: guestCart });
        }
      }
    };
    loadGuestCart();
  }, []);

  const handleCartPress = () => {
    navigation.navigate('Cart' as any);
  };

  const handleSignInPress = () => {
    rootNavigation.navigate('Auth' as any);
  };

  // Load experiences from Firestore
  useEffect(() => {
    const fetchExperiences = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'experiences'));
        const allExperiences = snapshot.docs.map((doc) => doc.data() as Experience);

        const grouped = allExperiences.reduce((acc, exp) => {
          if (!acc[exp.category]) acc[exp.category] = [];
          acc[exp.category].push(exp);
          return acc;
        }, {} as Record<ExperienceCategory, Experience[]>);

        const categoriesArray = Object.keys(grouped).map((cat) => ({
          id: cat as ExperienceCategory,
          title:
            cat === 'adventure'
              ? 'Adventure'
              : cat === 'relaxation'
                ? 'Wellness'
                : cat === 'creative'
                  ? 'Creative'
                  : 'Entertainment',
          experiences: grouped[cat as ExperienceCategory],
        }));

        setCategories(categoriesArray);
      } catch (error) {
        logger.error('Error fetching experiences:', error);
        Alert.alert('Error', 'Could not load experiences.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchExperiences();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const fetchWishlist = async () => {
        if (!user) {
          // Clear wishlist when user logs out
          setWishlist([]);
          return;
        }
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setWishlist(data.wishlist || []);
        } else {
          setWishlist([]);
        }
      };

      fetchWishlist();
    }, [user])
  );

  const toggleWishlist = async (experienceId: string) => {
    if (!user || !state.user) {
      Alert.alert('Please log in to use wishlist.');
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
      Alert.alert('Error', 'Failed to update wishlist. Please try again.');
    }
  };
  const headerColors = ['#462088ff', '#2c71c0ff'] as const;

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categoriesWithExperiences;
    return categoriesWithExperiences
      .map((category) => ({
        ...category,
        experiences: category.experiences.filter(
          (experience) =>
            experience.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            experience.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter((category) => category.experiences.length > 0);
  }, [searchQuery, categoriesWithExperiences]);

  const handleExperiencePress = (experienceId: string) => {
    const experience = categoriesWithExperiences
      .flatMap((cat) => cat.experiences)
      .find((exp) => exp.id === experienceId);
    if (!experience) return;

    navigation.navigate('ExperienceDetails', { experience });
  };

  return (
    <MainScreen activeRoute="Home">
      <StatusBar style="light" />
      <SharedHeader
        title="Find an Experience"
        subtitle="Select a gift they'll never forget"
      />

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search experiences..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
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
                  backgroundColor: '#e5e7eb',
                  borderRadius: 4
                }} />
              </View>

              {/* Horizontal scrolling skeleton cards */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 8, gap: 12 }}>
                <ExperienceCardSkeleton />
                <ExperienceCardSkeleton />
                <ExperienceCardSkeleton />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          style={styles.listContainer}
          data={filteredCategories}
          renderItem={({ item }) => (
            <CategoryCarousel
              category={item}
              onExperiencePress={handleExperiencePress}
              onToggleWishlist={toggleWishlist}
              wishlist={wishlist}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoriesListMoved}
          showsVerticalScrollIndicator={false}
        />
      )}
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  searchBar: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
    color: '#6b7280',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 10,
  },
  categoriesListMoved: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  categorySection: {
    marginBottom: 10,
  },
  categoryHeaderInline: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
  },
  categoryTitleInline: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  carouselContentContinuous: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  experienceCard: {
    marginRight: 12,
    width: 175,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
    height: 200, // <-- 2. ADDED FIXED HEIGHT
  },
  cardImageContainer: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#e5e7eb',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 6,
    borderRadius: 20,
  },
  cardContent: {
    padding: 10,
    height: 90, // fixed consistent text+price zone
    justifyContent: "space-between",
  },

  textBlock: {
    height: 64, // consistent space for title + subtitle (2 lines each)
    overflow: "hidden",
  },

  cardTitle: {
    color: "#111827",
    fontWeight: "bold",
    fontSize: 15,
    lineHeight: 18,
  },

  cardSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },

  cardPrice: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "right",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContainer: {
    flex: 1,
  },
});

export default CategorySelectionScreen;