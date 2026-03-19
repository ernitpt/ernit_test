import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';

interface WizardProgressBarProps {
    currentStep: number;
    totalSteps: number;
}

const WizardProgressBar = ({ currentStep, totalSteps }: WizardProgressBarProps) => {
    const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    return (
        <View style={styles.progressBar}>
            <View style={styles.progressTrack}>
                <MotiView
                    animate={{ width: `${progress}%` as any }}
                    transition={{ type: 'spring', damping: 100, stiffness: 320 }}
                    style={styles.progressFill}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    progressBar: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.white,
    },
    progressTrack: {
        height: 4,
        borderRadius: BorderRadius.xs,
        backgroundColor: Colors.border,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%' as any,
        borderRadius: BorderRadius.xs,
        backgroundColor: Colors.secondary,
    },
});

export default WizardProgressBar;
