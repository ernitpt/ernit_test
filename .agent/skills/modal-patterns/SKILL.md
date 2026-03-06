---
name: modal-patterns
description: Enforces consistent modal structure, styling, and behavior across the Ernit app. Use whenever creating, modifying, or reviewing any modal or bottom sheet component.
---

# Modal Patterns

## Overview

The Ernit app uses a consistent modal system built on React Native `<Modal>`. Every modal — whether a centered dialog or a bottom sheet — must follow the patterns in this file. All styling must use design tokens from `src/config/` (Colors, Typography, Spacing, BorderRadius, Shadows).

**Announce at start:** "I'm using the modal-patterns skill to ensure consistent modal structure and behavior."

## Reference Files

| File | Role |
|------|------|
| `src/styles/commonStyles.ts` | Shared `modalOverlay` style |
| `src/components/EmpowerChoiceModal.tsx` | Centered dialog (choice modal) |
| `src/components/MotivationModal.tsx` | Input modal with success feedback |
| `src/components/ReactionViewerModal.tsx` | Bottom sheet with tabs + skeleton loading |
| `src/components/CommentModal.tsx` | Bottom sheet with keyboard-aware input |
| `src/hooks/useModalAnimation.ts` | Shared slide animation hook for bottom sheets |

---

## 1. Standard Modal Structure

Every modal **must** use this skeleton. No exceptions.

```tsx
import { Modal, TouchableOpacity, View, StyleSheet } from 'react-native';
import { commonStyles } from '../styles/commonStyles';

<Modal
  visible={visible}
  transparent
  animationType="fade"
  onRequestClose={onClose}
>
  {/* Backdrop — tapping dismisses the modal */}
  <TouchableOpacity
    style={commonStyles.modalOverlay}
    activeOpacity={1}
    onPress={onClose}
  >
    {/* Card container */}
    <View style={styles.modal}>
      {/* Propagation blocker — prevents dismiss when tapping content */}
      <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
        {/* Modal content goes here */}
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
</Modal>
```

### Key Rules

- `transparent` and `animationType="fade"` are mandatory on every `<Modal>`.
- Always pass `onRequestClose={onClose}` for Android back button support.
- The backdrop uses `commonStyles.modalOverlay` from `src/styles/commonStyles.ts`:
  ```tsx
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  }
  ```
- The inner `<TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>` prevents taps on the card from bubbling up to the backdrop dismiss handler.

### Bottom Sheet Variant

For bottom sheets (CommentModal, ReactionViewerModal), override overlay alignment and use `useModalAnimation`:

```tsx
import { useModalAnimation } from '../hooks/useModalAnimation';

const slideAnim = useModalAnimation(visible);

<TouchableOpacity
  style={[commonStyles.modalOverlay, { justifyContent: 'flex-end' }]}
  activeOpacity={1}
  onPress={onClose}
>
  <Animated.View
    style={[
      styles.modalContainer,
      { transform: [{ translateY: slideAnim }] },
    ]}
  >
    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
      {/* Bottom sheet content */}
    </TouchableOpacity>
  </Animated.View>
</TouchableOpacity>
```

Bottom sheet container style:
```tsx
modalContainer: {
  backgroundColor: Colors.white,
  borderTopLeftRadius: BorderRadius.xxl,
  borderTopRightRadius: BorderRadius.xxl,
  maxHeight: '80%',
  paddingBottom: Spacing.screenPadding,
  ...Shadows.lg,
}
```

---

## 2. Modal Card Styling

Standard centered dialog card:

```tsx
modal: {
  backgroundColor: Colors.white,
  borderRadius: BorderRadius.xl,
  width: '90%',
  maxWidth: 360,
  padding: Spacing.sectionGap,
  ...Shadows.lg,
}
```

Rules:
- Never hardcode `backgroundColor: '#fff'` -- use `Colors.white`.
- Never hardcode `borderRadius: 20` -- use `BorderRadius.xl`.
- Never hardcode `padding: 24` -- use `Spacing.sectionGap`.
- Never define shadows inline -- use `...Shadows.lg`.
- Max width is always `360` for centered dialogs.

---

## 3. Title + Subtitle Pattern

Standard header for modals:

```tsx
title: {
  ...Typography.heading3,
  color: Colors.textPrimary,
  marginBottom: Spacing.xxs,
},
subtitle: {
  ...Typography.small,
  color: Colors.textSecondary,
  marginBottom: Spacing.cardPadding,
},
```

Usage:
```tsx
<Text style={styles.title}>Gift an Experience</Text>
<Text style={styles.subtitle}>Celebrate {userName}'s progress</Text>
```

Rules:
- Title uses `Typography.heading3` (18px, weight 700), never raw `fontSize: 20`.
- Subtitle uses `Typography.small` (14px), never raw `fontSize: 14`.
- Colors must be `Colors.textPrimary` and `Colors.textSecondary`, never hex literals.

---

## 4. Close / Cancel Button

Standard close button with 44pt minimum touch target:

```tsx
import { X } from 'lucide-react-native';

<TouchableOpacity
  style={styles.closeButton}
  onPress={onClose}
  accessibilityLabel="Close"
  accessibilityRole="button"
>
  <X size={20} color={Colors.textMuted} />
</TouchableOpacity>
```

Style:
```tsx
closeButton: {
  position: 'absolute',
  top: Spacing.md,
  right: Spacing.md,
  width: 44,
  height: 44,
  justifyContent: 'center',
  alignItems: 'center',
},
```

Rules:
- Touch target must be at least 44x44 points (Apple HIG / WCAG).
- Icon size is `20` (smaller than touch target -- that is intentional).
- Icon color is `Colors.textMuted`, never a hex literal.
- `accessibilityLabel="Close"` and `accessibilityRole="button"` are mandatory.

For inline cancel buttons (text style):
```tsx
<TouchableOpacity style={styles.cancelButton} onPress={onClose}>
  <Text style={styles.cancelText}>Cancel</Text>
</TouchableOpacity>
```
```tsx
cancelButton: {
  alignItems: 'center',
  paddingVertical: Spacing.sm,
},
cancelText: {
  ...Typography.small,
  color: Colors.textMuted,
  fontWeight: '500',
},
```

---

## 5. Loading State in Modals

**CLAUDE.md mandate:** All loading states must use skeleton loaders. Never use `<ActivityIndicator>`.

For loading content inside a modal:
```tsx
import { SkeletonBox } from '../components/SkeletonLoader';

{loading ? (
  <View style={{ gap: Spacing.listItemGap }}>
    {[1, 2, 3].map((i) => (
      <SkeletonBox key={i} width="100%" height={48} borderRadius={BorderRadius.md} />
    ))}
  </View>
) : (
  /* actual content */
)}
```

For submit buttons in a loading/sending state, use reduced opacity instead of a spinner:
```tsx
<TouchableOpacity
  style={[
    styles.sendButton,
    (sending || !isValid) && { opacity: 0.5 },
  ]}
  disabled={sending || !isValid}
>
  <Text style={styles.sendText}>
    {sending ? 'Sending...' : 'Send'}
  </Text>
</TouchableOpacity>
```

Pre-built skeletons are available for common patterns:
```tsx
import { ReactionSkeleton, CommentSkeleton } from '../components/SkeletonLoader';
```

---

## 6. Success Feedback Pattern

After an async action succeeds inside a modal, show an inline animated success state, then auto-close.

```tsx
import { CheckCircle } from 'lucide-react-native';
import { MotiView } from 'moti';

const [showSuccess, setShowSuccess] = useState(false);

// After successful async action:
setShowSuccess(true);
setTimeout(() => {
  setShowSuccess(false);
  onClose();
  onSent?.();
}, 1500);
```

JSX:
```tsx
{showSuccess ? (
  <MotiView
    from={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: 'spring', damping: 15 }}
    style={styles.successContainer}
  >
    <CheckCircle color={Colors.secondary} size={48} />
    <Text style={styles.successText}>Message sent!</Text>
    <Text style={styles.successSubtext}>
      {recipientName} will see it in their next session
    </Text>
  </MotiView>
) : (
  /* normal form content */
)}
```

Styles:
```tsx
successContainer: {
  alignItems: 'center',
  paddingVertical: Spacing.sectionGap,
  gap: Spacing.listItemGap,
},
successText: {
  ...Typography.heading3,
  color: Colors.textPrimary,
},
successSubtext: {
  ...Typography.small,
  color: Colors.textSecondary,
  textAlign: 'center',
},
```

Rules:
- Always use `MotiView` (preferred) or `Animated.View` with scale + opacity animation.
- Icon is `CheckCircle` from `lucide-react-native`, color `Colors.secondary`, size `48`.
- Auto-close delay is `1500ms`.
- Success text uses `Typography.heading3`, subtext uses `Typography.small`.

---

## 7. Input Modal Pattern

For modals containing text input (like MotivationModal), follow this pattern:

```tsx
<TextInput
  style={styles.input}
  placeholder="You've got this! Keep going..."
  placeholderTextColor={Colors.textMuted}
  value={text}
  onChangeText={setText}
  multiline
  maxLength={500}
  autoFocus
  accessibilityLabel="Enter your message"
/>
<Text style={styles.charCount}>
  {text.length}/500
</Text>
```

Styles:
```tsx
input: {
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: BorderRadius.md,
  paddingHorizontal: Spacing.cardPadding,
  paddingVertical: Spacing.listItemGap,
  ...Typography.body,
  backgroundColor: Colors.backgroundSecondary,
  minHeight: 100,
  textAlignVertical: 'top',
},
charCount: {
  ...Typography.caption,
  color: Colors.textMuted,
  textAlign: 'right',
  marginTop: Spacing.xxs,
  marginBottom: Spacing.cardPadding,
},
```

Button row for input modals:
```tsx
buttons: {
  flexDirection: 'row',
  gap: Spacing.sm,
},
cancelButton: {
  flex: 1,
  paddingVertical: Spacing.listItemGap,
  borderRadius: BorderRadius.md,
  backgroundColor: Colors.backgroundSecondary,
  alignItems: 'center',
},
sendButton: {
  flex: 1,
  paddingVertical: Spacing.listItemGap,
  borderRadius: BorderRadius.md,
  backgroundColor: Colors.secondary,
  alignItems: 'center',
},
```

Rules:
- Send button is disabled (opacity 0.5) when text is empty or while sending.
- Character count is always visible, using `Typography.caption` + `Colors.textMuted`.
- `autoFocus` on the TextInput when the modal opens (if the modal's primary action is text entry).
- For bottom sheets with input, wrap content in `KeyboardAvoidingView`:
  ```tsx
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{ flex: 1 }}
  >
  ```

---

## 8. Props Convention

Every modal component must accept these base props:

```tsx
interface MyModalProps {
  visible: boolean;
  onClose: () => void;
  // Additional callback props:
  onSent?: () => void;       // for message/motivation modals
  onChange?: () => void;      // for comment/edit modals
  onConfirm?: () => void;    // for confirmation dialogs
}
```

Rules:
- `visible` and `onClose` are **always required**.
- Callback props for async results use descriptive names: `onSent`, `onChange`, `onConfirm`, `onSelect`.
- Never use generic names like `onDone` or `callback`.
- Type the component as `React.FC<MyModalProps>`.
- Export as `export default ModalName` (default export).

---

## 9. Accessibility

All modals must meet these accessibility requirements:

### Close Button
```tsx
<TouchableOpacity
  accessibilityLabel="Close"
  accessibilityRole="button"
  onPress={onClose}
>
```

### All Touchable Elements
Every `<TouchableOpacity>` in a modal must have:
- `accessibilityRole="button"`
- A descriptive `accessibilityLabel`

```tsx
<TouchableOpacity
  accessibilityLabel="Send motivation message"
  accessibilityRole="button"
  onPress={handleSend}
>
```

### Focus Management
- If the modal contains a `TextInput`, set `autoFocus` so the keyboard opens immediately.
- If the modal is informational (no input), focus is managed by React Native's default Modal behavior.

### Touch Targets
- All interactive elements must be at least **44x44 points**.
- The icon inside can be smaller; the touchable wrapper must meet the minimum.

---

## 10. Checklist -- Before Submitting Any Modal

- [ ] Uses `<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>`
- [ ] Backdrop uses `commonStyles.modalOverlay` from `src/styles/commonStyles`
- [ ] Inner content wrapped in `<TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>` to prevent dismiss on content tap
- [ ] Card uses `Colors.white`, `BorderRadius.xl`, `Spacing.sectionGap`, `Shadows.lg` -- no hardcoded values
- [ ] Title uses `Typography.heading3` + `Colors.textPrimary`
- [ ] Subtitle uses `Typography.small` + `Colors.textSecondary`
- [ ] Close button has 44pt touch target with `accessibilityLabel="Close"` and `accessibilityRole="button"`
- [ ] Loading states use skeleton loaders, not `<ActivityIndicator>`
- [ ] Disabled/sending buttons use `opacity: 0.5`, not a spinner
- [ ] Success feedback uses `MotiView` with scale+opacity animation + `CheckCircle` icon + auto-close at 1500ms
- [ ] Input modals have character count, disabled-when-empty send button, and `autoFocus`
- [ ] Bottom sheets use `useModalAnimation` hook and `KeyboardAvoidingView` when input is present
- [ ] Props include `visible: boolean` and `onClose: () => void` at minimum
- [ ] All `TouchableOpacity` elements have `accessibilityLabel` + `accessibilityRole="button"`
- [ ] All styles use `StyleSheet.create()` -- no inline style objects (except conditional spreads)
- [ ] No hex color literals -- all from `Colors`
- [ ] No magic-number font sizes -- all from `Typography`
- [ ] No magic-number padding/margin -- all from `Spacing`
- [ ] No magic-number borderRadius -- all from `BorderRadius`
- [ ] No inline shadow definitions -- all from `Shadows`
