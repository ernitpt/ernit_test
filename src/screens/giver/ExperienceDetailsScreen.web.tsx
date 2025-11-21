import React, { useState, useEffect, useRef } from "react";
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
  Alert
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { loadStripe } from "@stripe/stripe-js";
import { ChevronLeft, MapPin, Clock, ShoppingCart } from "lucide-react-native";
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

import {
  GiverStackParamList,
  Experience,
  PartnerUser,
} from "../../types";
import { useApp } from "../../context/AppContext";
import MainScreen from "../MainScreen";
import { partnerService } from "../../services/PartnerService";

const stripePromise = loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!);

const { width, height } = Dimensions.get("window");

type ExperienceDetailsNavigationProp = NativeStackNavigationProp<
  GiverStackParamList,
  "ExperienceDetails"
>;

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
  const navigation = useNavigation<ExperienceDetailsNavigationProp>();
  const route = useRoute();
  const { experience } = route.params as { experience: Experience };
  const { state, dispatch } = useApp();

  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const auth = getAuth();
  const user = auth.currentUser;
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();

  const images = Array.isArray(experience.imageUrl) ? experience.imageUrl : [experience.imageUrl];

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / slideSize);
    setActiveIndex(index);
  };

  useEffect(() => {
    const loadPartner = async () => {
      const p = await partnerService.getPartnerById(experience.partnerId);
      setPartner(p);
    };
    loadPartner();
  }, [experience.partnerId]);

  useEffect(() => {
    const loadWishlist = async () => {
      if (!user) return;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        setIsWishlisted((data.wishlist || []).includes(experience.id));
      }
    };
    loadWishlist();
  }, [user, experience.id]);

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
      console.error("Error updating wishlist:", error);
      Alert.alert("Error", "Failed to update wishlist. Please try again.");
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

      Alert.alert("Success", `Added ${quantity} item(s) to cart!`);
    } catch (error: any) {
      console.error("Error adding to cart:", error);
      Alert.alert("Error", error.message || "Failed to add item to cart.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
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
        console.error("Error adding to cart:", error);
        Alert.alert("Error", error.message || "Failed to add item to cart.");
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

  const handleCartPress = () => {
    // Allow opening cart even when empty - CartScreen handles empty state
    navigation.navigate("Cart");
  };

  return (
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
            >
              <ChevronLeft color="#fff" size={24} />
            </TouchableOpacity>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={handleCartPress}
                style={styles.cartButtonHero}
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
              >
                <Image source={{ uri: url }} style={styles.heroImage} resizeMode="cover" />
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
                  <Clock color="#8b5cf6" size={18} />
                  <Text style={styles.quickInfoText}>{experience.duration}</Text>
                </View>
              )}
              {experience.location && (
                <View style={styles.quickInfoItem}>
                  <MapPin color="#8b5cf6" size={18} />
                  <Text style={styles.quickInfoText}>{experience.location}</Text>
                </View>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What to expect</Text>
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
                    originWhitelist={["*"]}
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
            >
              <Text style={[styles.quantityButtonText, quantity === 1 && styles.quantityButtonTextDisabled]}>−</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>{quantity}</Text>
            <TouchableOpacity
              style={[styles.quantityButton, quantity === 10 && styles.quantityButtonDisabled]}
              onPress={increaseQuantity}
              disabled={quantity === 10}
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
          >
            <Text style={styles.addToCartButtonText}>
              {isAddingToCart ? "Adding..." : "Add to Cart"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buyNowButton}
            onPress={handleBuyNow}
          >
            <Text style={styles.buyNowButtonText}>Buy Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zoomable Image Modal */}
      {selectedImage && (
        <ZoomableImage uri={selectedImage} onClose={() => setSelectedImage(null)} />
      )}

      {/* Login Prompt */}
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={closeLoginPrompt}
        message={loginMessage}
      />
    </MainScreen>
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
    width,
    height: 400,
    backgroundColor: "#e5e7eb",
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
  },
  titleContainer: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
  },
  priceTag: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#8b5cf6",
  },
  priceLabel: {
    fontSize: 12,
    color: "#6b7280",
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
    backgroundColor: "#f9fafb",
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  descriptionCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    color: "#6b7280",
    flex: 1,
  },
  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
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
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#8b5cf6",
  },
  quantityButtonTextDisabled: {
    color: "#9ca3af",
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
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
    borderColor: "#8b5cf6",
  },
  addToCartButtonText: {
    color: "#8b5cf6",
    fontSize: 18,
    fontWeight: "700",
  },
  buyNowButton: {
    flex: 1,
    backgroundColor: "#8b5cf6",
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