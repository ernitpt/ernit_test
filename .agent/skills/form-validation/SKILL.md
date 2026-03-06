---
name: form-validation
description: Enforces consistent form handling, input validation, and submission patterns across the Ernit app. Use whenever creating, modifying, or reviewing any form, input field, or data submission flow.
---

# Form Validation & Submission Patterns

## Overview

All forms in the Ernit app follow a single set of conventions for styling, validation, state management, and submission. This skill codifies those patterns so every form is predictable and accessible.

**Announce at start:** "I'm using the form-validation skill to ensure consistent form handling."

## Key Imports
```tsx
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { validateEmail } from '../utils/helpers';
import { sanitizeText, sanitizeComment, sanitizeNumber, MAX_LENGTHS } from '../utils/sanitization';
import { logErrorToFirestore } from '../utils/errorLogger';
```

---

## 1. Input Field Styling

Every `TextInput` must use design tokens. Never hardcode colors, radii, or spacing.

**Standard single-line input:**
```tsx
input: {
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: BorderRadius.md,
  paddingHorizontal: Spacing.cardPadding,
  paddingVertical: Spacing.listItemGap,
  ...Typography.body,
  color: Colors.textPrimary,
  backgroundColor: Colors.surface,
}
```

**Multiline / textarea variant** -- apply as `style={[styles.input, styles.textArea]}`:
```tsx
textArea: { minHeight: 120, textAlignVertical: 'top', paddingTop: Spacing.listItemGap }
```

**Error state** -- apply as `style={[styles.input, errors.fieldName && styles.inputError]}`:
```tsx
inputError: { borderColor: Colors.error }
```

**Input label:**
```tsx
label: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: Spacing.xs }
```

---

## 2. Inline Validation

Errors are shown immediately below the field as inline text. Never use `Alert.alert()` for field-level validation.
```tsx
{errors.email && (
  <Text style={{ ...Typography.caption, color: Colors.error, marginTop: Spacing.xs }}>
    {errors.email}
  </Text>
)}
```

- Show the error when the user blurs the field or taps Submit.
- Clear the error for a field when the user starts typing in it again.
- Error text must be concise (one short sentence).

---

## 3. Validation Functions

### Built-in Utilities

| Function | Location | Purpose |
|----------|----------|---------|
| `validateEmail(email)` | `utils/helpers` | Returns `boolean` for email format |
| `sanitizeComment(text)` | `utils/sanitization` | Trims, removes control chars, checks for XSS. Throws on suspicious content. |
| `sanitizeText(text, maxLen)` | `utils/sanitization` | General text sanitization with length enforcement |
| `sanitizeNumber(value, min?, max?)` | `utils/sanitization` | Coerces to number, clamps to range |
| `sanitizeEmail(email)` | `utils/sanitization` | Trims, lowercases, validates format |

### Custom Validators

When you need a project-specific validator, follow this convention — return an error string or `null`:

```tsx
const validateName = (name: string): string | null => {
  if (!name.trim()) return 'Name is required';
  if (name.trim().length < 2) return 'Name must be at least 2 characters';
  return null;
};
```

Use these inside the `validate()` function (see Section 4).

---

## 4. Form State Management

Every form uses three pieces of state:
```tsx
const [formData, setFormData] = useState({ name: '', email: '' });
const [errors, setErrors] = useState<Record<string, string>>({});
const [submitting, setSubmitting] = useState(false);
```

**Validate function** -- returns `true` if valid, updates `errors` state:
```tsx
const validate = (): boolean => {
  const newErrors: Record<string, string> = {};
  if (!formData.name.trim()) newErrors.name = 'Name is required';
  if (!validateEmail(formData.email)) newErrors.email = 'Invalid email address';
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

**Clear errors on change** -- so the user gets immediate feedback:
```tsx
const handleChange = (field: string, value: string) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
  if (errors[field]) {
    setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }
};
```

**Derived validity flag** for button state:
```tsx
const isValid = formData.name.trim().length > 0 && validateEmail(formData.email);
```

---

## 5. Submit Button Pattern

Buttons must show a disabled + loading state. Use `opacity: 0.5` for disabled, matching existing patterns in `MotivationModal` and `ContactModal`.

```tsx
<TouchableOpacity
  style={[
    styles.submitButton,
    (submitting || !isValid) && { opacity: 0.5 },
  ]}
  onPress={handleSubmit}
  disabled={submitting || !isValid}
  accessibilityLabel="Submit form"
  accessibilityRole="button"
>
  <Text style={styles.submitText}>
    {submitting ? 'Saving...' : 'Save'}
  </Text>
</TouchableOpacity>
```

Submit button base style:
```tsx
submitButton: {
  backgroundColor: Colors.secondary,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.xxl,
  borderRadius: BorderRadius.lg,
  alignItems: 'center',
  justifyContent: 'center',
  ...Shadows.colored(Colors.secondary),
}
submitText: { ...Typography.bodyBold, color: Colors.white }
```

For forms inside modals with Cancel + Submit, use a flex row:
```tsx
<View style={{ flexDirection: 'row', gap: Spacing.sm }}>
  <TouchableOpacity style={[styles.cancelButton, { flex: 1 }]} onPress={onClose}>
    <Text style={styles.cancelText}>Cancel</Text>
  </TouchableOpacity>
  <TouchableOpacity
    style={[styles.submitButton, { flex: 1 }, (submitting || !isValid) && { opacity: 0.5 }]}
    onPress={handleSubmit}
    disabled={submitting || !isValid}
  >
    <Text style={styles.submitText}>{submitting ? 'Saving...' : 'Save'}</Text>
  </TouchableOpacity>
</View>
```

---

## 6. Character Count

For any input with a `maxLength`, show a counter below the field (see `MotivationModal`, `ContactModal`):
```tsx
<Text style={{
  ...Typography.caption,
  color: text.length > maxLength ? Colors.error : Colors.textMuted,
  textAlign: 'right',
  marginTop: Spacing.xs,
}}>
  {text.length}/{maxLength}
</Text>
```

---

## 7. Submission Flow

Every async submit follows this sequence:
```tsx
const handleSubmit = async () => {
  // 1. Validate
  if (!validate()) return;

  // 2. Lock the form
  setSubmitting(true);

  try {
    // 3. Sanitize inputs before saving
    const cleanName = sanitizeText(formData.name, MAX_LENGTHS.USER_NAME);
    const cleanEmail = sanitizeEmail(formData.email);

    // 4. Perform the async operation
    await saveToFirestore({ name: cleanName, email: cleanEmail });

    // 5. Success feedback (inline animation or toast)
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      onClose();
    }, 1500);
  } catch (error) {
    // 6. Log error + show user-friendly message
    logErrorToFirestore(error, 'FormName.handleSubmit');
    Alert.alert('Error', 'Something went wrong. Please try again.');
  } finally {
    // 7. Unlock the form
    setSubmitting(false);
  }
};
```

Key rules:
- Always sanitize before writing to Firestore.
- Always log errors with `logErrorToFirestore`.
- Always use `finally` to reset `submitting`.
- Use the inline success pattern from `ui-design-system` skill.

---

## 8. Numeric Input Sanitization

For number-only fields, strip non-digit characters on change (pattern from `GoalSettingScreen`):
```tsx
const sanitizeNumericInput = (text: string) => text.replace(/[^0-9]/g, '');

<TextInput
  style={styles.input}
  value={duration}
  onChangeText={(t) => setDuration(sanitizeNumericInput(t))}
  keyboardType="number-pad"
  maxLength={3}
  accessibilityLabel="Duration in weeks"
/>
```
For pre-save sanitization, use `sanitizeNumber(value, min, max)` from `utils/sanitization`.

---

## 9. Input Sanitization Before Firestore

All user-generated text must be sanitized before writing to Firestore:
```tsx
import { sanitizeComment, sanitizeText, sanitizeProfileData, sanitizeGoalData, MAX_LENGTHS } from '../utils/sanitization';

const cleanComment = sanitizeComment(rawText);          // comments/messages (checks XSS)
const cleanTitle = sanitizeText(rawTitle, MAX_LENGTHS.GOAL_TITLE);  // general text
const cleanProfile = sanitizeProfileData({ name, description, country });
const cleanGoal = sanitizeGoalData({ title, description });
```
Never write `formData.someField` directly to Firestore without sanitization.

---

## 10. Accessibility

Every input and action element must be accessible.

**TextInput:** Always set `accessibilityLabel` and `placeholderTextColor`:
```tsx
<TextInput accessibilityLabel="Email address" placeholder="you@example.com" placeholderTextColor={Colors.textMuted} />
```

**Error announcements:** Use `accessibilityLiveRegion` so screen readers announce errors:
```tsx
<View accessibilityLiveRegion="polite">
  {errors.email && (
    <Text style={{ ...Typography.caption, color: Colors.error, marginTop: Spacing.xs }} accessibilityRole="alert">
      {errors.email}
    </Text>
  )}
</View>
```

**Label association:** If the input has a visible label, link them:
```tsx
<Text nativeID="emailLabel" style={styles.label}>Email</Text>
<TextInput accessibilityLabelledBy="emailLabel" ... />
```

**Touch targets:** Submit and cancel buttons must meet the 44x44pt minimum (see `ui-design-system` skill).

---

## 11. Reset on Modal Open

When a form lives inside a modal, reset all state when `visible` changes to `true` (matches `MotivationModal` and `ContactModal`):
```tsx
useEffect(() => {
  if (visible) {
    setFormData({ name: '', email: '' });
    setErrors({});
    setSubmitting(false);
    setShowSuccess(false);
  }
}, [visible]);
```

---

## Checklist — Before Submitting Any Form Change

- [ ] Inputs use design tokens (Colors, Typography, Spacing, BorderRadius) -- no hardcoded values
- [ ] Validation is inline (below the field), not via `Alert.alert()`
- [ ] Errors clear when the user edits the offending field
- [ ] Uses existing validators (`validateEmail`, `sanitizeComment`) where applicable
- [ ] Form state follows the `formData` / `errors` / `submitting` pattern
- [ ] Submit button is disabled and dimmed (`opacity: 0.5`) when invalid or submitting
- [ ] Character count shown for any field with a `maxLength`
- [ ] All text is sanitized before writing to Firestore
- [ ] Numeric fields use `sanitizeNumericInput` on change
- [ ] Submission follows validate -> submit -> success/error -> finally flow
- [ ] Errors are logged with `logErrorToFirestore`
- [ ] Every `TextInput` has an `accessibilityLabel`
- [ ] Error text uses `accessibilityRole="alert"`
- [ ] Touch targets are at least 44x44pt
- [ ] Modal forms reset state on open via `useEffect`
