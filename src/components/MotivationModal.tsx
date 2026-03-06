import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    Animated,
    Easing,
} from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { motivationService } from '../services/MotivationService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { commonStyles } from '../styles/commonStyles';

interface MotivationModalProps {
    visible: boolean;
    recipientName: string;
    goalId: string;
    onClose: () => void;
    onSent?: () => void;
}

const MotivationModal: React.FC<MotivationModalProps> = ({
    visible,
    recipientName,
    goalId,
    onClose,
    onSent,
}) => {
    const { state } = useApp();
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const successAnim = useRef(new Animated.Value(0)).current;

    // Reset state when modal opens
    useEffect(() => {
        if (visible) {
            setText('');
            setShowSuccess(false);
            successAnim.setValue(0);
        }
    }, [visible]);

    const handleSend = async () => {
        if (!text.trim() || !state.user?.id || !goalId) return;
        setSending(true);
        try {
            await motivationService.leaveMotivation(
                goalId,
                state.user.id,
                state.user.displayName || state.user.profile?.name || 'A friend',
                text.trim(),
                state.user.profile?.profileImageUrl,
            );

            // Show inline success feedback
            setShowSuccess(true);
            Animated.timing(successAnim, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();

            // Auto-close after 1.5s
            setTimeout(() => {
                setText('');
                setShowSuccess(false);
                onClose();
                onSent?.();
            }, 1500);
        } catch (error) {
            logger.error('Error sending motivation:', error);
            await logErrorToFirestore(error, {
                screenName: 'MotivationModal',
                feature: 'SendMotivation',
                userId: state.user?.id || 'unknown',
                additionalData: { goalId },
            });
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={commonStyles.modalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={styles.modal}>
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        {showSuccess ? (
                            <Animated.View
                                style={[
                                    styles.successContainer,
                                    {
                                        opacity: successAnim,
                                        transform: [{
                                            scale: successAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.8, 1],
                                            }),
                                        }],
                                    },
                                ]}
                            >
                                <CheckCircle color={Colors.secondary} size={48} />
                                <Text style={styles.successText}>Message sent!</Text>
                                <Text style={styles.successSubtext}>
                                    {recipientName} will see it in their next session
                                </Text>
                            </Animated.View>
                        ) : (
                            <>
                                <Text style={styles.title}>Send Motivation</Text>
                                <Text style={styles.subtitle}>
                                    Leave an encouraging message for {recipientName}
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="You've got this! Keep going..."
                                    value={text}
                                    onChangeText={setText}
                                    multiline
                                    maxLength={500}
                                />
                                <Text style={styles.charCount}>
                                    {text.length}/500
                                </Text>
                                <View style={styles.buttons}>
                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        onPress={onClose}
                                    >
                                        <Text style={styles.cancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.sendButton,
                                            (!text.trim() || sending) && { opacity: 0.5 },
                                        ]}
                                        onPress={handleSend}
                                        disabled={!text.trim() || sending}
                                    >
                                        <Text style={styles.sendText}>
                                            {sending ? 'Sending...' : 'Send'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modal: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        width: '90%',
        maxWidth: 360,
        padding: Spacing.sectionGap,
        ...Shadows.lg,
    },
    title: {
        ...Typography.heading3,
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    subtitle: {
        ...Typography.small,
        color: Colors.textSecondary,
        marginBottom: Spacing.cardPadding,
    },
    input: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.cardPadding,
        paddingVertical: Spacing.md,
        ...Typography.body,
        color: Colors.textPrimary,
        backgroundColor: Colors.surface,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    charCount: {
        ...Typography.caption,
        color: Colors.textMuted,
        textAlign: 'right',
        marginTop: Spacing.xs,
        marginBottom: Spacing.cardPadding,
    },
    buttons: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.backgroundLight,
        alignItems: 'center',
    },
    cancelText: {
        ...Typography.bodyBold,
        color: Colors.textPrimary,
    },
    sendButton: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.secondary,
        alignItems: 'center',
    },
    sendText: {
        ...Typography.bodyBold,
        color: Colors.white,
    },
    successContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.sectionGap,
        gap: Spacing.md,
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
});

export default MotivationModal;
