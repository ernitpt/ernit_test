import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { logger } from '../utils/logger';
import { Play, Pause } from 'lucide-react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { useToast } from '../context/ToastContext';

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPlayerProps {
    uri: string;
    duration?: number;
    variant?: 'default' | 'popup';
}

const AudioPlayer = ({ uri, duration, variant = 'default' }: AudioPlayerProps) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { showError } = useToast();
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [position, setPosition] = useState(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        return () => {
            if (sound) sound.unloadAsync();
        };
    }, [sound]);

    const togglePlayback = async () => {
        try {
            if (!sound) {
                setIsLoading(true);
                const { sound: newSound } = await Audio.Sound.createAsync({ uri });
                if (!mountedRef.current) {
                    newSound.unloadAsync();
                    return;
                }
                setIsLoading(false);
                setSound(newSound);
                newSound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded) {
                        setPosition(status.positionMillis);
                        setIsPlaying(status.isPlaying);
                        if (status.didJustFinish) {
                            setIsPlaying(false);
                            setPosition(0);
                            newSound.setPositionAsync(0);
                        }
                    }
                });
                await newSound.playAsync();
            } else {
                if (isPlaying) {
                    await sound.pauseAsync();
                } else {
                    await sound.playAsync();
                }
            }
        } catch (error: unknown) {
            setIsLoading(false);
            logger.error("Error loading audio:", error);
            showError('Failed to load audio');
        }
    };

    const isPopup = variant === 'popup';

    return (
        <View style={[styles.audioPlayer, isPopup && styles.audioPlayerPopup]}>
            <TouchableOpacity onPress={togglePlayback} disabled={isLoading} style={[styles.playButton, isPopup && styles.playButtonPopup]} accessibilityLabel={isLoading ? "Loading" : isPlaying ? "Pause" : "Play"} accessibilityRole="button">
                {isLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                ) : isPlaying ? (
                    <Pause size={isPopup ? 24 : 16} color={colors.white} />
                ) : (
                    <Play size={isPopup ? 24 : 16} color={colors.white} />
                )}
            </TouchableOpacity>
            <View style={styles.audioInfo}>
                <View style={[styles.audioProgress, isPopup && styles.audioProgressPopup]}>
                    <View
                        style={[
                            styles.progressBar,
                            { width: `${Math.min((position / ((duration || 1) * 1000)) * 100, 100)}%` }
                        ]}
                    />
                </View>
                <Text style={[styles.audioDuration, isPopup && styles.audioDurationPopup]}>
                    {formatDuration(duration || 0)}
                </Text>
            </View>
        </View>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    audioPlayer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.gray700,
        borderRadius: BorderRadius.xl,
        padding: Spacing.sm,
        paddingRight: Spacing.lg,
        marginTop: Spacing.sm,
        alignSelf: 'flex-start',
    },
    audioPlayerPopup: {
        backgroundColor: colors.primary,
        borderRadius: BorderRadius.xxl,
        padding: Spacing.md,
        paddingRight: Spacing.xl,
        alignSelf: 'stretch',
        shadowColor: colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    playButton: {
        width: 32,
        height: 32,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.md,
    },
    playButtonPopup: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.whiteAlpha25,
        marginRight: Spacing.lg,
    },
    audioInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    audioProgress: {
        width: '100%',
        height: 4,
        backgroundColor: colors.gray600,
        borderRadius: 2,
        marginBottom: Spacing.xs,
        overflow: 'hidden',
    },
    audioProgressPopup: {
        height: 6,
        backgroundColor: colors.whiteAlpha25,
        borderRadius: 3,
    },
    progressBar: {
        height: '100%',
        backgroundColor: colors.white,
    },
    audioDuration: {
        color: colors.gray300,
        ...Typography.caption,
        fontVariant: ['tabular-nums'],
    },
    audioDurationPopup: {
        color: colors.white,
        ...Typography.caption,
        fontWeight: '600',
    },
});

export default React.memo(AudioPlayer);
