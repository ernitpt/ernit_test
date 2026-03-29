import React, { useState, useMemo } from 'react';
import {
  View,
  TextInput as RNTextInput,
  Text,
  ViewStyle,
  TextStyle,
  StyleSheet,
  TextInputProps as RNTextInputProps,
} from 'react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Typography } from '../config/typography';

export interface TextInputProps extends Omit<RNTextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  success?: boolean;
  successText?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export const TextInput = React.memo<TextInputProps>(({
  label,
  error,
  helperText,
  disabled = false,
  leftIcon,
  rightIcon,
  success,
  successText,
  containerStyle,
  inputStyle,
  ...inputProps
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : success
      ? colors.successBorder
      : isFocused
        ? colors.secondary
        : colors.border;

  const borderWidth = error || success || isFocused ? 1.5 : 1;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          { borderColor, borderWidth },
          disabled && styles.disabled,
        ]}
      >
        {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}
        <RNTextInput
          {...inputProps}
          editable={!disabled}
          accessibilityLabel={inputProps.accessibilityLabel || label}
          accessibilityState={{ disabled }}
          style={[
            styles.input,
            leftIcon && styles.inputWithIcon,
            rightIcon && styles.inputWithRightIcon,
            inputProps.multiline && styles.multiline,
            inputStyle,
          ]}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setIsFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            inputProps.onBlur?.(e);
          }}
        />
        {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {!error && success && successText && <Text style={styles.successText}>{successText}</Text>}
      {!error && !success && helperText && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
});

TextInput.displayName = 'TextInput';

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    container: {
      marginBottom: 0,
    },
    label: {
      ...Typography.smallBold,
      color: colors.textPrimary,
      marginBottom: Spacing.xs,
    } as TextStyle,
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
    },
    iconContainer: {
      paddingLeft: Spacing.md,
    },
    rightIconContainer: {
      paddingRight: Spacing.md,
    },
    input: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
    } as TextStyle,
    inputWithIcon: {
      paddingLeft: Spacing.sm,
    },
    inputWithRightIcon: {
      paddingRight: Spacing.sm,
    },
    multiline: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    disabled: {
      backgroundColor: colors.backgroundLight,
      opacity: 0.6,
    },
    errorText: {
      ...Typography.caption,
      color: colors.error,
      marginTop: Spacing.xs,
    } as TextStyle,
    successText: {
      ...Typography.caption,
      color: colors.successText,
      marginTop: Spacing.xs,
    } as TextStyle,
    helperText: {
      ...Typography.caption,
      color: colors.textMuted,
      marginTop: Spacing.xs,
    } as TextStyle,
  });
