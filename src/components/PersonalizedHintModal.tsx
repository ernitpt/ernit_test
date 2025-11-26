import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PersonalizedHintModalProps {
    visible: boolean;
    recipientName: string;
    sessionNumber: number;
    onClose: () => void;
    onSubmit: (hint: string) => Promise<void>;
}

const MAX_HINT_LENGTH = 500;

const EXAMPLE_HINTS = [
    "You're doing amazing! Keep up the great work! 💪",
    "I'm so proud of your progress!",
    "Each session brings you closer to your goal!",
    "Your dedication is truly inspiring! ✨",
    "Remember why you started - you've got this!",
    "Can't wait to see you achieve this! 🌟",
];

export const PersonalizedHintModal: React.FC<PersonalizedHintModalProps> = ({
    visible,
    recipientName,
    sessionNumber,
    onClose,
    onSubmit,
}) => {
    const [hint, setHint] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showExamples, setShowExamples] = useState(false);
    const [opacity] = useState(new Animated.Value(0));

    React.useEffect(() => {
        if (visible) {
            Animated.timing(opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        } else {
            setHint('');
            setShowExamples(false);
        }
    }, [visible]);

    const handleSubmit = async () => {
        if (!hint.trim() || submitting) return;

        setSubmitting(true);
        try {
            await onSubmit(hint.trim());
            onClose();
        } catch (error) {
            console.error('Error submitting hint:', error);
            alert('Failed to send hint. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        Animated.timing(opacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    };

    const remainingChars = MAX_HINT_LENGTH - hint.length;
    const canSubmit = hint.trim().length > 0 && hint.length <= MAX_HINT_LENGTH;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <Animated.View style={[styles.overlay, { opacity }]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={handleClose}
                    />
                </Animated.View>

                <Animated.View style={[styles.modalContent, { opacity }]}>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Header */}
                        <LinearGradient
                            colors={['#7C3AED', '#8B5CF6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.header}
                        >
                            <Text style={styles.headerIcon}>💌</Text>
                            <Text style={styles.headerTitle}>Leave a Hint</Text>
                            <Text style={styles.headerSubtitle}>
                                For session #{sessionNumber}
                            </Text>
                        </LinearGradient>

                        {/* Description */}
                        <View style={styles.description}>
                            <Text style={styles.descriptionText}>
                                Leave a motivational hint for {recipientName} that they'll see after completing session #{sessionNumber}.{'\n\n'}
                                Keep it encouraging and personal! 💪
                            </Text>
                        </View>

                        {/* Text Input */}
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Your encouraging hint..."
                                placeholderTextColor="#9CA3AF"
                                value={hint}
                                onChangeText={setHint}
                                multiline
                                maxLength={MAX_HINT_LENGTH}
                                textAlignVertical="top"
                                autoFocus
                            />
                            <Text
                                style={[
                                    styles.charCount,
                                    remainingChars < 50 && styles.charCountWarning,
                                ]}
                            >
                                {remainingChars} characters remaining
                            </Text>
                        </View>

                        {/* Examples Toggle */}
                        <TouchableOpacity
                            style={styles.examplesToggle}
                            onPress={() => setShowExamples(!showExamples)}
                        >
                            <Text style={styles.examplesToggleText}>
                                {showExamples ? '▼' : '▶'} Need inspiration?
                            </Text>
                        </TouchableOpacity>

                        {/* Example Hints */}
                        {showExamples && (
                            <View style={styles.examplesContainer}>
                                <Text style={styles.exampleHeader}>
                                    ✨ Examples of good hints (subtle and mysterious):
                                </Text>
                                {EXAMPLE_HINTS.map((example, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={styles.exampleCard}
                                        onPress={() => setHint(example)}
                                    >
                                        <Text style={styles.exampleText}>{example}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Buttons */}
                        <View style={styles.buttons}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={handleClose}
                                disabled={submitting}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.submitButton,
                                    (!canSubmit || submitting) && styles.submitButtonDisabled,
                                ]}
                                onPress={handleSubmit}
                                disabled={!canSubmit || submitting}
                            >
                                <LinearGradient
                                    colors={
                                        canSubmit && !submitting
                                            ? ['#7C3AED', '#8B5CF6']
                                            : ['#9CA3AF', '#6B7280']
                                    }
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.submitButtonGradient}
                                >
                                    <Text style={styles.submitButtonText}>
                                        {submitting ? 'Sending...' : 'Send Hint 💌'}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    modalContent: {
        width: '90%',
        maxWidth: 500,
        maxHeight: '85%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    header: {
        padding: 24,
        alignItems: 'center',
    },
    headerIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#FFFFFF',
        opacity: 0.9,
    },
    description: {
        padding: 20,
        paddingTop: 16,
    },
    descriptionText: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
        textAlign: 'center',
    },
    inputContainer: {
        paddingHorizontal: 20,
        paddingBottom: 8,
    },
    textInput: {
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#111827',
        minHeight: 140,
        borderWidth: 2,
        borderColor: '#FCD34D',
    },
    charCount: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 8,
    },
    charCountWarning: {
        color: '#F59E0B',
        fontWeight: '600',
    },
    examplesToggle: {
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    examplesToggleText: {
        fontSize: 14,
        color: '#F59E0B',
        fontWeight: '600',
    },
    examplesContainer: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    exampleHeader: {
        fontSize: 13,
        color: '#9CA3AF',
        marginBottom: 8,
        fontStyle: 'italic',
    },
    exampleCard: {
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#FCD34D',
    },
    exampleText: {
        fontSize: 14,
        color: '#92400E',
        lineHeight: 20,
    },
    buttons: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
    submitButton: {
        flex: 1,
        borderRadius: 12,
        overflow: 'hidden',
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonGradient: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});