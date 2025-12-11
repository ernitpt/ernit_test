import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { logger } from '../utils/logger';
import { Play, Pause } from 'lucide-react-native';

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
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);

    useEffect(() => {
        return () => {
            if (sound) sound.unloadAsync();
        };
    }, [sound]);

    const togglePlayback = async () => {
        try {
            if (!sound) {
                const { sound: newSound } = await Audio.Sound.createAsync({ uri });
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
        } catch (error) {
            logger.error("Error loading audio:", error);
            Alert.alert('Error', 'Failed to load audio');
        }
    };

    const isPopup = variant === 'popup';

    return (
        <View style={[styles.audioPlayer, isPopup && styles.audioPlayerPopup]}>
            <TouchableOpacity onPress={togglePlayback} style={[styles.playButton, isPopup && styles.playButtonPopup]}>
                {isPlaying ? (
                    <Pause size={isPopup ? 24 : 16} color="#fff" />
                ) : (
                    <Play size={isPopup ? 24 : 16} color="#fff" />
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

const styles = StyleSheet.create({
    audioPlayer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#374151',
        borderRadius: 20,
        padding: 8,
        paddingRight: 16,
        marginTop: 8,
        alignSelf: 'flex-start',
    },
    audioPlayerPopup: {
        backgroundColor: '#7C3AED',
        borderRadius: 24,
        padding: 12,
        paddingRight: 20,
        alignSelf: 'stretch',
        shadowColor: '#7C3AED',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    playButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#6b7280',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    playButtonPopup: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        marginRight: 16,
    },
    audioInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    audioProgress: {
        width: '100%',
        height: 4,
        backgroundColor: '#4b5563',
        borderRadius: 2,
        marginBottom: 6,
        overflow: 'hidden',
    },
    audioProgressPopup: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 3,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#fff',
    },
    audioDuration: {
        color: '#d1d5db',
        fontSize: 12,
        fontVariant: ['tabular-nums'],
    },
    audioDurationPopup: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default AudioPlayer;
