import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Animated,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';

interface HowItWorksModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function HowItWorksModal({ visible, onClose }: HowItWorksModalProps) {
    const slideAnim = useModalAnimation(visible, {
        initialValue: 1000,
        tension: 80,
        friction: 10,
    });

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
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>How Ernit Works</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={24} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Example Header */}
                        <View style={styles.exampleHeader}>
                            <Text style={styles.exampleIcon}>🧗‍♀️</Text>
                            <Text style={styles.exampleTitle}>
                                Example: Sarah's Rock Climbing Gift
                            </Text>
                        </View>

                        {/* Step 1 */}
                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>1</Text>
                            </View>
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Mike buys the experience</Text>
                                <Text style={styles.stepDescription}>
                                    Mike chooses a rock climbing session for Sarah and purchases it as a gift. Sarah will know what the gift is once she completes her goal.
                                </Text>
                            </View>
                        </View>

                        {/* Step 2 */}
                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>2</Text>
                            </View>
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Sarah sets a goal</Text>
                                <Text style={styles.stepDescription}>
                                    Sarah receives a code and sets her challenge: "Go to the gym 3x per week for 4 weeks"
                                </Text>
                            </View>
                        </View>

                        {/* Step 3 */}
                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>3</Text>
                            </View>
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Hints reveal clues</Text>
                                <Text style={styles.stepDescription}>
                                    Each gym session, Sarah gets AI generated motivational hints.
                                </Text>
                            </View>
                        </View>

                        {/* Step 4 */}
                        <View style={styles.step}>
                            <View style={styles.stepNumber}>
                                <Text style={styles.stepNumberText}>4</Text>
                            </View>
                            <View style={styles.stepContent}>
                                <Text style={styles.stepTitle}>Goal complete = Surprise unlocked!</Text>
                                <Text style={styles.stepDescription}>
                                    Sarah completes her goal and unlocks the surprise: a rock climbing session! 🎉
                                </Text>
                            </View>
                        </View>

                        {/* Call to Action */}
                        <View style={styles.ctaContainer}>
                            <Text style={styles.ctaText}>
                                Motivation meets reward. That's Ernit! 💪
                            </Text>
                        </View>
                    </ScrollView>

                    {/* Bottom Button */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity onPress={onClose} style={styles.gotItButton}>
                            <Text style={styles.gotItButtonText}>Got it, let's start!</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContainer: {
        height: '85%',
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        padding: 4,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 10,
    },
    exampleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        backgroundColor: '#f9fafb',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    exampleIcon: {
        fontSize: 32,
        marginRight: 12,
    },
    exampleTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
        flex: 1,
    },
    step: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    stepNumber: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#8b5cf6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        marginTop: 2,
    },
    stepNumberText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 6,
    },
    stepDescription: {
        fontSize: 15,
        color: '#6b7280',
        lineHeight: 21,
    },
    ctaContainer: {
        marginTop: 12,
        padding: 16,
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    ctaText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#8b5cf6',
        textAlign: 'center',
    },
    buttonContainer: {
        padding: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    gotItButton: {
        backgroundColor: '#8b5cf6',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    gotItButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
