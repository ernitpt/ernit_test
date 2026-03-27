import React, { useRef, useCallback, useMemo } from 'react';
import {
  Animated,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleSheet,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import { Typography } from '../config/typography';
import { Animations } from '../config/animations';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
  activeOpacity?: number;
  fullWidth?: boolean;
  gradient?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  title,
  onPress,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  activeOpacity = 0.8,
  fullWidth = false,
  gradient = false,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      ...Animations.springs.bouncy,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      ...Animations.springs.bouncy,
    }).start();
  }, [scaleAnim]);

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: colors.primary,
          ...Shadows.colored(colors.primary),
        };
      case 'secondary':
        return {
          backgroundColor: colors.primarySurface,
          borderWidth: 1,
          borderColor: colors.primaryBorder,
        };
      case 'danger':
        return {
          backgroundColor: colors.error,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
        };
      case 'icon':
        return {
          backgroundColor: colors.primary,
          width: 44,
          height: 44,
          borderRadius: BorderRadius.circle,
        };
      default:
        return {};
    }
  };

  const getSizeStyles = (): ViewStyle => {
    if (variant === 'icon') {
      return {};
    }

    switch (size) {
      case 'sm':
        return {
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.lg,
        };
      case 'md':
        return {
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.xl,
        };
      case 'lg':
        return {
          paddingVertical: Spacing.lg,
          paddingHorizontal: Spacing.xxl,
        };
      default:
        return {};
    }
  };

  const getTextStyles = (): TextStyle => {
    const baseTextStyle: TextStyle = {};

    switch (size) {
      case 'sm':
        Object.assign(baseTextStyle, Typography.smallBold);
        break;
      case 'md':
        Object.assign(baseTextStyle, Typography.bodyBold);
        break;
      case 'lg':
        Object.assign(baseTextStyle, Typography.subheading, { fontWeight: '700' as const });
        break;
    }

    switch (variant) {
      case 'primary':
        baseTextStyle.color = colors.white;
        break;
      case 'secondary':
        baseTextStyle.color = colors.primaryDark;
        break;
      case 'danger':
        baseTextStyle.color = colors.white;
        break;
      case 'ghost':
        baseTextStyle.color = colors.textSecondary;
        break;
      case 'icon':
        baseTextStyle.color = colors.white;
        break;
    }

    return baseTextStyle;
  };

  const getActivityIndicatorColor = (): string => {
    switch (variant) {
      case 'primary':
      case 'icon':
        return colors.white;
      case 'secondary':
        return colors.primaryDark;
      case 'danger':
        return colors.white;
      case 'ghost':
        return colors.textSecondary;
      default:
        return colors.white;
    }
  };

  const useGradient = gradient && (variant === 'primary' || variant === 'icon');

  const containerStyle: ViewStyle = {
    ...styles.container,
    ...getVariantStyles(),
    ...(useGradient ? {} : getSizeStyles()),
    ...(useGradient && { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 }),
    ...(fullWidth && { width: '100%' }),
    ...(disabled && { opacity: 0.5 }),
    ...style,
  };

  const finalTextStyle: TextStyle = {
    ...getTextStyles(),
    ...textStyle,
  };

  const renderContent = () => {
    if (loading) {
      return <ActivityIndicator color={getActivityIndicatorColor()} />;
    }

    if (variant === 'icon') {
      return icon;
    }

    const textElement = title ? (
      <Text style={finalTextStyle}>{title}</Text>
    ) : null;

    if (!icon) {
      return textElement;
    }

    if (iconPosition === 'right') {
      return (
        <>
          {textElement}
          {icon}
        </>
      );
    }

    return (
      <>
        {icon}
        {textElement}
      </>
    );
  };

  const content = renderContent();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      <Animated.View style={[containerStyle, { transform: [{ scale: scaleAnim }] }]}>
        {useGradient ? (
          <LinearGradient
            colors={colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.gradientInner, getSizeStyles(), variant === 'icon' && styles.gradientIcon]}
          >
            {content}
          </LinearGradient>
        ) : (
          content
        )}
      </Animated.View>
    </Pressable>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
    },
    gradientInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      width: '100%',
    },
    gradientIcon: {
      width: 44,
      height: 44,
      paddingVertical: 0,
      paddingHorizontal: 0,
      borderRadius: BorderRadius.circle,
    },
  });

export default React.memo(Button);
