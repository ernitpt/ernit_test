import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react-native';
import { useToast, ToastMessage } from '../context/ToastContext';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Shadows } from '../config/shadows';
import { Spacing } from '../config/spacing';

const getToastConfig = (colors: typeof Colors) => ({
  success: {
    bg: colors.successLighter,
    border: colors.primaryBorder,
    text: colors.primaryDeep,
    Icon: CheckCircle,
    iconColor: colors.primary,
  },
  error: {
    bg: colors.errorLight,
    border: colors.errorBorder,
    text: colors.errorDark,
    Icon: AlertCircle,
    iconColor: colors.error,
  },
  info: {
    bg: colors.infoLight,
    border: colors.info,
    text: colors.infoDark,
    Icon: Info,
    iconColor: colors.info,
  },
  warning: {
    bg: colors.warningLighter,
    border: colors.warningBorder,
    text: colors.warningDark,
    Icon: AlertTriangle,
    iconColor: colors.warning,
  },
} as const);

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const colors = useColors();
  const toastConfig = useMemo(() => getToastConfig(colors), [colors]);
  const config = toastConfig[toast.type];
  const IconComponent = config.Icon;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <MotiView
      from={{ opacity: 0, translateY: -20, scale: 0.95 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      exit={{ opacity: 0, translateY: -20, scale: 0.95 }}
      transition={{ type: 'timing', duration: 250 }}
      style={[
        styles.toast,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
        },
      ]}
    >
      <IconComponent size={20} color={config.iconColor} />
      <Text style={[styles.message, { color: config.text }]} numberOfLines={2}>
        {toast.message}
      </Text>
      <TouchableOpacity
        onPress={() => onDismiss(toast.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <X size={16} color={config.text} />
      </TouchableOpacity>
    </MotiView>
  );
};

const ToastOverlay: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={[styles.overlay, { top: insets.top + 8 }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <AnimatePresence>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </AnimatePresence>
    </View>
  );
};

export default ToastOverlay;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    ...(Platform.OS === 'web' ? { position: 'fixed' as 'absolute' } : {}),
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    ...Shadows.md,
  },
  message: {
    flex: 1,
    ...Typography.small,
    fontWeight: '500',
  },
});
