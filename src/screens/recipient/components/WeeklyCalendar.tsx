import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../../../config/colors';
import { day2, dayMonth, isoDay } from '../goalCardUtils';

// ─── AnimatedFilledDay ──────────────────────────────────────────────

const AnimatedFilledDay: React.FC<{ label: string }> = React.memo(({ label }) => {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fillAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.12,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [fillAnim, scaleAnim]);

  return (
    <Animated.View style={[styles.filledCircle, { transform: [{ scale: scaleAnim }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fillAnim }]}>
        <LinearGradient
          colors={[Colors.primary, Colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.filledCircle}
        />
      </Animated.View>
      <Text style={styles.dayTextFilled}>{label}</Text>
    </Animated.View>
  );
});

AnimatedFilledDay.displayName = 'AnimatedFilledDay';

// ─── WeeklyCalendar ─────────────────────────────────────────────────

interface WeeklyCalendarProps {
  weekDates: Date[];
  loggedSet: Set<string>;
  todayIso: string;
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = React.memo(({
  weekDates,
  loggedSet,
  todayIso,
}) => {
  return (
    <View style={styles.calendarRow}>
      {weekDates.map((d) => {
        const label = day2(d);
        const dateLabel = dayMonth(d);
        const iso = isoDay(d);
        const filled = loggedSet.has(iso);
        const isToday = iso === todayIso;

        return (
          <View key={iso} style={styles.dayCell}>
            {filled ? (
              <>
                {isToday ? (
                  <AnimatedFilledDay label={label} />
                ) : (
                  <LinearGradient
                    colors={[Colors.primary, Colors.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.filledCircle}
                  >
                    <Text style={styles.dayTextFilled}>{label}</Text>
                  </LinearGradient>
                )}
                <Text style={[styles.dateLabel, isToday && styles.todayDateLabel]}>{dateLabel}</Text>
              </>
            ) : (
              <>
                <View style={[styles.emptyCircle, isToday && styles.todayCircleBorder]}>
                  <Text style={[styles.dayTextEmpty, isToday && styles.todayText]}>{label}</Text>
                </View>
                <Text style={[styles.dateLabel, isToday && styles.todayDateLabel]}>{dateLabel}</Text>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
});

WeeklyCalendar.displayName = 'WeeklyCalendar';

// ─── Styles ─────────────────────────────────────────────────────────

const CIRCLE = 38;

const styles = StyleSheet.create({
  calendarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  dayCell: { alignItems: 'center', width: CIRCLE },
  emptyCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dayTextEmpty: { color: '#6b7280', fontWeight: '600' },
  dayTextFilled: { color: '#fff', fontWeight: '700' },
  dateLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  todayDateLabel: {
    color: Colors.secondary,
    fontWeight: '700',
  },
  todayCircleBorder: {
    borderColor: Colors.secondary,
    borderWidth: 3,
  },
  todayText: {
    color: Colors.secondary,
    fontWeight: '700',
  },
});

export default WeeklyCalendar;
