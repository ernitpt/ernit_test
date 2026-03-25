import React, { useState, useEffect, useRef, useMemo } from "react";
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Platform,
  Dimensions,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useRoute } from "@react-navigation/native";
import { ChevronLeft, MapPin, Clock, ShoppingCart, Info } from "lucide-react-native";
import { WebView } from "react-native-webview";
import { Heart } from "lucide-react-native";
import { getAuth } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../services/firebase";
import { userService } from "../../services/userService";
import { CartItem } from "../../types";
import { useAuthGuard } from '../../context/AuthGuardContext';
import LoginPrompt from "../../components/LoginPrompt";
import { cartService } from "../../services/CartService";
import HowItWorksModal from "../../components/HowItWorksModal";
import { ExperienceDetailSkeleton } from "../../components/SkeletonLoader";

import {
  Experience,
  PartnerUser,
} from "../../types";
import { useGiverNavigation } from "../../types/navigation";
import { useApp } from "../../context/AppContext";
import MainScreen from "../MainScreen";
import { partnerService } from "../../services/PartnerService";
import { logger } from '../../utils/logger';
import { vh } from '../../utils/responsive';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import ImageViewer from '../../components/ImageViewer';

const { width } = Dimensions.get("window");


function ExperienceDetailsScreenInner({ clientSecret }: { clientSecret: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useGiverNavigation();
  const route = useRoute();

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { experience?: Experience } | undefined;
  const experience = routeParams?.experience;

  const { state, dispatch } = useApp();

  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const auth = getAuth();
  const user = auth.currentUser;
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showSuccess, showError } = useToast();

  // Save guest cart to local storage whenever it changes
  const prevCartRef = useRef<string>('');
  // Ref guard to prevent rapid double-taps from firing handleAddToCart twice
  const addingToCartRef = useRef(false);

  // Redirect if data is missing (e.g., after page refresh)
  useEffect(() => {
    if (!experience?.id) {
      logger.warn('Missing/invalid experience on ExperienceDetailsScreen, redirecting to Home');
      navigation.reset({
        index: 0,
        routes: [{ name: 'CategorySelection' }],
      });
    }
  }, [experience, navigation]);

  useEffect(() => {
    const loadPartner = async () => {
      const p = await partnerService.getPartnerById(experience?.partnerId);
      setPartner(p);
    };
    loadPartner();
  }, [experience?.partnerId]);

  useEffect(() => {
    const loadWishlist = async () => {
      if (!user) return;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        setIsWishlisted((data.wishlist || []).includes(experience?.id));
      }
    };
    loadWishlist();
  }, [user, experience?.id]);

  useEffect(() => {
    if (!state.user && state.guestCart) {
      const cartString = JSON.stringify(state.guestCart);
      if (cartString !== prevCartRef.current) {
        prevCartRef.current = cartString;
        cartService.saveGuestCart(state.guestCart);
      }
    }
  }, [state.guestCart, state.user]);

  // Early return if data is invalid
  if (!experience?.id) {
    return (
      <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const images = Array.isArray(experience.imageUrl) ? experience.imageUrl : [experience.imageUrl];

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / slideSize);
    setActiveIndex(index);
  };

  const streetMapUrl = partner?.mapsUrl
    ? partner.mapsUrl.includes("?")
      ? `${partner.mapsUrl}&layer=`
      : `${partner.mapsUrl}?layer=`
    : "";

  const toggleWishlist = async () => {
    if (!requireAuth("Please log in to add items to your wishlist.")) {
      return;
    }

    if (!user) return; // Safety check
    const userRef = doc(db, "users", user.uid);
    const newValue = !isWishlisted;

    try {
      if (newValue) {
        await updateDoc(userRef, { wishlist: arrayUnion(experience.id) });
      } else {
        await updateDoc(userRef, { wishlist: arrayRemove(experience.id) });
      }
      setIsWishlisted(newValue);
      // Animate heart: pop out then settle
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.5, useNativeDriver: true, friction: 3, tension: 200 }),
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 100 }),
      ]).start();
    } catch (error: unknown) {
      logger.error("Error updating wishlist:", error);
      showError("Failed to update wishlist. Please try again.");
    }
  };

  const handleAddToCart = async () => {
    if (addingToCartRef.current) return;
    addingToCartRef.current = true;
    setIsAddingToCart(true);
    try {
      const cartItem: CartItem = {
        experienceId: experience.id,
        quantity,
      };

      // Update in context (works for both authenticated and guest users)
      dispatch({ type: "ADD_TO_CART", payload: cartItem });

      // If authenticated, also update in Firestore
      if (user && state.user) {
        await userService.addToCart(user.uid, cartItem);
      }
      // Guest cart is saved automatically via useEffect

      showSuccess(`Added ${quantity} item(s) to cart!`);
    } catch (error: unknown) {
      logger.error("Error adding to cart:", error);
      const message = error instanceof Error ? error.message : String(error);
      showError(message || "Failed to add item to cart.");
    } finally {
      setIsAddingToCart(false);
      addingToCartRef.current = false;
    }
  };

  const handleBuyNow = async () => {
    // If empowerContext is set, route through MysteryChoiceScreen first
    if (state.empowerContext) {
      navigation.navigate("MysteryChoice", { experience });
      return;
    }

    // Add current item to cart first
    const cartItem: CartItem = {
      experienceId: experience.id,
      quantity,
    };

    // Update in context
    dispatch({ type: "ADD_TO_CART", payload: cartItem });

    // If authenticated, also update in Firestore
    if (user && state.user) {
      try {
        await userService.addToCart(user.uid, cartItem);
      } catch (error: unknown) {
        logger.error("Error adding to cart:", error);
        const message = error instanceof Error ? error.message : String(error);
        showError(message || "Failed to add item to cart.");
        return;
      }
    }

    // Navigate to cart (will require auth at checkout)
    navigation.navigate("Cart");
  };

  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const increaseQuantity = () => {
    if (quantity < 10) {
      setQuantity(quantity + 1);
    }
  };

  // Calculate cart item count (from user cart or guest cart)
  const currentCart = state.user?.cart || state.guestCart || [];
  const cartItemCount = currentCart.reduce((total, item) => total + item.quantity, 0) || 0;

  const handleCartPress = () => {
    // Allow opening cart even when empty - CartScreen handles empty state
    navigation.navigate("Cart");
  };

  return (
    <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Home">
      <StatusBar style="light" />

      <ScrollView style={styles.container} bounces={false}>
        {/* Hero Image Carousel */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={[colors.overlay, "transparent"]}
            style={styles.heroGradient}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButtonHero}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft color={colors.textOnImage} size={24} />
            </TouchableOpacity>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={handleCartPress}
                style={styles.cartButtonHero}
                accessibilityRole="button"
                accessibilityLabel={`View cart, ${cartItemCount} items`}
              >
                <ShoppingCart color={colors.textOnImage} size={24} />
                {cartItemCount > 0 && (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>
                      {cartItemCount > 9 ? "9+" : cartItemCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleWishlist}
                style={styles.heartButtonHero}
                accessibilityRole="button"
                accessibilityLabel={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              >
                <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                  {isWishlisted ? (
                    <Heart fill={colors.error} color={colors.error} size={24} />
                  ) : (
                    <Heart color={colors.textOnImage} size={24} />
                  )}
                </Animated.View>
              </TouchableOpacity>
            </View>

          </LinearGradient>

          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="center"
          >
            {images.map((url, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.9}
                onPress={() => setSelectedImage(url)}
                accessibilityRole="button"
                accessibilityLabel={`View full size image ${index + 1} of ${images.length}`}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.heroImage}
                  resizeMode="cover"
                  accessibilityLabel={`${experience.title} image ${index + 1}`}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {images.length > 1 && (
            <View style={styles.dotsContainer}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    activeIndex === index ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Content Section */}
        <View style={styles.contentContainer}>
          {/* Title & Price */}
          <View style={styles.headerSection}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{experience.title}</Text>
              {experience.subtitle && (
                <Text style={styles.subtitle}>{experience.subtitle}</Text>
              )}
            </View>
            <View style={styles.priceTag}>
              <Text style={styles.priceAmount}>€{experience.price}</Text>
              <Text style={styles.priceLabel}>per person</Text>
            </View>
          </View>

          {/* Quick Info */}
          {(experience.duration || experience.location) && (
            <View style={styles.quickInfoContainer}>
              {experience.duration && (
                <View style={styles.quickInfoItem}>
                  <Clock color={colors.secondary} size={18} />
                  <Text style={styles.quickInfoText}>{experience.duration}</Text>
                </View>
              )}
              {experience.location && (
                <View style={styles.quickInfoItem}>
                  <MapPin color={colors.secondary} size={18} />
                  <Text style={styles.quickInfoText}>{experience.location}</Text>
                </View>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>What to expect</Text>
              <TouchableOpacity
                onPress={() => setShowHowItWorks(true)}
                style={styles.howItWorksButton}
                accessibilityRole="button"
                accessibilityLabel="How it works"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Info color={colors.secondary} size={18} />
              </TouchableOpacity>
            </View>
            <View style={styles.descriptionCard}>
              <Text style={styles.descriptionText}>{experience.description.trim()}</Text>
            </View>
          </View>

          {/* Location Map - RESTORED */}
          {partner?.mapsUrl && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>
              {partner.address && (
                <View style={styles.addressContainer}>
                  <MapPin color={colors.textSecondary} size={16} />
                  <Text style={styles.addressText}>{partner.address}</Text>
                </View>
              )}

              <View style={styles.mapContainer}>
                {Platform.OS === "web" ? (
                  <iframe
                    src={streetMapUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0, borderRadius: BorderRadius.md }}
                    allowFullScreen
                    loading="lazy"
                    title="Location"
                  />
                ) : (
                  <WebView
                    originWhitelist={["https://*", "https://maps.google.com/*", "https://www.google.com/*"]}
                    source={{ uri: streetMapUrl }}
                    style={styles.webview}
                    javaScriptEnabled
                    domStorageEnabled
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={styles.bottomCTA}>
        {/* Quantity Selector */}
        <View style={styles.quantityContainer}>
          <Text style={styles.quantityLabel}>Quantity:</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={[styles.quantityButton, quantity === 1 && styles.quantityButtonDisabled]}
              onPress={decreaseQuantity}
              disabled={quantity === 1}
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.quantityButtonText, quantity === 1 && styles.quantityButtonTextDisabled]}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>{quantity}</Text>
            <TouchableOpacity
              style={[styles.quantityButton, quantity === 10 && styles.quantityButtonDisabled]}
              onPress={increaseQuantity}
              disabled={quantity === 10}
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.quantityButtonText, quantity === 10 && styles.quantityButtonTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.addToCartButton, isAddingToCart && styles.buttonDisabled]}
            onPress={handleAddToCart}
            disabled={isAddingToCart}
            accessibilityRole="button"
            accessibilityLabel="Add to cart"
          >
            <Text style={styles.addToCartButtonText}>
              {isAddingToCart ? "Adding..." : "Add to Cart"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buyNowButton}
            onPress={handleBuyNow}
            accessibilityRole="button"
            accessibilityLabel="Buy now"
          >
            <Text style={styles.buyNowButtonText}>Buy Now</Text>
          </TouchableOpacity>
        </View>

      </View>

      {/* Fullscreen Image Viewer */}
      {selectedImage && (
        <ImageViewer
          visible={!!selectedImage}
          imageUri={selectedImage}
          imageUris={images.length > 1 ? images : undefined}
          initialIndex={images.length > 1 ? images.indexOf(selectedImage) : 0}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Login Prompt */}
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={closeLoginPrompt}
        message={loginMessage}
      />

      {/* How It Works Modal */}
      <HowItWorksModal
        visible={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />
    </MainScreen >
    </ErrorBoundary>
  );
}

export default ExperienceDetailsScreenInner;


const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  heroContainer: {
    position: "relative",
    height: vh(400),
    maxWidth: Platform.OS === "web" ? 800 : undefined,
    width: "100%",
    alignSelf: "center",
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 10,
  },
  backButtonHero: {
    marginTop: Platform.OS === "ios" ? 50 : 40,
    marginLeft: Spacing.xl,
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.overlayLight,
    justifyContent: "center",
    alignItems: "center",
  },
  heroImage: {
    width: Platform.OS === "web" ? Math.min(width, 800) : width,
    height: vh(400),
    backgroundColor: colors.backgroundLight,
  },
  dotsContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.xs,
    marginHorizontal: Spacing.xs,
  },
  dotActive: {
    backgroundColor: colors.white,
    width: 24,
  },
  dotInactive: {
    backgroundColor: colors.whiteAlpha40,
  },
  contentContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    marginTop: -20,
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: vh(220),
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xl,
    marginTop: Spacing.xs,

  },
  titleContainer: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  title: {
    ...Typography.display,
    fontWeight: "bold",
    color: colors.textPrimary,
    marginBottom: Spacing.xxs,
  },
  subtitle: {
    ...Typography.subheading,
    color: colors.textSecondary,
  },
  howItWorksButton: {
    width: 35,
    height: 35,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceTag: {
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  priceAmount: {
    ...Typography.heading1,
    fontWeight: "bold",
    color: colors.secondary,
  },
  priceLabel: {
    ...Typography.caption,
    color: colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  quickInfoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  headerButtons: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    right: Spacing.xl,
    flexDirection: "row",
    gap: Spacing.md,
    zIndex: 20,
  },
  cartButtonHero: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.overlayLight,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  heartButtonHero: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.overlayLight,
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: BorderRadius.sm,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    borderWidth: 2,
    borderColor: colors.white,
  },
  cartBadgeText: {
    color: colors.white,
    ...Typography.tiny,
    fontWeight: "700",
  },
  quickInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  quickInfoText: {
    ...Typography.small,
    color: colors.gray700,
    fontWeight: "500",
  },
  section: {
    marginBottom: vh(28),
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.large,
    color: colors.textPrimary,
  },
  descriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  descriptionText: {
    ...Typography.subheading,
    lineHeight: 26,
    color: colors.gray700,
    letterSpacing: 0.2,
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addressText: {
    ...Typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  mapContainer: {
    height: vh(220),
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: colors.border,
    marginBottom: Spacing.md,
  },
  webview: {
    flex: 1,
    borderRadius: BorderRadius.md,
  },
  bottomCTA: {
    position: "absolute",
    bottom: FOOTER_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    paddingBottom: Platform.OS === "ios" ? Spacing.xxxl : Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  quantityLabel: {
    ...Typography.subheading,
    fontWeight: "600",
    color: colors.gray700,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityButtonText: {
    ...Typography.large,
    color: colors.secondary,
  },
  quantityButtonTextDisabled: {
    color: colors.textMuted,
  },
  quantityValue: {
    ...Typography.heading3,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 30,
    textAlign: "center",
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  addToCartButtonText: {
    color: colors.secondary,
    ...Typography.heading3,
    fontWeight: "700",
  },
  buyNowButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  buyNowButtonText: {
    color: colors.white,
    ...Typography.heading3,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});