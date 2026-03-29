import { useState, useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../utils/logger';
import { useToast } from '../context/ToastContext';

export const MAX_AUDIO_DURATION = 30; // seconds

export const EXAMPLE_MESSAGES = [
    "You're doing amazing! Keep up the great work! 💪",
    "I'm so proud of your progress!",
    "Each session brings you closer to your goal!",
    "Your dedication is truly inspiring! ✨",
    "Remember why you started - you've got this!",
    "Can't wait to see you achieve this! 🌟",
];

export interface MediaComposerState {
    // Audio state
    recording: Audio.Recording | null;
    sound: Audio.Sound | null;
    audioUri: string | null;
    isRecording: boolean;
    isPlaying: boolean;
    recordingDuration: number;
    playbackPosition: number;
    soundDuration: number;
    // Image state
    imageUri: string | null;
    // Functions
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    playSound: () => Promise<void>;
    pauseSound: () => Promise<void>;
    deleteRecording: () => Promise<void>;
    pickImage: () => Promise<void>;
    setImageUri: (uri: string | null) => void;
    resetState: () => Promise<void>;
}

/**
 * Shared hook for audio recording, playback, and image picking logic
 * used by MotivationModal and PersonalizedHintModal.
 *
 * Accepts a `visible` boolean — automatically calls `resetState` when
 * the modal closes (visible transitions to false).
 * Also handles cleanup (sound unload, recording stop) on unmount.
 */
export function useMediaComposer(visible: boolean): MediaComposerState {
    const { showInfo } = useToast();

    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [audioUri, setAudioUri] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [soundDuration, setSoundDuration] = useState(0);
    const [imageUri, setImageUri] = useState<string | null>(null);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);
    // Keep a ref to recording/sound so the cleanup effect always sees latest values
    const recordingRef = useRef<Audio.Recording | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    // Keep refs in sync
    useEffect(() => { recordingRef.current = recording; }, [recording]);
    useEffect(() => { soundRef.current = sound; }, [sound]);

    const resetState = useCallback(async () => {
        // Stop any active recording first so the microphone is released
        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch (e) {
                // ignore — may already be stopped or unloaded
            }
        }
        // Stop any active sound playback
        if (soundRef.current) {
            try {
                await soundRef.current.unloadAsync();
            } catch (e) {
                // ignore — may already be unloaded
            }
        }
        // Clear intervals before nulling state
        if (timerRef.current) clearInterval(timerRef.current);
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        setAudioUri(null);
        setRecording(null);
        setSound(null);
        setIsRecording(false);
        setIsPlaying(false);
        setRecordingDuration(0);
        setPlaybackPosition(0);
        setSoundDuration(0);
        setImageUri(null);
    }, []);

    // Reset when modal closes; cleanup on unmount
    useEffect(() => {
        if (!visible) {
            resetState();
        }
        return () => {
            if (recordingRef.current) {
                // Fire-and-forget cleanup — cannot await in cleanup
                recordingRef.current.stopAndUnloadAsync().catch(() => {});
            }
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(() => {});
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Dedicated interval cleanup and mounted flag on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
            }
        };
    }, []);

    // --- Audio Logic ---
    const startRecording = async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status !== 'granted') {
                showInfo('Please grant microphone permission to record audio.');
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(newRecording);
            setIsRecording(true);
            setRecordingDuration(0);

            // Clear any pre-existing interval before starting a new one to prevent accumulation
            if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingDuration(prev => {
                    const newDuration = prev + 1;
                    if (newDuration >= MAX_AUDIO_DURATION) {
                        // Stop recording on next tick to avoid calling async function in setState
                        setTimeout(() => stopRecording(), 0);
                    }
                    return newDuration;
                });
            }, 1000);
        } catch (err: unknown) {
            logger.error('Failed to start recording', err);
        }
    };

    const stopRecording = async () => {
        const currentRecording = recordingRef.current;
        if (!currentRecording) return;

        if (timerRef.current) clearInterval(timerRef.current);
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        setIsRecording(false);

        try {
            await currentRecording.stopAndUnloadAsync();
            const uri = currentRecording.getURI();
            setAudioUri(uri);
            setRecording(null);
        } catch (error: unknown) {
            logger.error('Failed to stop recording', error);
        }
    };

    const playSound = async () => {
        if (!audioUri) return;

        try {
            const currentSound = soundRef.current;
            if (currentSound) {
                await currentSound.playAsync();
                setIsPlaying(true);
            } else {
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: audioUri },
                    { shouldPlay: true }
                );
                // Guard: if component unmounted while createAsync was pending, unload immediately
                if (!mountedRef.current) {
                    newSound.unloadAsync().catch(() => {});
                    return;
                }
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
        } catch (error: unknown) {
            logger.error('Error playing sound', error);
        }
    };

    const pauseSound = async () => {
        if (soundRef.current) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
        }
    };

    const deleteRecording = async () => {
        if (soundRef.current) {
            await soundRef.current.unloadAsync();
        }
        setSound(null);
        setAudioUri(null);
        setIsPlaying(false);
        setRecordingDuration(0);
        setPlaybackPosition(0);
        setSoundDuration(0);
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

    return {
        recording,
        sound,
        audioUri,
        isRecording,
        isPlaying,
        recordingDuration,
        playbackPosition,
        soundDuration,
        imageUri,
        startRecording,
        stopRecording,
        playSound,
        pauseSound,
        deleteRecording,
        pickImage,
        setImageUri,
        resetState,
    };
}
