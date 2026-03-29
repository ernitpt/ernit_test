import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { BaseModal } from './BaseModal';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import Button from './Button';

interface BookingCalendarProps {
    visible: boolean;
    selectedDate: Date;
    onConfirm: (date: Date) => void;
    onCancel: () => void;
    minimumDate?: Date;
}

export const BookingCalendar: React.FC<BookingCalendarProps> = React.memo(({
    visible,
    selectedDate: initialDate,
    onConfirm,
    onCancel,
    minimumDate = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })(),
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(initialDate);

    // Sync internal state when the initialDate prop changes (prop-to-state sync)
    useEffect(() => {
        setSelectedDate(initialDate);
        setCurrentMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    }, [initialDate]);

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (Date | null)[] = [];

        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add all days in month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push(new Date(year, month, day));
        }

        return days;
    };

    const days = getDaysInMonth(currentMonth);
    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // P3-17: wrapped in useCallback — BookingCalendar is React.memo'd; plain functions
    // recreate on every render and defeat memoisation for child TouchableOpacity handlers.
    const goToPreviousMonth = useCallback(() => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    }, []);

    const goToNextMonth = useCallback(() => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }, []);

    const isDateDisabled = useCallback((date: Date | null) => {
        if (!date) return true;
        return date < minimumDate;
    }, [minimumDate]);

    const isDateSelected = (date: Date | null) => {
        if (!date) return false;
        return (
            date.getDate() === selectedDate.getDate() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getFullYear() === selectedDate.getFullYear()
        );
    };

    const isToday = (date: Date | null) => {
        if (!date) return false;
        const today = new Date();
        return (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        );
    };

    const handleDateSelect = useCallback((date: Date | null) => {
        if (!date || isDateDisabled(date)) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedDate(date);
    }, [isDateDisabled]);

    const handleConfirm = useCallback(() => {
        onConfirm(selectedDate);
    }, [onConfirm, selectedDate]);

    return (
        <BaseModal
            visible={visible}
            onClose={onCancel}
            title="When do you want to do your experience?"
            variant="center"
        >
            {/* Month navigation header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton} accessibilityLabel="Previous month" accessibilityRole="button">
                    <ChevronLeft color={colors.secondary} size={24} />
                </TouchableOpacity>

                <Text style={styles.monthYear}>
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </Text>

                <TouchableOpacity onPress={goToNextMonth} style={styles.navButton} accessibilityLabel="Next month" accessibilityRole="button">
                    <ChevronRight color={colors.secondary} size={24} />
                </TouchableOpacity>
            </View>

            {/* Week days */}
            <View style={styles.weekDaysRow}>
                {weekDays.map((day) => (
                    <Text key={day} style={styles.weekDay}>
                        {day}
                    </Text>
                ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.daysGrid}>
                {days.map((date, index) => {
                    const disabled = isDateDisabled(date);
                    const selected = isDateSelected(date);
                    const today = isToday(date);

                    return (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.dayCell,
                                selected && styles.selectedDay,
                                today && !selected && styles.todayDay,
                            ]}
                            onPress={() => handleDateSelect(date)}
                            disabled={disabled}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={date ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : undefined}
                            accessibilityState={{ disabled, selected }}
                        >
                            {date && (
                                <Text
                                    style={[
                                        styles.dayText,
                                        disabled && styles.disabledDayText,
                                        selected && styles.selectedDayText,
                                        today && !selected && styles.todayDayText,
                                    ]}
                                >
                                    {date.getDate()}
                                </Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Footer with Confirm Button */}
            <View style={styles.footer}>
                <Button
                    variant="ghost"
                    title="Cancel"
                    onPress={onCancel}
                    style={styles.cancelButton}
                />
                <Button
                    variant="primary"
                    title={`Book for ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    onPress={handleConfirm}
                    style={styles.confirmButton}
                />
            </View>
        </BaseModal>
    );
});

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    navButton: {
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
    },
    monthYear: {
        ...Typography.heading3,
        color: colors.gray700,
    },
    weekDaysRow: {
        flexDirection: 'row',
        marginBottom: Spacing.md,
    },
    weekDay: {
        flex: 1,
        textAlign: 'center',
        ...Typography.caption,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: `${100 / 7}%`,
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: BorderRadius.md,
        marginVertical: Spacing.xxs,
    },
    selectedDay: {
        backgroundColor: colors.secondary,
    },
    todayDay: {
        borderWidth: 2,
        borderColor: colors.secondary,
    },
    dayText: {
        ...Typography.body,
        color: colors.gray700,
        fontWeight: '500',
    },
    disabledDayText: {
        color: colors.gray300,
    },
    selectedDayText: {
        color: colors.white,
        fontWeight: '700',
    },
    todayDayText: {
        color: colors.secondary,
        fontWeight: '700',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: Spacing.lg,
        paddingTop: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: Spacing.md,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    cancelText: {
        color: colors.textSecondary,
        ...Typography.body,
        fontWeight: '600',
    },
    confirmButton: {
        flex: 2,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.secondary,
        alignItems: 'center',
    },
    confirmText: {
        color: colors.white,
        ...Typography.body,
        fontWeight: '700',
    },
});
