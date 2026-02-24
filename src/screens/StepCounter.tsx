import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { LinearGradient } from 'expo-linear-gradient';

import { logger } from '../utils/logger';
import Colors from '../config/colors';
type StepCounterProps = {
  userId: string;
  dailyGoal?: number;
};

const StepCounter: React.FC<StepCounterProps> = ({ userId, dailyGoal = 10000 }) => {
  const [steps, setSteps] = useState(0);
  const [subscription, setSubscription] = useState<any>(null);

  const todayKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const stepsDocRef = doc(db, 'users', userId, 'steps', todayKey);

  useEffect(() => {
    const loadSteps = async () => {
      try {
        const docSnap = await getDoc(stepsDocRef);
        if (docSnap.exists()) setSteps(docSnap.data()?.count || 0);
      } catch (err) {
        logger.error('Error loading steps:', err);
      }
    };
    loadSteps();

    const sub = Pedometer.watchStepCount(async (result) => {
      setSteps(result.steps);
      try {
        await setDoc(stepsDocRef, { count: result.steps }, { merge: true });
      } catch (err) {
        logger.error('Error saving steps:', err);
      }
    });
    setSubscription(sub);

    return () => subscription?.remove();
  }, []);

  const progress = Math.min(steps / dailyGoal, 1);

  return (
    <LinearGradient colors={Colors.gradientDark} style={styles.container}>
      <Text style={styles.title}>Today's Steps</Text>
      <Text style={styles.steps}>{steps}</Text>
      <View style={styles.progressBackground}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.goalText}>
        {steps >= dailyGoal ? '🎉 Goal Achieved!' : `Goal: ${dailyGoal} steps`}
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { marginHorizontal: 24, marginVertical: 16, borderRadius: 16, padding: 16 },
  title: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 4 },
  steps: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  progressBackground: {
    height: 12,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', backgroundColor: '#facc15', borderRadius: 6 },
  goalText: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 4 },
});

export default StepCounter;
