import React, { useState, useEffect, useRef } from 'react';
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
    Image,
    Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import { Trash2, Mic, Square, Play, Pause, Image as ImageIcon, X, CheckCircle } from 'lucide-react-native';
import { motivationService } from '../services/MotivationService';
import { storageService } from '../services/StorageService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import Colors from '../config/colors';
import { useToast } from '../context/ToastContext';

interface MotivationModalProps {
    visible: boolean;
    recipientName: string;
    goalId: string;
    onClose: () => void;
    onSent?: () => void;
    targetSession?: number;
}

const MAX_TEXT_LENGTH = 500;
const MAX_AUDIO_DURATION = 30; // seconds

const EXAMPLE_MESSAGES = [
    "You're doing amazing! Keep up the great work! 💪",
    "I'm so proud of your progress!",
    "Each session brings you closer to your goal!",
    "Your dedication is truly inspiring! ✨",
    "Remember why you started - you've got this!",
    "Can't wait to see you achieve this! 🌟",
];

const MotivationModal: React.FC<MotivationModalProps> = ({
    visible,
    recipientName,
    goalId,
    onClose,
    onSent,
    targetSession,
}) => {
    const { state } = useApp();
    const { showInfo, showError } = useToast();
    const [mode, setMode] = useState<'text' | 'voice'>('text');
    const [text, setText] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [showExamples, setShowExamples] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Audio State
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [audioUri, setAudioUri] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [soundDuration, setSoundDuration] = useState(0);

    const slideAnim = useModalAnimation(visible);
    const successAnim = useRef(new Animated.Value(0)).current;
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!visible) {
            resetState();
        }
        return () => {
            if (recording) {
                stopRecording();
            }
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, [visible]);

    const resetState = () => {
        setText('');
        setImageUri(null);
        setAudioUri(null);
        setRecording(null);
        setSound(null);
        setIsRecording(false);
        setIsPlaying(false);
        setRecordingDuration(0);
        setPlaybackPosition(0);
        setSoundDuration(0);
        setMode('text');
        setShowExamples(false);
        setShowSuccess(false);
        setError(null);
        successAnim.setValue(0);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    // --- Audio Logic ---
    const startRecording = async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') {
                showInfo('Please grant microphone permission to record voice motivations.');
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(recording);
            setIsRecording(true);
            setRecordingDuration(0);

            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => {
                    const newDuration = prev + 1;
                    if (newDuration >= MAX_AUDIO_DURATION) {
                        // Stop recording on next tick to avoid calling async function in setState
                        setTimeout(() => stopRecording(), 0);
                    }
                    return newDuration;
                });
            }, 1000);
        } catch (err) {
            logger.error('Failed to start recording', err);
        }
    };

    const stopRecording = async () => {
        if (!recording) return;

        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);

        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setAudioUri(uri);
            setRecording(null);
        } catch (error) {
            logger.error('Failed to stop recording', error);
        }
    };

    const playSound = async () => {
        if (!audioUri) return;

        try {
            if (sound) {
                await sound.playAsync();
                setIsPlaying(true);
            } else {
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: audioUri },
                    { shouldPlay: true }
                );
                setSound(newSound);
                setIsPlaying(true);

                newSound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded) {
                        setPlaybackPosition(status.positionMillis / 1000);
                        setSoundDuration(status.durationMillis ? status.durationMillis / 1000 : 0);
                        if (status.didJustFinish) {
                            setIsPlaying(false);
                            newSound.setPositionAsync(0);
                        }
                    }
                });
            }
        } catch (error) {
            logger.error('Error playing sound', error);
        }
    };

    const pauseSound = async () => {
        if (sound) {
            await sound.pauseAsync();
            setIsPlaying(false);
        }
    };

    const deleteRecording = async () => {
        if (sound) {
            await sound.unloadAsync();
        }
        setSound(null);
        setAudioUri(null);
        setRecordingDuration(0);
        setPlaybackPosition(0);
    };

    // --- Image Logic ---
    const pickImage = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
            showInfo('Please grant photo library permission to attach images.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    // --- Submission ---
    const handleSend = async () => {
        if (submitting || !state.user?.id || !goalId) return;

        // Validate based on mode
        if (mode === 'voice' && !audioUri) return;
        if (mode === 'text' && !text.trim() && !imageUri) return;

        setSubmitting(true);
        setError(null);
        try {
            let uploadedImageUrl: string | undefined;
            let uploadedAudioUrl: string | undefined;
            let submissionType: 'text' | 'audio' | 'image' | 'mixed' = 'text';
            let duration: number | undefined;

            if (mode === 'voice' && audioUri) {
                uploadedAudioUrl = await storageService.uploadMotivationAudio(audioUri, state.user.id);
                submissionType = 'audio';
                duration = recordingDuration || soundDuration;
            } else {
                if (imageUri) {
                    uploadedImageUrl = await storageService.uploadMotivationImage(imageUri, state.user.id);
                }
                submissionType = uploadedImageUrl ? (text.trim() ? 'mixed' : 'image') : 'text';
            }

            await motivationService.leaveMotivation(
                goalId,
                state.user.id,
                state.user.displayName || state.user.profile?.name || 'A friend',
                text.trim() || '',
                state.user.profile?.profileImageUrl,
                targetSession,
                {
                    type: submissionType,
                    imageUrl: uploadedImageUrl,
                    audioUrl: uploadedAudioUrl,
                    audioDuration: duration,
                },
            );

            // Show success animation
            setShowSuccess(true);
            Animated.timing(successAnim, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();

            setTimeout(() => {
                resetState();
                onClose();
                onSent?.();
            }, 1500);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
            if (errorMessage.includes('already sent')) {
                setError('You have already sent motivation for this session.');
            } else if (errorMessage.includes('next upcoming session') || errorMessage.includes('already been completed')) {
                onClose();
            } else {
                setError('Failed to send motivation. Please try again.');
                logger.error('Error sending motivation:', error);
                await logErrorToFirestore(error, {
                    screenName: 'MotivationModal',
                    feature: 'SendMotivation',
                    userId: state.user?.id || 'unknown',
                    additionalData: { goalId },
                });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmit = mode === 'voice'
        ? !!audioUri
        : (text.trim().length > 0 || !!imageUri);

    const remainingChars = MAX_TEXT_LENGTH - text.length;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={commonStyles.modalOverlay}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
                    {showSuccess ? (
                        <Animated.View style={[styles.successContainer, {
                            opacity: successAnim,
                            transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                        }]}>
                            <CheckCircle color={Colors.secondary} size={48} />
                            <Text style={styles.successText}>Message sent!</Text>
                            <Text style={styles.successSubtext}>
                                {recipientName} will see it in their next session
                            </Text>
                        </Animated.View>
                    ) : (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Header */}
                            <LinearGradient
                                colors={Colors.gradientPrimary}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.header}
                            >
                                <Text style={styles.headerTitle}>Send Motivation</Text>
                                <Text style={styles.headerSubtitle}>
                                    Leave an encouraging message for {recipientName}
                                </Text>
                            </LinearGradient>

                            {/* Mode Tabs */}
                            <View style={styles.tabs}>
                                <TouchableOpacity
                                    style={[styles.tab, mode === 'text' && styles.activeTab]}
                                    onPress={() => setMode('text')}
                                >
                                    <Text style={[styles.tabText, mode === 'text' && styles.activeTabText]}>
                                        Text & Photo
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.tab, mode === 'voice' && styles.activeTab]}
                                    onPress={() => setMode('voice')}
                                >
                                    <Text style={[styles.tabText, mode === 'voice' && styles.activeTabText]}>
                                        Voice Memo
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.contentContainer}>
                                {/* Error Banner */}
                                {error && (
                                    <View style={styles.errorBanner}>
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                )}

                                {mode === 'text' ? (
                                    <>
                                        {/* Text Input */}
                                        <View style={styles.inputContainer}>
                                            <TextInput
                                                style={styles.textInput}
                                                placeholder="You've got this! Keep going..."
                                                placeholderTextColor="#9CA3AF"
                                                value={text}
                                                onChangeText={setText}
                                                multiline
                                                maxLength={MAX_TEXT_LENGTH}
                                                textAlignVertical="top"
                                            />
                                            <Text style={styles.charCount}>
                                                {remainingChars} characters remaining
                                            </Text>
                                        </View>

                                        {/* Image Attachment */}
                                        <View style={styles.attachmentContainer}>
                                            {imageUri ? (
                                                <View style={styles.imagePreview}>
                                                    <Image source={{ uri: imageUri }} style={styles.attachedImage} />
                                                    <TouchableOpacity
                                                        style={styles.removeImageButton}
                                                        onPress={() => setImageUri(null)}
                                                    >
                                                        <X size={16} color="#fff" />
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
                                                    <ImageIcon size={20} color={Colors.primary} />
                                                    <Text style={styles.attachButtonText}>Add Photo</Text>
                                                </TouchableOpacity>
                                            )}
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

                                        {showExamples && (
                                            <View style={styles.examplesContainer}>
                                                {EXAMPLE_MESSAGES.map((example, index) => (
                                                    <TouchableOpacity
                                                        key={index}
                                                        style={styles.exampleCard}
                                                        onPress={() => setText(example)}
                                                    >
                                                        <Text style={styles.exampleText}>{example}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    /* Voice Mode */
                                    <View style={styles.voiceContainer}>
                                        {!audioUri ? (
                                            <View style={styles.recordingControls}>
                                                <Text style={styles.timerText}>
                                                    00:{recordingDuration.toString().padStart(2, '0')} / 00:{MAX_AUDIO_DURATION}
                                                </Text>
                                                <TouchableOpacity
                                                    style={[styles.recordButton, isRecording && styles.recordingActive]}
                                                    onPress={isRecording ? stopRecording : startRecording}
                                                >
                                                    {isRecording ? (
                                                        <Square size={32} color="#fff" fill="#fff" />
                                                    ) : (
                                                        <Mic size={32} color="#fff" />
                                                    )}
                                                </TouchableOpacity>
                                                <Text style={styles.recordingStatus}>
                                                    {isRecording ? 'Recording...' : 'Tap to Record'}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={styles.playbackControls}>
                                                <TouchableOpacity onPress={isPlaying ? pauseSound : playSound}>
                                                    {isPlaying ? (
                                                        <Pause size={40} color={Colors.primary} fill={Colors.primary} />
                                                    ) : (
                                                        <Play size={40} color={Colors.primary} fill={Colors.primary} />
                                                    )}
                                                </TouchableOpacity>
                                                <View style={styles.waveformPlaceholder}>
                                                    <View style={[styles.progressBar, { width: `${(playbackPosition / (soundDuration || 1)) * 100}%` }]} />
                                                </View>
                                                <TouchableOpacity onPress={deleteRecording} style={styles.deleteButton}>
                                                    <Trash2 size={24} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        <Text style={styles.voiceNote}>
                                            Max 30 seconds. Voice motivations are audio only.
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Buttons */}
                            <View style={styles.buttons}>
                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={onClose}
                                    disabled={submitting}
                                >
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.submitButton,
                                        (!canSubmit || submitting) && styles.submitButtonDisabled,
                                    ]}
                                    onPress={handleSend}
                                    disabled={!canSubmit || submitting}
                                >
                                    <LinearGradient
                                        colors={
                                            canSubmit && !submitting
                                                ? Colors.gradientPrimary
                                                : ['#9CA3AF', '#6B7280']
                                        }
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.submitButtonGradient}
                                    >
                                        <Text style={styles.submitButtonText}>
                                            {submitting ? 'Sending...' : 'Send'}
                                        </Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
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
        padding: 20,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#FFFFFF',
        opacity: 0.9,
    },
    tabs: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    tab: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
    },
    activeTab: {
        borderBottomWidth: 2,
        borderBottomColor: Colors.secondary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    activeTabText: {
        color: Colors.secondary,
    },
    contentContainer: {
        padding: 20,
    },
    errorBanner: {
        backgroundColor: '#fef2f2',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    errorText: {
        fontSize: 13,
        color: '#dc2626',
        textAlign: 'center',
    },
    inputContainer: {
        marginBottom: 16,
    },
    textInput: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#111827',
        minHeight: 120,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    charCount: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 8,
    },
    attachmentContainer: {
        marginBottom: 16,
    },
    attachButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        alignSelf: 'flex-start',
        gap: 8,
    },
    attachButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
    },
    imagePreview: {
        position: 'relative',
        width: 100,
        height: 100,
        borderRadius: 8,
        overflow: 'hidden',
    },
    attachedImage: {
        width: '100%',
        height: '100%',
    },
    removeImageButton: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
        padding: 4,
    },
    examplesToggle: {
        paddingVertical: 8,
    },
    examplesToggleText: {
        fontSize: 14,
        color: Colors.secondary,
        fontWeight: '600',
    },
    examplesContainer: {
        marginTop: 8,
        gap: 8,
    },
    exampleCard: {
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        padding: 12,
    },
    exampleText: {
        fontSize: 14,
        color: '#4B5563',
    },
    voiceContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    recordingControls: {
        alignItems: 'center',
        gap: 16,
    },
    timerText: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
        fontVariant: ['tabular-nums'],
    },
    recordButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    recordingActive: {
        transform: [{ scale: 1.1 }],
        borderRadius: 24, // Square-ish when recording
    },
    recordingStatus: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    playbackControls: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        gap: 16,
        backgroundColor: '#F3F4F6',
        padding: 16,
        borderRadius: 12,
    },
    waveformPlaceholder: {
        flex: 1,
        height: 4,
        backgroundColor: '#E5E7EB',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: Colors.secondary,
    },
    deleteButton: {
        padding: 8,
    },
    voiceNote: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 16,
    },
    buttons: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
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
    successContainer: {
        alignItems: 'center',
        paddingVertical: 40,
        gap: 12,
    },
    successText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    successSubtext: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
});

export default MotivationModal;
