// screens/CartScreen.tsx
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { Plus, Minus, X, ShoppingBag, ArrowRight } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { userService } from "../../services/userService";
import { experienceService } from "../../services/ExperienceService";
import { cartService } from "../../services/CartService";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import LoginPrompt from "../../components/LoginPrompt";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { GiverStackParamList, Experience, CartItem } from "../../types";
import { useNavigation } from "@react-navigation/native";
import MainScreen from "../MainScreen";

type NavProp = NativeStackNavigationProp<GiverStackParamList, "Cart">;

export default function CartScreen() {
  const { state, dispatch } = useApp();
  const navigation = useNavigation<NavProp>();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();

  const [cartExperiences, setCartExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  
  // Track loaded experience IDs to prevent unnecessary reloads
  const loadedExperienceIds = useRef<string[]>([]);
  
  // Get cart from user or guest cart
  const currentCart = state.user?.cart || state.guestCart || [];

  useEffect(() => {
    loadItems();
  }, []); // Only load once on mount

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

  // Watch for cart changes (additions/removals only, not quantity updates)
  useEffect(() => {
    const currentIds = currentCart.map(item => item.experienceId).sort().join(',');
    const loadedIds = loadedExperienceIds.current.sort().join(',');
    
    // Only reload if the cart items changed (not just quantities)
    if (currentIds !== loadedIds && !loading) {
      loadItems();
    }
  }, [currentCart.length]); // Only depend on cart length, not the entire cart

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

  const loadItems = async () => {
    setLoading(true);
    const list: Experience[] = [];
    const ids: string[] = [];
    
    for (const item of currentCart) {
      ids.push(item.experienceId);
      const exp = await experienceService.getExperienceById(item.experienceId);
      if (exp) list.push(exp);
    }
    
    setCartExperiences(list);
    loadedExperienceIds.current = ids;
    setLoading(false);
  };

  const updateQuantity = async (experienceId: string, newQty: number) => {
    if (newQty < 1) {
      return removeItem(experienceId);
    }
    if (newQty > 10) {
      Alert.alert("Maximum Quantity", "You can add up to 10 items of each experience.");
      return;
    }

    // Mark this item as updating
    setUpdatingItems(prev => new Set(prev).add(experienceId));

    try {
      const updated = currentCart.map((item) =>
        item.experienceId === experienceId
          ? { ...item, quantity: newQty }
          : item
      );

      // Update context immediately for instant UI feedback
      dispatch({ type: "SET_CART", payload: updated });
      
      // Update database in background if authenticated
      if (state.user) {
        await userService.updateCart(state.user.id, updated);
      }
    } catch (error) {
      console.error("Error updating quantity:", error);
      Alert.alert("Error", "Failed to update quantity. Please try again.");
    } finally {
      // Remove updating flag
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(experienceId);
        return newSet;
      });
    }
  };

  const removeItem = async (experienceId: string) => {
    // Mark as updating
    setUpdatingItems(prev => new Set(prev).add(experienceId));

    try {
      const updated = currentCart.filter(
        (item) => item.experienceId !== experienceId
      );

      // Update context immediately
      dispatch({ type: "SET_CART", payload: updated });
      
      // Remove from experiences list immediately for smooth UX
      setCartExperiences(prev => prev.filter(exp => exp.id !== experienceId));
      loadedExperienceIds.current = loadedExperienceIds.current.filter(id => id !== experienceId);
      
      // Update database in background if authenticated
      if (state.user) {
        await userService.removeFromCart(state.user.id, experienceId);
      }
    } catch (error) {
      console.error("Error removing item:", error);
      Alert.alert("Error", "Failed to remove item. Please try again.");
      // Reload to ensure consistency
      loadItems();
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(experienceId);
        return newSet;
      });
    }
  };

  const total = currentCart.reduce((sum, item) => {
    const exp = cartExperiences.find((e) => e.id === item.experienceId);
    return exp ? sum + exp.price * item.quantity : sum;
  }, 0);

  const cartItemCount = currentCart.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const proceedToCheckout = () => {
    if (!currentCart || currentCart.length === 0) {
      Alert.alert("Empty Cart", "Your cart is empty. Add items to cart first.");
      return;
    }
    
    // Require authentication to proceed to checkout
    // Pass route name and params for post-auth navigation
    if (!requireAuth("Please log in to proceed to checkout.", "ExperienceCheckout", { cartItems: currentCart })) {
      return;
    }
    
    navigation.navigate("ExperienceCheckout", {
      cartItems: currentCart,
    });
  };

  const handleKeepShopping = () => {
    navigation.navigate("CategorySelection");
  };

  const handleExperiencePress = (experience: Experience) => {
    navigation.navigate("ExperienceDetails", { experience });
  };

  if (loading) {
    return (
      <MainScreen activeRoute="Home">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </MainScreen>
    );
  }

  const isEmpty = !currentCart || currentCart.length === 0;

  return (
    <MainScreen activeRoute="Home">
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={closeLoginPrompt}
        message={loginMessage}
      />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Cart</Text>
          {!isEmpty && (
            <Text style={styles.headerSubtitle}>
              {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
            </Text>
          )}
        </View>

        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <ShoppingBag size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptySubtitle}>
              Start adding experiences to your cart to continue shopping
            </Text>
            <TouchableOpacity
              style={styles.keepShoppingButton}
              onPress={handleKeepShopping}
              activeOpacity={0.8}
            >
              <Text style={styles.keepShoppingText}>Start Shopping</Text>
              <ArrowRight size={20} color="#8b5cf6" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {currentCart.map((item) => {
                const exp = cartExperiences.find(
                  (e) => e.id === item.experienceId
                );

                if (!exp) return null;

                const imageUrl = Array.isArray(exp.imageUrl)
                  ? exp.imageUrl[0]
                  : exp.imageUrl || exp.coverImageUrl;

                const isUpdating = updatingItems.has(item.experienceId);

                return (
                  <View key={item.experienceId} style={styles.cartItemCard}>
                    <TouchableOpacity
                      onPress={() => handleExperiencePress(exp)}
                      activeOpacity={0.9}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.cartItemImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>

                    <View style={styles.cartItemContent}>
                      <View style={styles.cartItemHeader}>
                        <View style={styles.cartItemInfo}>
                          <Text style={styles.cartItemTitle} numberOfLines={2}>{exp.title}</Text>
                          {exp.subtitle && (
                            <Text style={styles.cartItemSubtitle} numberOfLines={1}>
                              {exp.subtitle}
                            </Text>
                          )}
                        </View>

                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => removeItem(item.experienceId)}
                          disabled={isUpdating}
                          activeOpacity={0.7}
                        >
                          <X size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.cartItemFooter}>
                        <View style={styles.quantityControls}>
                          <TouchableOpacity
                            style={[
                              styles.quantityButton,
                              (item.quantity === 1 || isUpdating) && styles.quantityButtonDisabled,
                            ]}
                            onPress={() => updateQuantity(item.experienceId, item.quantity - 1)}
                            disabled={item.quantity === 1 || isUpdating}
                            activeOpacity={0.7}
                          >
                            <Minus size={16} color={item.quantity === 1 ? "#d1d5db" : "#8b5cf6"} />
                          </TouchableOpacity>

                          <Text style={styles.quantityValue}>{item.quantity}</Text>

                          <TouchableOpacity
                            style={[
                              styles.quantityButton,
                              (item.quantity === 10 || isUpdating) && styles.quantityButtonDisabled,
                            ]}
                            onPress={() => updateQuantity(item.experienceId, item.quantity + 1)}
                            disabled={item.quantity === 10 || isUpdating}
                            activeOpacity={0.7}
                          >
                            <Plus size={16} color={item.quantity === 10 ? "#d1d5db" : "#8b5cf6"} />
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.cartItemPrice}>
                          €{(exp.price * item.quantity).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.bottomContainer}>
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>€{total.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={styles.checkoutButton}
                onPress={proceedToCheckout}
                activeOpacity={0.8}
              >
                <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
                <ArrowRight size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.keepShoppingButton}
                onPress={handleKeepShopping}
                activeOpacity={0.8}
              >
                <Text style={styles.keepShoppingText}>Keep Shopping</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </MainScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginTop: 24,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  cartItemCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    flexDirection: "row",
  },
  cartItemImage: {
    width: 120,
    height: 120,
    backgroundColor: "#e5e7eb",
  },
  cartItemContent: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  cartItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  cartItemTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  cartItemSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  removeButton: {
    padding: 4,
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  cartItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quantityButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: "#fff",
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    minWidth: 24,
    textAlign: "center",
  },
  cartItemPrice: {
    fontSize: 20,
    fontWeight: "700",
    color: "#8b5cf6",
  },
  bottomContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    padding: 20,
    paddingBottom: 32,
  },
  totalContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#8b5cf6",
  },
  checkoutButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    shadowColor: "#8b5cf6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  checkoutButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  keepShoppingButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#8b5cf6",
    backgroundColor: "#fff",
  },
  keepShoppingText: {
    color: "#8b5cf6",
    fontWeight: "600",
    fontSize: 16,
  },
});