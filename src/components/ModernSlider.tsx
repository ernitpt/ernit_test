import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, GestureResponderEvent, LayoutChangeEvent, DimensionValue } from 'react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

interface ModernSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (val: number) => void;
    leftLabel: string;
    rightLabel: string;
    unit?: string;
    unitPlural?: string;
}

const ModernSlider = ({
    label, value, min, max, onChange, leftLabel, rightLabel, unit, unitPlural,
}: ModernSliderProps) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const { width } = useWindowDimensions();
    const [trackWidth, setTrackWidth] = useState(width - 96);

    const trackRef = useRef<View>(null);
    const trackPageX = useRef(0);

    const handlePress = (event: GestureResponderEvent) => {
        // Guard: skip calculation if onLayout hasn't fired yet (trackPageX is still 0)
        if (trackPageX.current === 0) return;
        const { pageX } = event.nativeEvent;
        const relativeX = pageX - trackPageX.current;
        const percentage = Math.max(0, Math.min(1, relativeX / trackWidth));
        const newValue = Math.round(min + percentage * (max - min));
        onChange(newValue);
    };

    // Guard against div-by-zero when max === min
    const progress = (max - min) > 0 ? ((value - min) / (max - min)) * 100 : 0;
    const displayUnit = unit && unitPlural ? (value === 1 ? unit : unitPlural) : '';

    return (
        <View
            style={styles.sliderContainer}
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityValue={{ min, max, now: value }}
        >
            <Text style={styles.sliderTitle}>{label}</Text>
            <View style={styles.sliderValueRow}>
                <Text style={styles.sliderValue}>{value}</Text>
                {displayUnit ? <Text style={styles.sliderUnit}>{displayUnit}</Text> : null}
            </View>
            <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabelText}>{leftLabel}</Text>
                <Text style={styles.sliderLabelText}>{rightLabel}</Text>
            </View>
            <View
                style={styles.sliderTouchArea}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={handlePress}
                onResponderMove={handlePress}
            >
                <View
                    ref={trackRef}
                    style={styles.sliderTrack}
                    onLayout={(e: LayoutChangeEvent) => {
                        const w = e.nativeEvent.layout.width;
                        setTrackWidth(w);
                        trackRef.current?.measure((_fx, _fy, _width, _height, px) => {
                            trackPageX.current = px;
                        });
                    }}
                >
                    <View style={[styles.sliderProgress, { width: `${progress}%` as DimensionValue }]} />
                    <View style={[styles.sliderThumb, { left: (progress / 100) * trackWidth - 12 }]}>
                        <View style={styles.sliderThumbInner} />
                    </View>
                </View>
            </View>
        </View>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        sliderContainer: {
            backgroundColor: colors.white,
            borderRadius: BorderRadius.xl,
            padding: Spacing.xxl,
            borderWidth: 1,
            borderColor: colors.backgroundLight,
        },
        sliderTitle: {
            ...Typography.smallBold,
            color: colors.textSecondary,
            marginBottom: Spacing.sm,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        sliderValueRow: {
            flexDirection: 'row',
            alignItems: 'baseline',
            marginBottom: Spacing.xl,
            gap: Spacing.sm,
        },
        sliderValue: {
            ...Typography.display,
            fontWeight: '900',
            color: colors.gray800,
        },
        sliderUnit: {
            ...Typography.heading3,
            color: colors.textSecondary,
        },
        sliderLabels: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: Spacing.md,
        },
        sliderLabelText: {
            ...Typography.caption,
            fontWeight: '600',
            color: colors.textMuted,
        },
        sliderTouchArea: {
            paddingVertical: 20,
            marginVertical: -20,
            width: '100%',
        },
        sliderTrack: {
            height: 8,
            backgroundColor: colors.border,
            borderRadius: BorderRadius.xs,
            position: 'relative',
            width: '100%',
        },
        sliderProgress: {
            height: '100%' as DimensionValue,
            backgroundColor: colors.primary,
            borderRadius: BorderRadius.xs,
        },
        sliderThumb: {
            position: 'absolute',
            top: -8,
            width: 24,
            height: 24,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.white,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: colors.black,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4,
        },
        sliderThumbInner: {
            width: 12,
            height: 12,
            borderRadius: BorderRadius.xs,
            backgroundColor: colors.primary,
        },
    });

export default React.memo(ModernSlider);
