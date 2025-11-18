import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Alert, 
  FlatList, 
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { Goal, RootStackParamList } from '../types';
import { goalService } from '../services/GoalService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import DetailedGoalCard from './recipient/DetailedGoalCard';
import MainScreen from './MainScreen';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { notificationService } from "../services/NotificationService";
import { userService } from "../services/userService";


type GoalsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Goals'>;

const GoalsScreen: React.FC =  () => {
  const { state, dispatch } = useApp();
  const navigation = useNavigation<GoalsScreenNavigationProp>();
  const userId = state.user?.id || 'current_user';

  const [currentGoals, setCurrentGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const updateGiftStatus = async (experienceGiftId: string) => {
    try {
      // Query the experienceGifts collection for the document where the field 'id' equals your experienceGift.id
      const q = query(
        collection(db, 'experienceGifts'),
        where('id', '==', experienceGiftId)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log('No matching gift found');
        return;
      }

      // There should only be one document matching this id
      const giftDoc = querySnapshot.docs[0];

      // Update status to 'completed'
      await updateDoc(doc(db, 'experienceGifts', giftDoc.id), {
        status: 'completed',
      });

      console.log('Gift status updated successfully');
    } catch (error) {
      console.error('Failed to update gift status:', error);
    }
  }; 


        
  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    const unsubscribe = goalService.listenToUserGoals(userId, async (goals) => {
      // Check for pending goals that need auto-approval
      for (const goal of goals) {
        if (goal.approvalStatus === 'pending' && goal.approvalDeadline && !goal.giverActionTaken) {
          const now = new Date();
          if (now >= goal.approvalDeadline) {
            try {
              await goalService.checkAndAutoApprove(goal.id);
            } catch (error) {
              console.error('Error auto-approving goal:', error);
            }
          }
        }
      }

      const activeGoals = goals.filter(
        (g) => !g.isCompleted && g.currentCount < g.targetCount
      );
      setCurrentGoals(activeGoals);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const fabAnim = useRef(new Animated.Value(50)).current; // starts 50px below
  const fabOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fabAnim, {
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(fabOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);


  const handleFinishGoal = async (goal: Goal) => {
    try {
      setLoading(true);

      // Use weekly model for consistency
      const updated = await goalService.tickWeeklySession(goal.id);

      // If a week just completed and whole goal is done, navigate
      const experienceGift = await experienceGiftService.getExperienceGiftById(updated.experienceGiftId);

      if (updated.isCompleted) {
        navigation.navigate('Completion', {
          goal: updated,
          experienceGift,
        });
      } else {
        Alert.alert(
          'Great Job!',
          `This week's progress: ${updated.weeklyCount}/${updated.sessionsPerWeek}`
        );
      }
    } catch (err) {
      console.error('Error finishing goal:', err);
      Alert.alert('Error', 'Failed to update goal progress.');
    } finally {
      setLoading(false);
    }
  };


  const renderGoal = ({ item }: { item: Goal }) => (
    <View style={styles.cardWrapper}>
      <DetailedGoalCard goal={item} onFinish={() => handleFinishGoal(item)} />
    </View>
  );
  const headerColors = ['#462088ff', '#235c9eff'] as const;

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <LinearGradient colors={headerColors} style={styles.gradientHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Current Goals</Text>
          <Text style={styles.headerSubtitle}>Tap goal to track your progress</Text>
        </View>
      </LinearGradient>
      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={currentGoals}
          renderItem={renderGoal}
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No active goals yet.</Text>
          }
        />
      )}

    {/* ---------- FLOATING REDEEM COUPON BUTTON ---------- */}
    <Animated.View
      style={[
        styles.fabContainer,
        {
          transform: [{ translateY: fabAnim }],
          opacity: fabOpacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('RecipientFlow', { screen: 'CouponEntry' })}
      >
        <Image
          source={require('../assets/icon.png')}
          style={styles.fabIcon}
          resizeMode="contain"
        />
        <Text style={styles.fabText}>Redeem your Ernit</Text>
      </TouchableOpacity>
    </Animated.View>

        </MainScreen>
      );
    };

const styles = StyleSheet.create({
    fabContainer: {
      position: 'absolute',
      bottom: 30,
      right: 24,
    },
    fab: {
      backgroundColor: '#8b5cf6',
      borderRadius: 50,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    fabIcon: {
      width: 28,
      height: 28,
      marginRight: 10,
    },
    fabText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },

  gradientHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingTop: 28,
  },
  header: {
    paddingHorizontal: 24,
    // paddingTop: 34,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#e0e7ff',
  },
  listContainer: {
    padding: 20,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 50,
    fontSize: 16,
  },
});

export default GoalsScreen;
