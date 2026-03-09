import React, { useState, useEffect, useRef } from "react";
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Modal,
  Platform,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useRoute } from "@react-navigation/native";
import { ChevronLeft, MapPin, Clock, ShoppingCart, Info, Target } from "lucide-react-native";
import { WebView } from "react-native-webview";
import { Heart } from "lucide-react-native";
import { getAuth } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../services/firebase";
import { userService } from "../../services/userService";
import { CartItem } from "../../types";
import { useAuthGuard } from "../../hooks/useAuthGuard";
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
import Colors from '../../config/colors';
import { useToast } from '../../context/ToastContext';

const { width, height } = Dimensions.get("window");

// Zoomable Image Component (Simple version for web compatibility)
const ZoomableImage = ({ uri, onClose }: { uri: string; onClose: () => void }) => {
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.zoomModalContainer}>
        <TouchableOpacity style={styles.zoomCloseButton} onPress={onClose}>
          <Text style={styles.zoomCloseText}>✕</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.zoomScrollContent}
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={{ uri }} style={styles.zoomableImage} resizeMode="contain" />
        </ScrollView>
      </View>
    </Modal>
  );
};

function ExperienceDetailsScreenInner({ clientSecret }: { clientSecret: string }) {
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
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const auth = getAuth();
  const user = auth.currentUser;
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showSuccess, showError } = useToast();

  // Save guest cart to local storage whenever it changes
  const prevCartRef = useRef<string>('');

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
          <Text style={{ color: '#6b7280', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const images = Array.isArray(experience.imageUrl) ? experience.imageUrl : [experience.imageUrl];

  const handleScroll = (event: any) => {
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
    } catch (error) {
      logger.error("Error updating wishlist:", error);
      showError("Failed to update wishlist. Please try again.");
    }
  };

  const handleAddToCart = async () => {
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
    } catch (error: any) {
      logger.error("Error adding to cart:", error);
      showError(error.message || "Failed to add item to cart.");
    } finally{
      setIsAddingToCart(false);
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
      } catch (error: any) {
        logger.error("Error adding to cart:", error);
        showError(error.message || "Failed to add item to cart.");
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

  const handleSetAsGoal = () => {
    if (!requireAuth("Please log in to set this as a goal.")) {
      return;
    }
    navigation.navigate("ChallengeSetup", { prefill: { experience } });
  };

  return (
    <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Home">
      <StatusBar style="light" />

      <ScrollView style={styles.container} bounces={false}>
        {/* Hero Image Carousel */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={["rgba(0,0,0,0.4)", "transparent"]}
            style={styles.heroGradient}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButtonHero}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft color="#fff" size={24} />
            </TouchableOpacity>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={handleCartPress}
                style={styles.cartButtonHero}
                accessibilityRole="button"
                accessibilityLabel={`View cart, ${cartItemCount} items`}
              >
                <ShoppingCart color="#fff" size={24} />
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
                {isWishlisted ? (
                  <Heart fill="#ef4444" color="#ef4444" size={24} />
                ) : (
                  <Heart color="#fff" size={24} />
                )}
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
                  resizeMode="contain"
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
                  <Clock color={Colors.secondary} size={18} />
                  <Text style={styles.quickInfoText}>{experience.duration}</Text>
                </View>
              )}
              {experience.location && (
                <View style={styles.quickInfoItem}>
                  <MapPin color={Colors.secondary} size={18} />
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
              >
                <Info color={Colors.secondary} size={18} />
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
                  <MapPin color="#6b7280" size={16} />
                  <Text style={styles.addressText}>{partner.address}</Text>
                </View>
              )}

              <View style={styles.mapContainer}>
                {Platform.OS === "web" ? (
                  <iframe
                    src={streetMapUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0, borderRadius: 12 }}
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

        {/* Set as Goal (Free Pledge) */}
        <TouchableOpacity
          style={styles.setAsGoalButton}
          onPress={handleSetAsGoal}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Set as goal"
        >
          <Target color="#16a34a" size={20} />
          <Text style={styles.setAsGoalText}>Set as Goal</Text>
        </TouchableOpacity>
      </View>

      {/* Zoomable Image Modal */}
      {
        selectedImage && (
          <ZoomableImage uri={selectedImage} onClose={() => setSelectedImage(null)} />
        )
      }

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


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  heroContainer: {
    position: "relative",
    height: 400,
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
    marginLeft: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroImage: {
    width: Platform.OS === "web" ? Math.min(width, 800) : width,
    height: 400,
    backgroundColor: "#1f2937",
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
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 24,
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  contentContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    marginTop: 5,

  },
  titleContainer: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  howItWorksButton: {
    width: 35,
    height: 35,
    borderRadius: 16,
    backgroundColor: Colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceTag: {
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: "center",
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.secondary,
  },
  priceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  quickInfoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  headerButtons: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    right: 20,
    flexDirection: "row",
    gap: 12,
    zIndex: 20,
  },
  cartButtonHero: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  heartButtonHero: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  quickInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  quickInfoText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  section: {
    marginBottom: 28,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  descriptionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 26,
    color: "#374151",
    letterSpacing: 0.2,
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  addressText: {
    fontSize: 15,
    color: Colors.textSecondary,
    flex: 1,
  },
  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  webview: {
    flex: 1,
    borderRadius: 12,
  },
  bottomCTA: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.secondary,
  },
  quantityButtonTextDisabled: {
    color: Colors.textMuted,
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
    minWidth: 30,
    textAlign: "center",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.secondary,
  },
  addToCartButtonText: {
    color: Colors.secondary,
    fontSize: 18,
    fontWeight: "700",
  },
  buyNowButton: {
    flex: 1,
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buyNowButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  setAsGoalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1.5,
    borderColor: "#bbf7d0",
  },
  setAsGoalText: {
    color: "#16a34a",
    fontSize: 16,
    fontWeight: "700",
  },
  zoomModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomCloseText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
  },
  zoomScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomableImage: {
    width,
    height: height * 0.8,
  },
});