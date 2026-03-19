import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import Colors from '../config/colors';
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

export const BookingCalendar: React.FC<BookingCalendarProps> = ({
    visible,
    selectedDate: initialDate,
    onConfirm,
    onCancel,
    minimumDate = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })(),
}) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const slideAnim = useModalAnimation(visible);

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

    const goToPreviousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const isDateDisabled = (date: Date | null) => {
        if (!date) return true;
        return date < minimumDate;
    };

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

    const handleDateSelect = (date: Date | null) => {
        if (!date || isDateDisabled(date)) return;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedDate(date);
    };

    const handleConfirm = () => {
        onConfirm(selectedDate);
    };

    const formattedDate = selectedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onCancel}
            >
                <Animated.View
                    style={[
                        styles.calendarContainer,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                    accessibilityViewIsModal={true}
                >
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        {/* Custom Title */}
                        <View style={styles.titleContainer}>
                            <Text style={styles.title}>When do you want to do your experience?</Text>
                        </View>

                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton} accessibilityLabel="Previous month" accessibilityRole="button">
                                <ChevronLeft color={Colors.secondary} size={24} />
                            </TouchableOpacity>

                            <Text style={styles.monthYear}>
                                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                            </Text>

                            <TouchableOpacity onPress={goToNextMonth} style={styles.navButton} accessibilityLabel="Next month" accessibilityRole="button">
                                <ChevronRight color={Colors.secondary} size={24} />
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
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: Colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarContainer: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        width: Math.min(Dimensions.get('window').width * 0.9, 400),
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    titleContainer: {
        marginBottom: Spacing.lg,
        alignItems: 'center',
    },
    title: {
        ...Typography.heading3,
        color: Colors.textPrimary,
        textAlign: 'center',
    },
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
        color: Colors.gray700,
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
        color: Colors.textSecondary,
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
        backgroundColor: Colors.secondary,
    },
    todayDay: {
        borderWidth: 2,
        borderColor: Colors.secondary,
    },
    dayText: {
        ...Typography.body,
        color: Colors.gray700,
        fontWeight: '500',
    },
    disabledDayText: {
        color: Colors.gray300,
    },
    selectedDayText: {
        color: Colors.white,
        fontWeight: '700',
    },
    todayDayText: {
        color: Colors.secondary,
        fontWeight: '700',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: Spacing.lg,
        paddingTop: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        gap: Spacing.md,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    cancelText: {
        color: Colors.textSecondary,
        ...Typography.body,
        fontWeight: '600',
    },
    confirmButton: {
        flex: 2,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.secondary,
        alignItems: 'center',
    },
    confirmText: {
        color: Colors.white,
        ...Typography.body,
        fontWeight: '700',
    },
});
