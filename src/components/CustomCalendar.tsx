import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Animated, Dimensions } from 'react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';

interface CustomCalendarProps {
    visible: boolean;
    selectedDate: Date;
    onSelectDate: (date: Date) => void;
    onClose: () => void;
    minimumDate?: Date;
}

export const CustomCalendar: React.FC<CustomCalendarProps> = ({
    visible,
    selectedDate,
    onSelectDate,
    onClose,
    minimumDate = new Date(),
}) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
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
        onSelectDate(date);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <Animated.View
                    style={[
                        styles.calendarContainer,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
                                <Text style={styles.navButtonText}>‹</Text>
                            </TouchableOpacity>

                            <Text style={styles.monthYear}>
                                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                            </Text>

                            <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
                                <Text style={styles.navButtonText}>›</Text>
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

                        {/* Footer */}
                        <View style={styles.footer}>
                            <TouchableOpacity onPress={onClose} style={styles.footerButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => {
                                    onSelectDate(new Date());
                                    onClose();
                                }}
                                style={styles.footerButton}
                            >
                                <Text style={styles.todayText}>Today</Text>
                            </TouchableOpacity>
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarContainer: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 20,
        width: Math.min(Dimensions.get('window').width * 0.9, 400),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    navButton: {
        padding: 8,
        borderRadius: 8,
    },
    navButtonText: {
        fontSize: 28,
        color: '#8b5cf6',
        fontWeight: '600',
    },
    monthYear: {
        fontSize: 18,
        fontWeight: '700',
        color: '#374151',
    },
    weekDaysRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    weekDay: {
        flex: 1,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '600',
        color: '#6b7280',
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
        borderRadius: 12,
        marginVertical: 2,
    },
    selectedDay: {
        backgroundColor: '#8b5cf6',
    },
    todayDay: {
        borderWidth: 2,
        borderColor: '#8b5cf6',
    },
    dayText: {
        fontSize: 15,
        color: '#374151',
        fontWeight: '500',
    },
    disabledDayText: {
        color: '#d1d5db',
    },
    selectedDayText: {
        color: '#ffffff',
        fontWeight: '700',
    },
    todayDayText: {
        color: '#8b5cf6',
        fontWeight: '700',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    footerButton: {
        padding: 8,
    },
    cancelText: {
        color: '#6b7280',
        fontSize: 15,
        fontWeight: '600',
    },
    todayText: {
        color: '#8b5cf6',
        fontSize: 15,
        fontWeight: '600',
    },
});
