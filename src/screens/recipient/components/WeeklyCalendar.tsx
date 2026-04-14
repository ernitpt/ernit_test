import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, useColors } from '../../../config';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';
import { day2, dayMonth, isoDay } from '../goalCardUtils';

// ─── AnimatedFilledDay ──────────────────────────────────────────────

const AnimatedFilledDay: React.FC<{ label: string }> = React.memo(({ label }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fillAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fillAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
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
          colors={[colors.primary, colors.accent]}
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
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.calendarRow}>
      {weekDates.map((d) => {
        const label = day2(d);
        const dateLabel = dayMonth(d);
        const iso = isoDay(d);
        const filled = loggedSet.has(iso);
        const isToday = iso === todayIso;

        return (
          <View
            key={iso}
            style={styles.dayCell}
            accessibilityLabel={`${dateLabel}${isToday ? `, ${t('recipient.weeklyCalendar.today')}` : ''}${filled ? `, ${t('recipient.weeklyCalendar.sessionLogged')}` : ''}`}
            accessibilityRole="text"
          >
            {filled ? (
              <>
                {isToday ? (
                  <AnimatedFilledDay label={label} />
                ) : (
                  <LinearGradient
                    colors={[colors.primary, colors.accent]}
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

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  calendarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  dayCell: { alignItems: 'center', width: CIRCLE },
  emptyCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    borderColor: colors.border,
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
  dayTextEmpty: { ...Typography.captionBold, color: colors.textSecondary },
  dayTextFilled: { ...Typography.captionBold, fontWeight: '700', color: colors.white },
  dateLabel: {
    ...Typography.caption,
    color: colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  todayDateLabel: {
    ...Typography.captionBold,
    color: colors.secondary,
  },
  todayCircleBorder: {
    borderColor: colors.secondary,
    borderWidth: 3,
  },
  todayText: {
    ...Typography.captionBold,
    fontWeight: '700',
    color: colors.secondary,
  },
});

export default WeeklyCalendar;
