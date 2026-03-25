// screens/CartScreen.tsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { Plus, Minus, X, ArrowRight } from "lucide-react-native";
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
import { CartItemSkeleton } from '../../components/SkeletonLoader';
import { EmptyState } from '../../components/EmptyState';
import ErrorRetry from '../../components/ErrorRetry';
import Button from '../../components/Button';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import { MotiView } from 'moti';
import { Card } from '../../components/Card';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

type NavProp = NativeStackNavigationProp<GiverStackParamList, "Cart">;

export default function CartScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { state, dispatch } = useApp();
  const navigation = useNavigation<NavProp>();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showSuccess, showError, showInfo } = useToast();

  const [cartExperiences, setCartExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

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
    setLoadError(false);
    try {
      const list: Experience[] = [];
      const ids: string[] = [];

      for (const item of currentCart) {
        ids.push(item.experienceId);
        const exp = await experienceService.getExperienceById(item.experienceId);
        if (exp) list.push(exp);
      }

      setCartExperiences(list);
      loadedExperienceIds.current = ids;
    } catch (error) {
      logger.error('Error loading cart items:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (experienceId: string, newQty: number) => {
    if (newQty < 1) {
      return removeItem(experienceId);
    }
    if (newQty > 10) {
      showInfo("You can add up to 10 items of each experience.");
      return;
    }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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
      logger.error("Error updating quantity:", error);
      await logErrorToFirestore(error, {
        screenName: 'CartScreen',
        feature: 'UpdateQuantity',
        userId: state.user?.id,
        additionalData: { experienceId, newQty }
      });
      showError("Failed to update quantity. Please try again.");
    } finally {
      // Remove updating flag
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(experienceId);
        return newSet;
      });
    }
  };

  const removeItem = (experienceId: string) => {
    setRemoveConfirmId(experienceId);
  };

  const confirmRemoveItem = async () => {
    const experienceId = removeConfirmId;
    if (!experienceId) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setIsRemoving(true);

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

      showSuccess("Item removed from cart");
    } catch (error) {
      logger.error("Error removing item:", error);
      await logErrorToFirestore(error, {
        screenName: 'CartScreen',
        feature: 'RemoveItem',
        userId: state.user?.id,
        additionalData: { experienceId }
      });
      showError("Failed to remove item. Please try again.");
      // Reload to ensure consistency
      loadItems();
    } finally {
      setIsRemoving(false);
      setRemoveConfirmId(null);
    }
  };

  const total = currentCart.reduce((sum, item) => {
    const exp = cartExperiences.find((e) => e.id === item.experienceId);
    return exp ? sum + exp.price * item.quantity : sum;
  }, 0);

  const cartItemCount = currentCart.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const proceedToCheckout = () => {
    if (!currentCart || currentCart.length === 0) {
      showInfo("Your cart is empty. Add items to cart first.");
      return;
    }

    // Require authentication to proceed to checkout
    // Pass route name and params for post-auth navigation
    if (!requireAuth("Please log in to proceed to checkout.", "MysteryChoice", { cartItems: currentCart })) {
      return;
    }

    navigation.navigate("MysteryChoice", {
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
      <ErrorBoundary screenName="CartScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your Cart</Text>
          </View>
          <View style={styles.scrollContent}>
            <CartItemSkeleton />
            <CartItemSkeleton />
            <CartItemSkeleton />
          </View>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const isEmpty = !currentCart || currentCart.length === 0;

  return (
    <ErrorBoundary screenName="CartScreen" userId={state.user?.id}>
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

        {loadError && cartExperiences.length === 0 && (
          <ErrorRetry message="Could not load cart items" onRetry={loadItems} />
        )}

        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="🛒"
              title="Your cart is empty"
              message="Browse experiences to find the perfect gift"
              actionLabel="Keep Shopping"
              onAction={() => navigation.navigate('CategorySelection')}
            />
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
            >
              {currentCart.map((item, index) => {
                const exp = cartExperiences.find(
                  (e) => e.id === item.experienceId
                );

                if (!exp) return null;

                const imageUrl = Array.isArray(exp.imageUrl)
                  ? exp.imageUrl[0]
                  : exp.imageUrl || exp.coverImageUrl;

                const isUpdating = updatingItems.has(item.experienceId);

                return (
                  <MotiView
                    key={item.experienceId}
                    from={{ opacity: 0, translateY: 12 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 300, delay: index * 60 }}
                  >
                  <Card variant="elevated" noPadding style={styles.cartItemCard}>
                    <TouchableOpacity
                      onPress={() => handleExperiencePress(exp)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${exp.title} details`}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.cartItemImage}
                        resizeMode="cover"
                        accessibilityLabel={`${exp.title} image`}
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
                          accessibilityRole="button"
                          accessibilityLabel="Remove item from cart"
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <X size={18} color={colors.error} />
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
                            accessibilityRole="button"
                            accessibilityLabel="Decrease quantity"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Minus size={16} color={item.quantity === 1 ? colors.disabled : colors.secondary} />
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
                            accessibilityRole="button"
                            accessibilityLabel="Increase quantity"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Plus size={16} color={item.quantity === 10 ? colors.disabled : colors.secondary} />
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.cartItemPrice}>
                          €{(exp.price * item.quantity).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </Card>
                  </MotiView>
                );
              })}
            </ScrollView>

            <View style={styles.bottomContainer}>
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>€{total.toFixed(2)}</Text>
              </View>

              <Button
                title="Proceed to Checkout"
                onPress={proceedToCheckout}
                variant="primary"
                size="lg"
                fullWidth
                gradient
                icon={<ArrowRight size={20} color={colors.white} />}
                iconPosition="right"
                style={{ marginBottom: Spacing.md }}
              />

              <Button
                title="Keep Shopping"
                onPress={handleKeepShopping}
                variant="secondary"
                size="md"
                fullWidth
              />
            </View>
          </>
        )}
      </View>
    </MainScreen>
    <ConfirmationDialog
      visible={removeConfirmId !== null}
      title="Remove Item"
      message="Are you sure you want to remove this item from your cart?"
      confirmLabel="Remove"
      onConfirm={confirmRemoveItem}
      onCancel={() => setRemoveConfirmId(null)}
      variant="danger"
      loading={isRemoving}
    />
    </ErrorBoundary>
  );
}

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...Typography.display,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.huge,
  },
  cartItemCard: {
    marginBottom: Spacing.lg,
    overflow: "hidden",
    flexDirection: "row",
  },
  cartItemImage: {
    width: 120,
    height: 120,
    backgroundColor: colors.border,
  },
  cartItemContent: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: "space-between",
  },
  cartItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  cartItemTitle: {
    ...Typography.heading3,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  cartItemSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
  },
  removeButton: {
    padding: Spacing.xs,
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
    gap: Spacing.md,
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  quantityButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.xs,
    backgroundColor: colors.white,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityValue: {
    ...Typography.subheading,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  },
  cartItemPrice: {
    ...Typography.large,
    color: colors.secondary,
  },
  bottomContainer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    marginBottom: FOOTER_HEIGHT,
  },
  totalContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  totalLabel: {
    ...Typography.heading3,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  totalAmount: {
    ...Typography.heading1,
    color: colors.secondary,
  },
});