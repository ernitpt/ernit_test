import React from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Image,
} from 'react-native';
import { MessageCircle, Mic, Image as ImageIcon } from 'lucide-react-native';
import { Goal, PersonalizedHint } from '../types';
import Colors from '../config/colors';
import { EmptyState } from './EmptyState';
import { BaseModal } from './BaseModal';

interface HintHistoryModalProps {
    visible: boolean;
    goal: Goal;
    onClose: () => void;
}

export const HintHistoryModal: React.FC<HintHistoryModalProps> = ({
    visible,
    goal,
    onClose,
}) => {
    const hints = goal.hints || [];

    const formatDate = (date: any) => {
        let d: Date;

        // Handle Firestore Timestamp
        if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
            d = date.toDate();
        }
        // Handle number (milliseconds)
        else if (typeof date === 'number') {
            d = new Date(date);
        }
        // Handle Date object
        else if (date instanceof Date) {
            d = date;
        }
        // Fallback
        else {
            d = new Date(date);
        }

        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const renderHint = (hint: NonNullable<Goal['hints']>[number], index: number) => {
        //Handle both hint types
        const isPersonalizedHint = 'type' in hint;

        if (isPersonalizedHint) {
            const pHint = hint as PersonalizedHint;
            return (
                <View key={index} style={styles.hintCard}>
                    <View style={styles.hintHeader}>
                        <View style={styles.hintTypeIcon}>
                            {pHint.type === 'audio' || pHint.type === 'mixed' ? (
                                <Mic size={16} color={Colors.primary} />
                            ) : pHint.type === 'image' ? (
                                <ImageIcon size={16} color={Colors.primary} />
                            ) : (
                                <MessageCircle size={16} color={Colors.primary} />
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sessionLabel}>Session {pHint.forSessionNumber}</Text>
                            <Text style={styles.dateText}>{formatDate(pHint.createdAt)}</Text>
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: getTypeBadgeColor(pHint.type) }]}>
                            <Text style={styles.typeBadgeText}>{pHint.type}</Text>
                        </View>
                    </View>

                    {pHint.text && (
                        <Text style={styles.hintText}>{pHint.text}</Text>
                    )}

                    {pHint.imageUrl && (
                        <Image source={{ uri: pHint.imageUrl }} style={styles.hintImage} resizeMode="cover" />
                    )}

                    {pHint.audioUrl && (
                        <View style={styles.audioIndicator}>
                            <Mic size={16} color={Colors.textSecondary} />
                            <Text style={styles.audioText}>
                                Voice message{pHint.duration ? ` (${pHint.duration}s)` : ''}
                            </Text>
                        </View>
                    )}
                </View>
            );
        } else {
            // Legacy hint format
            const legacyHint = hint as { session: number; hint: string; date: number };
            return (
                <View key={index} style={styles.hintCard}>
                    <View style={styles.hintHeader}>
                        <View style={styles.hintTypeIcon}>
                            <MessageCircle size={16} color={Colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sessionLabel}>Session {legacyHint.session}</Text>
                            <Text style={styles.dateText}>{formatDate(legacyHint.date)}</Text>
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: '#E0E7FF' }]}>
                            <Text style={styles.typeBadgeText}>text</Text>
                        </View>
                    </View>
                    <Text style={styles.hintText}>{legacyHint.hint}</Text>
                </View>
            );
        }
    };

    const getTypeBadgeColor = (type: string) => {
        switch (type) {
            case 'audio':
                return Colors.warningLight;
            case 'image':
                return Colors.infoLight;
            case 'mixed':
                return Colors.primarySurface;
            default:
                return '#E0E7FF';
        }
    };

    return (
        <BaseModal visible={visible} onClose={onClose} title="Hint History" variant="bottom" noPadding>
            <Text style={styles.subtitle}>
                {goal.title}
            </Text>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {hints.length === 0 ? (
                    <EmptyState
                        icon="💡"
                        title="No hints sent yet"
                        message="Hints you send will appear here for future reference"
                    />
                ) : (
                    hints.map((hint, index) => renderHint(hint, index))
                )}
                <View style={{ height: 20 }} />
            </ScrollView>
        </BaseModal>
    );
};

const styles = StyleSheet.create({
    subtitle: {
        fontSize: 15,
        color: Colors.textSecondary,
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    scrollView: {
        paddingHorizontal: 24,
    },
    hintCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    hintHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    hintTypeIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    sessionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    dateText: {
        fontSize: 12,
        color: Colors.textMuted,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    typeBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.gray600,
        textTransform: 'uppercase',
    },
    hintText: {
        fontSize: 15,
        color: Colors.gray700,
        lineHeight: 22,
    },
    hintImage: {
        width: '100%',
        height: 180,
        borderRadius: 8,
        marginTop: 12,
        backgroundColor: Colors.border,
    },
    audioIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        padding: 12,
        backgroundColor: Colors.white,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    audioText: {
        marginLeft: 8,
        fontSize: 14,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
});
