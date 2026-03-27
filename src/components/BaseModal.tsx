import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Animated,
  StyleSheet,
  ViewStyle,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import { useModalAnimation } from '../hooks/useModalAnimation';

export type ModalVariant = 'center' | 'bottom';

export interface BaseModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  variant?: ModalVariant;
  children: React.ReactNode;
  noPadding?: boolean;
  style?: ViewStyle;
  /** Optional overlay rendered fullscreen above the blur but below the content card. */
  overlay?: React.ReactNode;
  /** Optional overlay rendered fullscreen ABOVE the content card. Useful for confetti etc. */
  overlayAbove?: React.ReactNode;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const BaseModal = React.memo<BaseModalProps>(({
  visible,
  onClose,
  title,
  variant = 'center',
  children,
  noPadding = false,
  style,
  overlay,
  overlayAbove,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = useModalAnimation(visible, {
    initialValue: variant === 'bottom' ? SCREEN_HEIGHT : 300,
    toValue: 0,
  });

  const isBottom = variant === 'bottom';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityLabel="Dismiss modal"
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        {overlay}
        <Animated.View
          style={[
            isBottom ? styles.bottomContainer : styles.centerContainer,
            { transform: [{ translateY: slideAnim }] },
            style,
          ]}
          accessibilityViewIsModal={true}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {variant === 'bottom' && (
              <View style={styles.dragHandle}>
                <View style={styles.dragHandlePill} />
              </View>
            )}
            {title && (
              <View style={styles.header}>
                <Text style={styles.headerTitle}>{title}</Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                >
                  <X size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={!noPadding && styles.content}>
                {children}
              </View>
            </ScrollView>
          </Pressable>
        </Animated.View>
        {overlayAbove}
      </Pressable>
    </Modal>
  );
});

BaseModal.displayName = 'BaseModal';

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    centerContainer: {
      backgroundColor: colors.white,
      borderRadius: BorderRadius.xl,
      width: '90%',
      maxHeight: Platform.OS === 'android' ? '80%' : '85%',
      ...Shadows.lg,
    },
    bottomContainer: {
      backgroundColor: colors.white,
      borderTopLeftRadius: BorderRadius.xxl,
      borderTopRightRadius: BorderRadius.xxl,
      width: '100%',
      maxHeight: Platform.OS === 'android' ? '80%' : '85%',
      position: 'absolute',
      bottom: 0,
      ...Shadows.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.screenPadding,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...Typography.heading3,
      color: colors.textPrimary,
      flex: 1,
    },
    closeButton: {
      padding: Spacing.xs,
    },
    content: {
      padding: Spacing.screenPadding,
    },
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
  });
