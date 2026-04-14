import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Animated,
    ScrollView,
    TextInput as RNTextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Button from './Button';
import { X, Send, MessageSquare, LifeBuoy, CheckCircle } from 'lucide-react-native';
import { TextInput } from '../components/TextInput';
import { useApp } from '../context/AppContext';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { createCommonStyles } from '../styles/commonStyles';
import { contactService } from '../services/ContactService';
import { logger } from '../utils/logger';
import { useTranslation } from 'react-i18next';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

interface ContactModalProps {
    visible: boolean;
    type: 'feedback' | 'support';
    onClose: () => void;
}

const ContactModal: React.FC<ContactModalProps> = ({ visible, type, onClose }) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const commonStyles = useMemo(() => createCommonStyles(colors), [colors]);
    const { t } = useTranslation();

    const { state } = useApp();
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const slideAnim = useModalAnimation(visible, {
        initialValue: 1000,
        tension: 80,
        friction: 10,
    });

    // Create refs for focus chaining
    const messageRef = useRef<RNTextInput>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (visible) {
            setSubject('');
            setMessage('');
            setShowSuccess(false);
            setErrorMessage('');
        }
    }, [visible]);

    const handleSubmit = async () => {
        if (!subject.trim() || !message.trim()) {
            setErrorMessage(t('modals.contact.fillAllFields'));
            return;
        }

        setIsSending(true);

        try {
            if (type === 'feedback') {
                await contactService.submitFeedback(subject.trim(), message.trim());
            } else {
                await contactService.submitSupport(subject.trim(), message.trim());
            }

            logger.log(`${type} sent successfully`);
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setShowSuccess(true);
            setIsSending(false);

            // Close after 2 seconds
            timerRef.current = setTimeout(() => {
                onClose();
            }, 2000);
        } catch (error: unknown) {
            logger.error(`Error sending ${type}:`, error);
            setIsSending(false);
            setShowSuccess(false);
            setErrorMessage(t('modals.contact.sendFailed'));
        }
    };

    const Icon = type === 'feedback' ? MessageSquare : LifeBuoy;
    const title = type === 'feedback' ? t('modals.contact.titleFeedback') : t('modals.contact.titleSupport');
    const placeholder = type === 'feedback'
        ? t('modals.contact.messagePlaceholderFeedback')
        : t('modals.contact.messagePlaceholderSupport');

    const userEmail = state.user?.email || 'your registered email';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={[commonStyles.modalOverlay, { justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('modals.contact.closeA11y')}
                />
                <Animated.View
                    style={[
                        styles.modalContainer,
                        { transform: [{ translateY: slideAnim }] }
                    ]}
                    accessibilityViewIsModal={true}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerTitleContainer}>
                                <Icon color={colors.secondary} size={24} />
                                <Text style={styles.headerTitle}>{title}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('modals.contact.closeButton')}>
                                <X color={colors.textSecondary} size={24} />
                            </TouchableOpacity>
                        </View>

                        {showSuccess ? (
                            // Success State
                            <View style={styles.successContainer}>
                                <CheckCircle color={colors.secondary} size={64} />
                                <Text style={styles.successTitle}>{t('modals.contact.successTitle')}</Text>
                                <Text style={styles.successMessage}>
                                    {type === 'feedback'
                                        ? t('modals.contact.successMessageFeedback', { email: userEmail })
                                        : t('modals.contact.successMessageSupport', { email: userEmail })}
                                </Text>
                            </View>
                        ) : (
                            // Form State
                            <ScrollView
                                style={styles.formContainer}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                            >
                                {/* Subject Input */}
                                <TextInput
                                    label={t('modals.contact.subjectLabel')}
                                    placeholder={type === 'feedback' ? t('modals.contact.subjectPlaceholderFeedback') : t('modals.contact.subjectPlaceholderSupport')}
                                    value={subject}
                                    onChangeText={setSubject}
                                    maxLength={100}
                                    disabled={isSending}
                                    returnKeyType="next"
                                    onSubmitEditing={() => messageRef.current?.focus()}
                                    helperText={`${subject.length}/100`}
                                    containerStyle={{ marginBottom: Spacing.lg }}
                                />

                                {/* Message Input */}
                                <TextInput
                                    label={t('modals.contact.messageLabel')}
                                    placeholder={placeholder}
                                    value={message}
                                    onChangeText={setMessage}
                                    multiline
                                    numberOfLines={6}
                                    maxLength={1000}
                                    textAlignVertical="top"
                                    disabled={isSending}
                                    returnKeyType="done"
                                    helperText={`${message.length}/1000`}
                                    inputStyle={{ minHeight: Spacing.textareaMinHeight, paddingTop: Spacing.md }}
                                />

                                {/* Info Box */}
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoText}>
                                        {t('modals.contact.respondInfo', { email: userEmail })}
                                    </Text>
                                </View>

                                {/* Error message */}
                                {errorMessage ? (
                                    <Text style={styles.errorText}>{errorMessage}</Text>
                                ) : null}

                                {/* Submit Button */}
                                <Button
                                    title={t('modals.contact.sendButton')}
                                    onPress={handleSubmit}
                                    variant="primary"
                                    size="md"
                                    fullWidth
                                    disabled={!subject.trim() || !message.trim() || isSending}
                                    loading={isSending}
                                    icon={<Send color={colors.white} size={20} />}
                                    style={{ marginBottom: Spacing.xl }}
                                />
                            </ScrollView>
                        )}
                    </KeyboardAvoidingView>
                </Animated.View>
            </View>
        </Modal>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        backdrop: {
            ...StyleSheet.absoluteFillObject,
        },
        modalContainer: {
            height: '75%',
            width: '100%',
            backgroundColor: colors.white,
            borderTopLeftRadius: BorderRadius.xxl,
            borderTopRightRadius: BorderRadius.xxl,
            shadowColor: colors.black,
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 8,
        },
        keyboardView: {
            flex: 1,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: Spacing.xl,
            paddingBottom: Spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: colors.backgroundLight,
        },
        headerTitleContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
        },
        headerTitle: {
            ...Typography.large,
            color: colors.textPrimary,
        },
        closeButton: {
            padding: Spacing.xs,
        },
        formContainer: {
            flex: 1,
            padding: Spacing.xl,
        },
        infoBox: {
            backgroundColor: colors.infoLight,
            borderRadius: BorderRadius.md,
            padding: Spacing.md,
            marginBottom: Spacing.xl,
            borderWidth: 1,
            borderColor: colors.info,
        },
        infoText: {
            ...Typography.caption,
            color: colors.infoDark,
            textAlign: 'center',
        },
        emailText: {
            fontWeight: '600',
            color: colors.secondary,
        },
        errorText: {
            color: colors.error,
            ...Typography.small,
            textAlign: 'center',
            marginBottom: Spacing.md,
            fontWeight: '500',
        },
        successContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: Spacing.huge,
        },
        successTitle: {
            ...Typography.heading1,
            color: colors.textPrimary,
            marginTop: Spacing.lg,
            marginBottom: Spacing.md,
        },
        successMessage: {
            ...Typography.body,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
        },
    });

export default React.memo(ContactModal);
