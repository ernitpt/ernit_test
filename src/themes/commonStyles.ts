import { StyleSheet, Platform } from 'react-native';
import Colors from '../config/colors';
import { Spacing } from '../config/spacing';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';

export const commonStyles = StyleSheet.create({
    gradientHeader: {
        borderBottomLeftRadius: BorderRadius.xxl,
        borderBottomRightRadius: BorderRadius.xxl,
        overflow: 'hidden',
        paddingBottom: Spacing.xl,
        paddingTop: Spacing.xxxl,
    },
    header: {
        paddingHorizontal: Spacing.xxl,
        paddingBottom: Spacing.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: Typography.heading1.fontSize,
        fontWeight: '700',
        color: Colors.white,
    },
});