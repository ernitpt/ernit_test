
import React, { useMemo, useState } from 'react';
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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useMediaComposer, EXAMPLE_MESSAGES, MAX_AUDIO_DURATION } from '../hooks/useMediaComposer';
import { createCommonStyles } from '../styles/commonStyles';
import { Trash2, Mic, Square, Play, Pause, Image as ImageIcon, X } from 'lucide-react-native';
import { logger } from '../utils/logger';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { useToast } from '../context/ToastContext';

export interface HintSubmission {
    type: 'text' | 'audio' | 'image' | 'mixed';
    text?: string;
    audioUri?: string;
    imageUri?: string;
    duration?: number;
}

interface PersonalizedHintModalProps {
    visible: boolean;
    recipientName: string;
    sessionNumber: number;
    onClose: () => void;
    onSubmit: (hint: HintSubmission) => Promise<void>;
}

const MAX_HINT_LENGTH = 100;

export const PersonalizedHintModal: React.FC<PersonalizedHintModalProps> = React.memo(({
    visible,
    recipientName,
    sessionNumber,
    onClose,
    onSubmit,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const commonStyles = useMemo(() => createCommonStyles(colors), [colors]);

    const { showError } = useToast();
    const [mode, setMode] = useState<'text' | 'voice'>('text');
    const [hintText, setHintText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showExamples, setShowExamples] = useState(false);

    const media = useMediaComposer(visible);
    const slideAnim = useModalAnimation(visible);

    // --- Submission ---
    const handleSubmit = async () => {
        if (submitting) return;

        setSubmitting(true);
        try {
            let submission: HintSubmission;

            if (mode === 'voice') {
                if (!media.audioUri) {
                    setSubmitting(false);
                    return;
                }
                submission = {
                    type: 'audio',
                    audioUri: media.audioUri,
                    duration: media.recordingDuration || media.soundDuration,
                };
            } else {
                if (!hintText.trim() && !media.imageUri) {
                    showError('Please enter a hint message');
                    setSubmitting(false);
                    return;
                }
                submission = {
                    type: media.imageUri ? (hintText.trim() ? 'mixed' : 'image') : 'text',
                    text: hintText.trim(),
                    imageUri: media.imageUri || undefined,
                };
            }

            await onSubmit(submission);
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            onClose();
        } catch (error) {
            logger.error('Error submitting hint:', error);
            showError('Failed to send hint. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmit = mode === 'voice'
        ? !!media.audioUri
        : (hintText.trim().length > 0 || !!media.imageUri);

    const remainingChars = MAX_HINT_LENGTH - hintText.length;

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

                <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]} accessibilityViewIsModal={true}>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                    >
                        {/* Header */}
                        <LinearGradient
                            colors={colors.gradientPrimary}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.header}
                        >
                            <Text style={styles.headerTitle}>Leave a Hint</Text>
                            <Text style={styles.headerSubtitle}>
                                For session #{sessionNumber}
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
                            {mode === 'text' ? (
                                <>
                                    {/* Text Input */}
                                    <View style={styles.inputContainer}>
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Your encouraging hint..."
                                            placeholderTextColor={colors.textMuted}
                                            value={hintText}
                                            onChangeText={setHintText}
                                            multiline
                                            maxLength={MAX_HINT_LENGTH}
                                            textAlignVertical="top"
                                        />
                                        <Text style={styles.charCount}>
                                            {remainingChars} characters remaining
                                        </Text>
                                    </View>

                                    {/* Image Attachment */}
                                    <View style={styles.attachmentContainer}>
                                        {media.imageUri ? (
                                            <View style={styles.imagePreview}>
                                                <Image source={{ uri: media.imageUri }} style={styles.attachedImage} />
                                                <TouchableOpacity
                                                    style={styles.removeImageButton}
                                                    onPress={() => media.setImageUri(null)}
                                                >
                                                    <X size={16} color={colors.white} />
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <TouchableOpacity style={styles.attachButton} onPress={media.pickImage}>
                                                <ImageIcon size={20} color={colors.primary} />
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
                                                    onPress={() => setHintText(example)}
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
                                    {!media.audioUri ? (
                                        <View style={styles.recordingControls}>
                                            <Text style={styles.timerText}>
                                                00:{media.recordingDuration.toString().padStart(2, '0')} / 00:{MAX_AUDIO_DURATION}
                                            </Text>
                                            <TouchableOpacity
                                                style={[styles.recordButton, media.isRecording && styles.recordingActive]}
                                                onPress={media.isRecording ? media.stopRecording : media.startRecording}
                                            >
                                                {media.isRecording ? (
                                                    <Square size={32} color={colors.white} fill={colors.white} />
                                                ) : (
                                                    <Mic size={32} color={colors.white} />
                                                )}
                                            </TouchableOpacity>
                                            <Text style={styles.recordingStatus}>
                                                {media.isRecording ? 'Recording...' : 'Tap to Record'}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={styles.playbackControls}>
                                            <TouchableOpacity onPress={media.isPlaying ? media.pauseSound : media.playSound}>
                                                {media.isPlaying ? (
                                                    <Pause size={40} color={colors.primary} fill={colors.primary} />
                                                ) : (
                                                    <Play size={40} color={colors.primary} fill={colors.primary} />
                                                )}
                                            </TouchableOpacity>
                                            <View style={styles.waveformPlaceholder}>
                                                <View style={[styles.progressBar, { width: `${(media.playbackPosition / (media.soundDuration || 1)) * 100}%` }]} />
                                            </View>
                                            <TouchableOpacity onPress={media.deleteRecording} style={styles.deleteButton}>
                                                <Trash2 size={24} color={colors.error} />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    <Text style={styles.voiceNote}>
                                        Max 30 seconds. Voice hints are audio only.
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
                                onPress={handleSubmit}
                                disabled={!canSubmit || submitting}
                            >
                                <LinearGradient
                                    colors={
                                        canSubmit && !submitting
                                            ? colors.gradientPrimary
                                            : colors.gradientDisabled
                                    }
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.submitButtonGradient}
                                >
                                    <Text style={styles.submitButtonText}>
                                        {submitting ? 'Sending...' : 'Send Hint'}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
});

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        modalContent: {
            width: '90%',
            maxWidth: 500,
            maxHeight: '85%',
            backgroundColor: colors.white,
            borderRadius: BorderRadius.xl,
            overflow: 'hidden',
            elevation: 10,
            shadowColor: colors.black,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
        },
        header: {
            padding: Spacing.xl,
            alignItems: 'center',
        },
        headerTitle: {
            ...Typography.large,
            color: colors.white,
            marginBottom: Spacing.xs,
        },
        headerSubtitle: {
            ...Typography.small,
            color: colors.white,
            opacity: 0.9,
        },
        tabs: {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        tab: {
            flex: 1,
            paddingVertical: Spacing.lg,
            alignItems: 'center',
        },
        activeTab: {
            borderBottomWidth: 2,
            borderBottomColor: colors.secondary,
        },
        tabText: {
            ...Typography.small,
            fontWeight: '600',
            color: colors.gray600,
        },
        activeTabText: {
            color: colors.secondary,
        },
        contentContainer: {
            padding: Spacing.xl,
        },
        inputContainer: {
            marginBottom: Spacing.lg,
        },
        textInput: {
            backgroundColor: colors.surface,
            borderRadius: BorderRadius.md,
            padding: Spacing.lg,
            ...Typography.subheading,
            color: colors.textPrimary,
            minHeight: Spacing.textareaMinHeight,
            borderWidth: 1,
            borderColor: colors.border,
        },
        charCount: {
            ...Typography.caption,
            color: colors.textMuted,
            textAlign: 'right',
            marginTop: Spacing.sm,
        },
        attachmentContainer: {
            marginBottom: Spacing.lg,
        },
        attachButton: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing.md,
            backgroundColor: colors.backgroundLight,
            borderRadius: BorderRadius.sm,
            alignSelf: 'flex-start',
            gap: Spacing.sm,
        },
        attachButtonText: {
            ...Typography.small,
            fontWeight: '600',
            color: colors.gray700,
        },
        imagePreview: {
            position: 'relative',
            width: 100,
            height: 100,
            borderRadius: BorderRadius.sm,
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
            backgroundColor: colors.overlay,
            borderRadius: BorderRadius.md,
            padding: Spacing.xs,
        },
        examplesToggle: {
            paddingVertical: Spacing.sm,
        },
        examplesToggleText: {
            ...Typography.small,
            color: colors.secondary,
            fontWeight: '600',
        },
        examplesContainer: {
            marginTop: Spacing.sm,
            gap: Spacing.sm,
        },
        exampleCard: {
            backgroundColor: colors.backgroundLight,
            borderRadius: BorderRadius.sm,
            padding: Spacing.md,
        },
        exampleText: {
            ...Typography.small,
            color: colors.gray700,
        },
        voiceContainer: {
            alignItems: 'center',
            paddingVertical: Spacing.xl,
        },
        recordingControls: {
            alignItems: 'center',
            gap: Spacing.lg,
        },
        timerText: {
            ...Typography.heading1,
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        recordButton: {
            width: 72,
            height: 72,
            borderRadius: BorderRadius.circle,
            backgroundColor: colors.error,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 4,
            shadowColor: colors.error,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
        },
        recordingActive: {
            transform: [{ scale: 1.1 }],
            borderRadius: BorderRadius.xxl, // Square-ish when recording
        },
        recordingStatus: {
            ...Typography.small,
            color: colors.gray600,
            fontWeight: '500',
        },
        playbackControls: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            gap: Spacing.lg,
            backgroundColor: colors.backgroundLight,
            padding: Spacing.lg,
            borderRadius: BorderRadius.md,
        },
        waveformPlaceholder: {
            flex: 1,
            height: 4,
            backgroundColor: colors.border,
            borderRadius: 2,
            overflow: 'hidden',
        },
        progressBar: {
            height: '100%',
            backgroundColor: colors.secondary,
        },
        deleteButton: {
            padding: Spacing.sm,
        },
        voiceNote: {
            ...Typography.caption,
            color: colors.textMuted,
            marginTop: Spacing.lg,
        },
        buttons: {
            flexDirection: 'row',
            padding: Spacing.xl,
            gap: Spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        cancelButton: {
            flex: 1,
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
        },
        cancelButtonText: {
            ...Typography.subheading,
            color: colors.gray600,
        },
        submitButton: {
            flex: 1,
            borderRadius: BorderRadius.md,
            overflow: 'hidden',
        },
        submitButtonDisabled: {
            opacity: 0.6,
        },
        submitButtonGradient: {
            paddingVertical: Spacing.md,
            alignItems: 'center',
        },
        submitButtonText: {
            ...Typography.subheading,
            fontWeight: '700',
            color: colors.white,
        },
    });
