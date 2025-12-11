import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Image,
} from 'react-native';
import { X, MessageCircle, Mic, Image as ImageIcon } from 'lucide-react-native';
import { Goal, PersonalizedHint } from '../types';

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

    const renderHint = (hint: PersonalizedHint | { session: number; hint: string; date: number }, index: number) => {
        //Handle both hint types
        const isPersonalizedHint = 'type' in hint;

        if (isPersonalizedHint) {
            const pHint = hint as PersonalizedHint;
            return (
                <View key={index} style={styles.hintCard}>
                    <View style={styles.hintHeader}>
                        <View style={styles.hintTypeIcon}>
                            {pHint.type === 'audio' || pHint.type === 'mixed' ? (
                                <Mic size={16} color="#7C3AED" />
                            ) : pHint.type === 'image' ? (
                                <ImageIcon size={16} color="#7C3AED" />
                            ) : (
                                <MessageCircle size={16} color="#7C3AED" />
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
                            <Mic size={16} color="#6b7280" />
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
                            <MessageCircle size={16} color="#7C3AED" />
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
                return '#FEF3C7';
            case 'image':
                return '#DBEAFE';
            case 'mixed':
                return '#F3E8FF';
            default:
                return '#E0E7FF';
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Hint History</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={24} color="#111827" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subtitle}>
                        {goal.title}
                    </Text>

                    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                        {hints.length === 0 ? (
                            <View style={styles.emptyState}>
                                <MessageCircle size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No hints sent yet</Text>
                                <Text style={styles.emptySubtext}>
                                    Hints you send will appear here for future reference
                                </Text>
                            </View>
                        ) : (
                            hints.map((hint, index) => renderHint(hint, index))
                        )}
                        <View style={{ height: 20 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 24,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        marginBottom: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        padding: 4,
    },
    subtitle: {
        fontSize: 15,
        color: '#6B7280',
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    scrollView: {
        paddingHorizontal: 24,
    },
    hintCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
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
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    sessionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 2,
    },
    dateText: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    typeBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#4B5563',
        textTransform: 'uppercase',
    },
    hintText: {
        fontSize: 15,
        color: '#374151',
        lineHeight: 22,
    },
    hintImage: {
        width: '100%',
        height: 180,
        borderRadius: 8,
        marginTop: 12,
        backgroundColor: '#E5E7EB',
    },
    audioIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        padding: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    audioText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#9CA3AF',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#D1D5DB',
        marginTop: 8,
        textAlign: 'center',
        maxWidth: 250,
    },
});
