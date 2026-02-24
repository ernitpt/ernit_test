import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Animated,
    ScrollView,
} from 'react-native';
import { X, Send, MessageSquare, LifeBuoy, CheckCircle } from 'lucide-react-native';
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
    const slideAnim = useModalAnimation(visible, {
        initialValue: 1000,
        tension: 80,
        friction: 10,
    });

    // Reset form when modal opens/closes
    useEffect(() => {
        if (visible) {
            setSubject('');
            setMessage('');
            setShowSuccess(false);
        }
    }, [visible]);

    const handleSubmit = async () => {
        if (!subject.trim() || !message.trim()) return;

        setIsSending(true);

        // Start sending in background (don't await)
        const sendPromise = type === 'feedback'
            ? contactService.submitFeedback(subject.trim(), message.trim())
            : contactService.submitSupport(subject.trim(), message.trim());

        // Handle the promise in background
        sendPromise
            .then(() => {
                logger.log(`${type} sent successfully in background`);
            })
            .catch((error) => {
                logger.error(`Error sending ${type} in background:`, error);
            });

        // Show success immediately
        setShowSuccess(true);

        // Close after 2 seconds (user doesn't wait for email)
        setTimeout(() => {
            onClose();
        }, 2000);

        // Stop loading spinner after showing success
        setTimeout(() => {
            setIsSending(false);
        }, 1500);
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
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        {showSuccess ? (
                            // Success State
                            <View style={styles.successContainer}>
                                <CheckCircle color="#10b981" size={64} />
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
                            >
                                {/* Subject Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Subject</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder={type === 'feedback' ? 'Feature request, UI improvement, etc.' : 'Bug report, payment issue, etc.'}
                                        placeholderTextColor="#9ca3af"
                                        value={subject}
                                        onChangeText={setSubject}
                                        maxLength={100}
                                        editable={!isSending}
                                    />
                                    <Text style={styles.charCount}>{subject.length}/100</Text>
                                </View>

                                {/* Message Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Message</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder={placeholder}
                                        placeholderTextColor="#9ca3af"
                                        value={message}
                                        onChangeText={setMessage}
                                        multiline
                                        numberOfLines={6}
                                        maxLength={1000}
                                        textAlignVertical="top"
                                        editable={!isSending}
                                    />
                                    <Text style={styles.charCount}>{message.length}/1000</Text>
                                </View>

                                {/* Info Box */}
                                <View style={styles.infoBox}>
                                    <Text style={styles.infoText}>
                                        We'll respond to <Text style={styles.emailText}>{userEmail}</Text>
                                    </Text>
                                </View>

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
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Send color="#fff" size={20} />
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
        backgroundColor: '#fff',
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
        borderBottomColor: '#f3f4f6',
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        padding: 4,
    },
    formContainer: {
        flex: 1,
        padding: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111827',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    textArea: {
        minHeight: 120,
        paddingTop: 12,
    },
    charCount: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'right',
        marginTop: 4,
    },
    infoBox: {
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    infoText: {
        fontSize: 13,
        color: '#1e40af',
        textAlign: 'center',
    },
    emailText: {
        fontWeight: '600',
        color: Colors.secondary,
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
        backgroundColor: '#d1d5db',
    },
    submitButtonText: {
        color: '#fff',
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
        color: '#111827',
        marginTop: 16,
        marginBottom: 12,
    },
    successMessage: {
        fontSize: 15,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 22,
    },
});

export default ContactModal;
