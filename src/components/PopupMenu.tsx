import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
import { MoreVertical } from 'lucide-react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';

export interface PopupMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface PopupMenuProps {
  items: PopupMenuItem[];
  triggerSize?: number;
  accessibilityLabel?: string;
}

// Estimated menu dimensions for clamping — keeps popup on-screen
const MENU_HEIGHT = 200;
const MENU_WIDTH = 160;

export const PopupMenu = React.memo<PopupMenuProps>(({
  items,
  triggerSize = 18,
  accessibilityLabel = 'More options',
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const triggerRef = React.useRef<View>(null);
  const isMounted = useRef(true);

  useEffect(() => () => { isMounted.current = false; }, []);

  const openMenu = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      if (!isMounted.current) return;
      setTriggerPosition({ x, y, width, height });
      setVisible(true);
    });
  }, []);

  const closeMenu = useCallback(() => {
    setVisible(false);
  }, []);

  const handleItemPress = useCallback((item: PopupMenuItem) => {
    if (item.disabled) return;
    closeMenu();
    // Small delay so the menu closes before the action fires (e.g. opening a dialog)
    setTimeout(() => item.onPress(), 100);
  }, [closeMenu]);

  return (
    <MotiView
      from={{ opacity: 0, scale: 0.85, translateY: -4 }}
      animate={{ opacity: 1, scale: 1, translateY: 0 }}
      exit={{ opacity: 0, scale: 0.85, translateY: -4 }}
      transition={{ type: 'timing', duration: 150 }}
    >
    <View ref={triggerRef} collapsable={false}>
      <TouchableOpacity
        onPress={openMenu}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        style={styles.trigger}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        <MoreVertical size={triggerSize} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <AnimatePresence>
            {visible && (
              <MotiView
                key="popup-menu"
                from={{ opacity: 0, scale: 0.85, translateY: -4 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                exit={{ opacity: 0, scale: 0.85, translateY: -4 }}
                transition={{ type: 'timing', duration: 150 }}
                style={[
                  styles.dropdown,
                  (() => {
                    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
                    const rawTop = triggerPosition.y + triggerPosition.height + 4;
                    const rawLeft = Math.max(8, triggerPosition.x - 140 + triggerPosition.width);
                    const clampedTop = Math.min(rawTop, SCREEN_HEIGHT - MENU_HEIGHT - 20);
                    const clampedLeft = Math.min(rawLeft, SCREEN_WIDTH - MENU_WIDTH - 20);
                    return { top: clampedTop, left: clampedLeft };
                  })(),
                ]}
              >
                {items.map((item, index) => (
                  <React.Fragment key={item.key}>
                    {index > 0 && <View style={styles.divider} />}
                    <TouchableOpacity
                      style={[styles.menuItem, item.disabled && styles.menuItemDisabled]}
                      onPress={() => handleItemPress(item)}
                      disabled={item.disabled}
                      accessibilityLabel={item.label}
                      accessibilityRole="menuitem"
                    >
                      {item.icon && item.icon}
                      <Text
                        style={[
                          styles.menuText,
                          item.variant === 'danger' && !item.disabled && { color: colors.error },
                          item.disabled && { color: colors.textMuted },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </MotiView>
            )}
          </AnimatePresence>
        </Pressable>
      </Modal>
    </View>
    </MotiView>
  );
});

PopupMenu.displayName = 'PopupMenu';

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  trigger: {
    padding: Spacing.sm,
  },
  backdrop: {
    flex: 1,
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderRadius: BorderRadius.md,
    ...Shadows.lg,
    zIndex: 1000,
    minWidth: 160,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuText: {
    ...Typography.small,
    color: colors.gray700,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.backgroundLight,
  },
});

export default React.memo(PopupMenu);
