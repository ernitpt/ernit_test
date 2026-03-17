import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react-native';
import { useToast, ToastMessage } from '../context/ToastContext';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Shadows } from '../config/shadows';
import { Spacing } from '../config/spacing';

const TOAST_CONFIG = {
  success: {
    bg: Colors.successLighter,
    border: Colors.primaryBorder,
    text: Colors.primaryDeep,
    Icon: CheckCircle,
    iconColor: Colors.primary,
  },
  error: {
    bg: Colors.errorLight,
    border: Colors.errorBorder,
    text: Colors.errorDark,
    Icon: AlertCircle,
    iconColor: Colors.error,
  },
  info: {
    bg: Colors.infoLight,
    border: Colors.info,
    text: Colors.infoDark,
    Icon: Info,
    iconColor: Colors.info,
  },
} as const;

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const config = TOAST_CONFIG[toast.type];
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
    ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}),
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
