import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/helpers';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/CustomTabBar';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
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

import {
  Experience,
  PartnerUser,
} from "../../types";
import { useGiverNavigation } from "../../types/navigation";
import { useApp } from "../../context/AppContext";
import { partnerService } from "../../services/PartnerService";
import { logger } from '../../utils/logger';
import { vh } from '../../utils/responsive';
import { getUserMessage } from '../../utils/AppError';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import { analyticsService } from '../../services/AnalyticsService';
import ImageViewer from '../../components/ImageViewer';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ExperienceDetailsScreenInner({ clientSecret }: { clientSecret: string }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { width: winWidth } = useWindowDimensions();
  const isMobile = winWidth < 480;
  const styles = useMemo(() => createStyles(colors, isMobile, winWidth), [colors, isMobile, winWidth]);
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
  const outerScrollRef = useRef<ScrollView>(null);
  const [mapTouching, setMapTouching] = useState(false);
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
    if (experience?.id) {
      analyticsService.trackEvent('experience_viewed', 'conversion', {
        experienceId: experience.id,
        experienceTitle: experience.title,
        experienceCategory: experience.category,
        experiencePrice: experience.price,
      }, 'ExperienceDetailsScreen');
    }
  }, [experience?.id]);

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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>{t('giver.experienceDetails.redirecting')}</Text>
        </View>
      </ErrorBoundary>
    );
  }

  const images = Array.isArray(experience.imageUrl) ? experience.imageUrl : [experience.imageUrl];

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / slideSize);
    setActiveIndex(index);
  }, []);

  const streetMapUrl = partner?.mapsUrl
    ? partner.mapsUrl.includes("?")
      ? `${partner.mapsUrl}&layer=`
      : `${partner.mapsUrl}?layer=`
    : "";

  const toggleWishlist = async () => {
    if (!requireAuth(t('loginPrompt.accessWishlist'))) {
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
      showError(t('giver.experienceDetails.toast.wishlistFailed'));
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

      showSuccess(t('giver.experienceDetails.toast.addedToCart', { count: quantity }));
      analyticsService.trackEvent('add_to_cart', 'conversion', {
        experienceId: experience.id,
        experienceTitle: experience.title,
        experiencePrice: experience.price,
        quantity,
      }, 'ExperienceDetailsScreen');
    } catch (error: unknown) {
      logger.error("Error adding to cart:", error);
      showError(getUserMessage(error, t('giver.experienceDetails.toast.cartFailed')));
    } finally {
      setIsAddingToCart(false);
      addingToCartRef.current = false;
    }
  };

  const handleBuyNow = async () => {
    // If empowerContext is set for someone else's goal, route through MysteryChoiceScreen
    const isSelfEmpower = state.empowerContext?.userId === state.user?.id;
    if (state.empowerContext && !isSelfEmpower) {
      navigation.navigate("MysteryChoice", { experience });
      return;
    }

    // Self-purchase (with or without empowerContext): go straight to checkout
    if (state.empowerContext && isSelfEmpower) {
      navigation.navigate("ExperienceCheckout", {
        cartItems: [{ experienceId: experience.id, quantity: 1 }],
        goalId: state.empowerContext.goalId,
      });
      return;
    }

    // Normal purchase (no empowerContext): add to cart
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
        showError(getUserMessage(error, t('giver.experienceDetails.toast.cartFailed')));
        return;
      }
    }

    // Navigate to cart (will require auth at checkout)
    navigation.navigate("Cart");
  };

  const decreaseQuantity = useCallback(() => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  }, [quantity]);

  const increaseQuantity = useCallback(() => {
    if (quantity < 10) {
      setQuantity(quantity + 1);
    }
  }, [quantity]);

  // Calculate cart item count (from user cart or guest cart)
  const currentCart = state.user?.cart || state.guestCart || [];
  const cartItemCount = useMemo(() => currentCart.reduce((total, item) => total + item.quantity, 0) || 0, [currentCart]);

  const handleCartPress = useCallback(() => {
    // Allow opening cart even when empty - CartScreen handles empty state
    navigation.navigate("Cart");
  }, [navigation]);

  return (
    <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
      <StatusBar style="light" />
      <View style={styles.screenWrapper}>

      <ScrollView ref={outerScrollRef} style={styles.container} bounces={false} scrollEnabled={!mapTouching}>
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
              accessibilityLabel={t('giver.experienceDetails.accessibility.goBack')}
            >
              <ChevronLeft color={colors.textOnImage} size={24} />
            </TouchableOpacity>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={handleCartPress}
                style={styles.cartButtonHero}
                accessibilityRole="button"
                accessibilityLabel={t('giver.experienceDetails.accessibility.viewCart', { count: cartItemCount })}
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
                accessibilityLabel={isWishlisted ? t('giver.experienceDetails.accessibility.removeFromWishlist') : t('giver.experienceDetails.accessibility.addToWishlist')}
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
            snapToInterval={winWidth}
            snapToAlignment="center"
          >
            {images.map((url, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.9}
                onPress={() => setSelectedImage(url)}
                accessibilityRole="button"
                accessibilityLabel={t('giver.experienceDetails.accessibility.viewImage', { index: index + 1, total: images.length })}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.heroImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  accessibilityLabel={t('giver.experienceDetails.accessibility.image', { title: experience.title, index: index + 1 })}
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
              <Text style={styles.priceAmount}>{formatCurrency(experience.price)}</Text>
              <Text style={styles.priceLabel}>{t('giver.experienceDetails.perPerson')}</Text>
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
              <Text style={styles.sectionTitle}>{t('giver.experienceDetails.whatToExpect')}</Text>
              <TouchableOpacity
                onPress={() => setShowHowItWorks(true)}
                style={styles.howItWorksButton}
                accessibilityRole="button"
                accessibilityLabel={t('giver.experienceDetails.accessibility.howItWorks')}
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
              <Text style={styles.sectionTitle}>{t('giver.experienceDetails.location')}</Text>
              {partner.address && (
                <View style={styles.addressContainer}>
                  <MapPin color={colors.textSecondary} size={16} />
                  <Text style={styles.addressText}>{partner.address}</Text>
                </View>
              )}

              <View
                style={styles.mapContainer}
                onTouchStart={Platform.OS === 'android' ? () => setMapTouching(true) : undefined}
                onTouchEnd={Platform.OS === 'android' ? () => setMapTouching(false) : undefined}
                onTouchCancel={Platform.OS === 'android' ? () => setMapTouching(false) : undefined}
              >
                {Platform.OS === "web" ? (
                  <iframe
                    src={streetMapUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0, borderRadius: BorderRadius.md }}
                    allowFullScreen
                    loading="lazy"
                    title={t('experience.locationIframeTitle')}
                  />
                ) : (
                  <WebView
                    originWhitelist={["*"]}
                    source={{
                      html: `<!DOCTYPE html><html style="height:100%;margin:0"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><iframe src="${streetMapUrl}" allowfullscreen loading="lazy"></iframe></body></html>`,
                    }}
                    style={styles.webview}
                    javaScriptEnabled
                    domStorageEnabled
                    nestedScrollEnabled
                    overScrollMode="never"
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={[styles.bottomCTA, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.lg }]}>
        {/* Quantity Selector */}
        <View style={styles.quantityContainer}>
          <Text style={styles.quantityLabel}>{t('giver.experienceDetails.quantity')}</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={[styles.quantityButton, quantity === 1 && styles.quantityButtonDisabled]}
              onPress={decreaseQuantity}
              disabled={quantity === 1}
              accessibilityRole="button"
              accessibilityLabel={t('giver.experienceDetails.accessibility.decreaseQuantity')}
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
              accessibilityLabel={t('giver.experienceDetails.accessibility.increaseQuantity')}
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
            accessibilityLabel={t('giver.experienceDetails.accessibility.addToCart')}
          >
            <Text style={styles.addToCartButtonText}>
              {isAddingToCart ? t('giver.experienceDetails.adding') : t('giver.experienceDetails.addToCart')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buyNowButton}
            onPress={handleBuyNow}
            accessibilityRole="button"
            accessibilityLabel={t('giver.experienceDetails.accessibility.buyNow')}
          >
            <Text style={styles.buyNowButtonText}>{t('giver.experienceDetails.buyNow')}</Text>
          </TouchableOpacity>
        </View>

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
    </ErrorBoundary>
  );
}

export default ExperienceDetailsScreenInner;


const createStyles = (colors: typeof Colors, isMobile: boolean, winWidth: number) => StyleSheet.create({
  screenWrapper: {
    flex: 1,
    flexDirection: "column",
    marginBottom: FOOTER_HEIGHT,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  heroContainer: {
    position: "relative",
    height: isMobile ? vh(220) : vh(400),
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
    width: Platform.OS === "web" ? Math.min(winWidth, 800) : winWidth,
    height: isMobile ? vh(220) : vh(400),
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
    paddingTop: isMobile ? Spacing.xl : Spacing.xxl,
    paddingHorizontal: isMobile ? Spacing.lg : Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: isMobile ? Spacing.md : Spacing.xl,
    marginTop: Spacing.xs,

  },
  titleContainer: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  title: {
    ...(isMobile ? Typography.heading2 : Typography.display),
    fontWeight: "bold",
    color: colors.textPrimary,
    marginBottom: Spacing.xxs,
  },
  subtitle: {
    ...(isMobile ? Typography.body : Typography.subheading),
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
    paddingHorizontal: isMobile ? Spacing.md : Spacing.lg,
    paddingVertical: isMobile ? Spacing.xxs : Spacing.xs,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  priceAmount: {
    ...(isMobile ? Typography.heading3 : Typography.heading1),
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
    marginBottom: isMobile ? Spacing.lg : Spacing.xxl,
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
    marginBottom: isMobile ? vh(18) : vh(28),
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...(isMobile ? Typography.subheading : Typography.large),
    color: colors.textPrimary,
  },
  descriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: isMobile ? Spacing.sm : Spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  descriptionText: {
    ...(isMobile ? Typography.body : Typography.subheading),
    lineHeight: isMobile ? 22 : 26,
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
    height: isMobile ? vh(160) : vh(220),
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: colors.border,
    marginBottom: Spacing.md,
  },
  webview: {
    flex: 1,
  },
  bottomCTA: {
    backgroundColor: colors.white,
    paddingHorizontal: isMobile ? Spacing.lg : Spacing.xl,
    paddingVertical: isMobile ? Spacing.md : Spacing.lg,
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
    marginBottom: isMobile ? Spacing.sm : Spacing.md,
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
    width: isMobile ? 32 : 40,
    height: isMobile ? 32 : 40,
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
    ...(isMobile ? Typography.subheading : Typography.heading3),
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
    paddingVertical: isMobile ? Spacing.md : Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  addToCartButtonText: {
    color: colors.secondary,
    ...(isMobile ? Typography.subheading : Typography.heading3),
    fontWeight: "700",
  },
  buyNowButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingVertical: isMobile ? Spacing.md : Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  buyNowButtonText: {
    color: colors.white,
    ...(isMobile ? Typography.subheading : Typography.heading3),
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});