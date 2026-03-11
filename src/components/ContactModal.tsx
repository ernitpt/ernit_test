import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Animated,
    ScrollView,
    TextInput as RNTextInput,
} from 'react-native';
import { X, Send, MessageSquare, LifeBuoy, CheckCircle } from 'lucide-react-native';
import { TextInput } from '../components/TextInput';
import { useApp } from '../context/AppContext';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import { contactService } from '../services/ContactService';
import { logger } from '../utils/logger';
import Colors from '../config/colors';

interface ContactModalProps {
    visible: boolean;
    type: 'feedback' | 'support';
    onClose: () => void;
}

const ContactModal: React.FC<ContactModalProps> = ({ visible, type, onClose }) => {
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
            setErrorMessage('Please fill in all fields');
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
            setShowSuccess(true);
            setIsSending(false);

            // Close after 2 seconds
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (error) {
            logger.error(`Error sending ${type}:`, error);
            setIsSending(false);
            setShowSuccess(false);
            setErrorMessage('Failed to send. Please try again.');
        }
    };

    const Icon = type === 'feedback' ? MessageSquare : LifeBuoy;
    const title = type === 'feedback' ? 'Give Feedback' : 'Get Support';
    const placeholder = type === 'feedback'
        ? 'Tell us about your idea, suggestion, or what you love about Ernit...'
        : 'Describe the issue you\'re experiencing (bug, payment problem, progression issue, etc.)...';

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
                />
                <Animated.View
                    style={[
                        styles.modalContainer,
                        { transform: [{ translateY: slideAnim }] }
                    ]}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerTitleContainer}>
                                <Icon color={Colors.secondary} size={24} />
                                <Text style={styles.headerTitle}>{title}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X color={Colors.textSecondary} size={24} />
                            </TouchableOpacity>
                        </View>

                        {showSuccess ? (
                            // Success State
                            <View style={styles.successContainer}>
                                <CheckCircle color={Colors.secondary} size={64} />
                                <Text style={styles.successTitle}>Message Sent!</Text>
                                <Text style={styles.successMessage}>
                                    Thank you for your {type === 'feedback' ? 'feedback' : 'message'}.
                                    We'll get back to you at{' '}
                                    <Text style={styles.emailText}>{userEmail}</Text>
                                    {' '}within 24-48 hours.
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
                                    label="Subject"
                                    placeholder={type === 'feedback' ? 'Feature request, UI improvement, etc.' : 'Bug report, payment issue, etc.'}
                                    value={subject}
                                    onChangeText={setSubject}
                                    maxLength={100}
                                    disabled={isSending}
                                    returnKeyType="next"
                                    onSubmitEditing={() => messageRef.current?.focus()}
                                    helperText={`${subject.length}/100`}
                                    containerStyle={{ marginBottom: 16 }}
                                />

                                {/* Message Input */}
                                <TextInput
                                    ref={messageRef}
                                    label="Message"
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
                                    inputStyle={{ minHeight: 120, paddingTop: 12 }}
                                />

                                {/* Info Box */}
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoText}>
                                        We'll respond to <Text style={styles.emailText}>{userEmail}</Text>
                                    </Text>
                                </View>

                                {/* Error message */}
                                {errorMessage ? (
                                    <Text style={styles.errorText}>{errorMessage}</Text>
                                ) : null}

                                {/* Submit Button */}
                                <TouchableOpacity
                                    style={[
                                        styles.submitButton,
                                        (!subject.trim() || !message.trim() || isSending) && styles.submitButtonDisabled,
                                    ]}
                                    onPress={handleSubmit}
                                    disabled={!subject.trim() || !message.trim() || isSending}
                                >
                                    {isSending ? (
                                        <ActivityIndicator size="small" color={Colors.white} />
                                    ) : (
                                        <>
                                            <Send color={Colors.white} size={20} />
                                            <Text style={styles.submitButtonText}>Send Message</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </KeyboardAvoidingView>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContainer: {
        height: '75%',
        width: '100%',
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
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
        padding: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.backgroundLight,
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    closeButton: {
        padding: 4,
    },
    formContainer: {
        flex: 1,
        padding: 20,
    },
    infoBox: {
        backgroundColor: Colors.infoLight,
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.info,
    },
    infoText: {
        fontSize: 13,
        color: Colors.infoDark,
        textAlign: 'center',
    },
    emailText: {
        fontWeight: '600',
        color: Colors.secondary,
    },
    errorText: {
        color: Colors.error,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
        fontWeight: '500',
    },
    submitButton: {
        backgroundColor: Colors.secondary,
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20,
    },
    submitButtonDisabled: {
        backgroundColor: Colors.gray300,
    },
    submitButtonText: {
        color: Colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    successContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 12,
    },
    successMessage: {
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
});

export default ContactModal;
