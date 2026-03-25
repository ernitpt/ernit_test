import React, { useMemo } from 'react';
import { View, StyleSheet, DimensionValue } from 'react-native';
import { MotiView } from 'moti';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';

interface WizardProgressBarProps {
    currentStep: number;
    totalSteps: number;
}

const WizardProgressBar = ({ currentStep, totalSteps }: WizardProgressBarProps) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    return (
        <View style={styles.progressBar}>
            <View style={styles.progressTrack}>
                <MotiView
                    animate={{ width: `${progress}%` as DimensionValue }}
                    transition={{ type: 'spring', damping: 100, stiffness: 320 }}
                    style={styles.progressFill}
                />
            </View>
        </View>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        progressBar: {
            paddingHorizontal: Spacing.xl,
            paddingVertical: Spacing.md,
            backgroundColor: colors.white,
        },
        progressTrack: {
            height: 4,
            borderRadius: BorderRadius.xs,
            backgroundColor: colors.border,
            overflow: 'hidden',
        },
        progressFill: {
            height: '100%' as DimensionValue,
            borderRadius: BorderRadius.xs,
            backgroundColor: colors.secondary,
        },
    });

export default WizardProgressBar;
