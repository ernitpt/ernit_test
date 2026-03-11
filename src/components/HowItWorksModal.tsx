import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import Colors from '../config/colors';
import { BaseModal } from './BaseModal';

interface HowItWorksModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function HowItWorksModal({ visible, onClose }: HowItWorksModalProps) {
    return (
        <BaseModal visible={visible} onClose={onClose} title="How Ernit Works" variant="bottom" noPadding>
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
                        Motivation meets reward. That's Ernit!
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom Button */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity onPress={onClose} style={styles.gotItButton}>
                    <Text style={styles.gotItButtonText}>Got it, let's start!</Text>
                </TouchableOpacity>
            </View>
        </BaseModal>
    );
}

const styles = StyleSheet.create({
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
        backgroundColor: Colors.surface,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    exampleIcon: {
        fontSize: 32,
        marginRight: 12,
    },
    exampleTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: Colors.textPrimary,
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
        backgroundColor: Colors.secondary,
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
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    stepDescription: {
        fontSize: 15,
        color: Colors.textSecondary,
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
        color: Colors.secondary,
        textAlign: 'center',
    },
    buttonContainer: {
        padding: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: Colors.backgroundLight,
    },
    gotItButton: {
        backgroundColor: Colors.secondary,
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
