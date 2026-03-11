import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleSheet,
  View,
} from 'react-native';
import { Colors } from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import { Typography } from '../config/typography';

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
}) => {
  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: Colors.secondary,
          ...Shadows.colored(Colors.secondary),
        };
      case 'secondary':
        return {
          backgroundColor: Colors.primarySurface,
          borderWidth: 1,
          borderColor: Colors.primaryBorder,
        };
      case 'danger':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: Colors.error,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
        };
      case 'icon':
        return {
          backgroundColor: Colors.secondary,
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
        baseTextStyle.fontSize = 16;
        baseTextStyle.fontWeight = '700';
        break;
    }

    switch (variant) {
      case 'primary':
        baseTextStyle.color = Colors.white;
        break;
      case 'secondary':
        baseTextStyle.color = Colors.secondary;
        break;
      case 'danger':
        baseTextStyle.color = Colors.error;
        break;
      case 'ghost':
        baseTextStyle.color = Colors.textSecondary;
        break;
      case 'icon':
        baseTextStyle.color = Colors.white;
        break;
    }

    return baseTextStyle;
  };

  const getActivityIndicatorColor = (): string => {
    switch (variant) {
      case 'primary':
      case 'icon':
        return Colors.white;
      case 'secondary':
        return Colors.secondary;
      case 'danger':
        return Colors.error;
      case 'ghost':
        return Colors.textSecondary;
      default:
        return Colors.white;
    }
  };

  const containerStyle: ViewStyle = {
    ...styles.container,
    ...getVariantStyles(),
    ...getSizeStyles(),
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

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={activeOpacity}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: BorderRadius.md,
  },
});

export default React.memo(Button);
