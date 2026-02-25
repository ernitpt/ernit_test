import { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, Easing } from 'react-native';
import { Goal } from '../../../types';
import { userService } from '../../../services/userService';
import { db } from '../../../services/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { logger } from '../../../utils/logger';
import { PartnerGoalData } from '../goalCardUtils';

export function useValentinePartner(goal: Goal) {
  const [valentinePartnerName, setValentinePartnerName] = useState<string | null>(null);
  const [partnerProfileImage, setPartnerProfileImage] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserProfileImage, setCurrentUserProfileImage] = useState<string | null>(null);
  const [partnerGoalData, setPartnerGoalData] = useState<PartnerGoalData | null>(null);
  const [partnerJustUpdated, setPartnerJustUpdated] = useState(false);

  // View switcher
  const [selectedView, setSelectedView] = useState<'user' | 'partner'>('user');
  const viewTransitionAnim = useRef(new Animated.Value(1)).current;
  const partnerPulseAnim = useRef(new Animated.Value(1)).current;

  // Track previous partner count for pulse detection
  const prevPartnerCountRef = useRef<number>(0);

  const isValentine = !!goal.valentineChallengeId;

  // Fetch current user info
  useEffect(() => {
    if (!goal.userId) return;
    userService.getUserName(goal.userId)
      .then(setCurrentUserName)
      .catch(() => {});
    userService.getUserById(goal.userId)
      .then(user => {
        if (user?.profile?.profileImageUrl && user.profile.profileImageUrl.trim() !== '') {
          setCurrentUserProfileImage(user.profile.profileImageUrl);
        }
      })
      .catch(() => {});
  }, [goal.userId]);

  // Fetch Valentine partner name and profile image
  useEffect(() => {
    if (!isValentine || !goal.partnerGoalId) return;

    const fetchPartnerInfo = async () => {
      try {
        const partnerGoalDoc = await getDoc(doc(db, 'goals', goal.partnerGoalId!));
        if (partnerGoalDoc.exists()) {
          const partnerUserId = partnerGoalDoc.data().userId;
          const partnerName = await userService.getUserName(partnerUserId);
          setValentinePartnerName(partnerName);

          try {
            const partnerUser = await userService.getUserById(partnerUserId);
            if (partnerUser?.profile?.profileImageUrl && partnerUser.profile.profileImageUrl.trim() !== '') {
              setPartnerProfileImage(partnerUser.profile.profileImageUrl);
            }
          } catch (imgError) {
            logger.warn('Could not fetch partner profile image:', imgError);
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch Valentine partner info:', error);
      }
    };
    fetchPartnerInfo();
  }, [isValentine, goal.partnerGoalId]);

  // Real-time listener for partner's goal progress (debounced)
  useEffect(() => {
    if (!isValentine || !goal.partnerGoalId) {
      setPartnerGoalData(null);
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onSnapshot(
      doc(db, 'goals', goal.partnerGoalId),
      (snapshot) => {
        if (!snapshot.exists()) return;

        // Debounce rapid updates by 300ms
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const data = snapshot.data();
          const newCount = data.weeklyCount || 0;
          const previousCount = prevPartnerCountRef.current;

          // Trigger pulse animation if partner just completed a session
          if (newCount > previousCount && previousCount > 0) {
            setPartnerJustUpdated(true);
            Animated.sequence([
              Animated.timing(partnerPulseAnim, {
                toValue: 1.15,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(partnerPulseAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]).start(() => setPartnerJustUpdated(false));
          }

          prevPartnerCountRef.current = newCount;

          setPartnerGoalData({
            weeklyCount: newCount,
            sessionsPerWeek: data.sessionsPerWeek || 1,
            weeklyLogDates: data.weeklyLogDates || [],
            isWeekCompleted: data.isWeekCompleted || false,
            isCompleted: data.isCompleted || false,
            weekStartAt: data.weekStartAt,
            targetCount: data.targetCount || 1,
            currentCount: data.currentCount || 0,
            title: data.title || undefined,
          });
        }, 300);
      },
      (error) => {
        logger.error('Error listening to partner goal:', error);
      }
    );

    return () => {
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isValentine, goal.partnerGoalId]);

  // Handle view switching
  const handleViewSwitch = useCallback((view: 'user' | 'partner') => {
    if (view === selectedView || !partnerGoalData) return;
    Animated.sequence([
      Animated.timing(viewTransitionAnim, {
        toValue: 0.92,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(viewTransitionAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    setSelectedView(view);
  }, [selectedView, partnerGoalData, viewTransitionAnim]);

  // Displayed name/title/color based on view
  const displayedName = selectedView === 'user'
    ? (currentUserName || 'You')
    : (valentinePartnerName || 'Partner');

  const displayedTitle = selectedView === 'user'
    ? goal.title
    : (partnerGoalData?.title || goal.title);

  const displayedColor = selectedView === 'user' ? '#FF6B9D' : '#C084FC';

  // Motivational nudge based on % completion
  const motivationalNudge = (() => {
    if (!partnerGoalData || !isValentine) return null;
    const userPct = goal.weeklyCount / goal.sessionsPerWeek;
    const partnerPct = partnerGoalData.weeklyCount / partnerGoalData.sessionsPerWeek;
    if (userPct === 0 && partnerPct === 0) return null;
    if (partnerPct - userPct > 0.2) {
      return `${valentinePartnerName || 'Your partner'} is making great progress — keep going!`;
    }
    if (userPct - partnerPct > 0.2) {
      return "You're ahead — great work!";
    }
    if (userPct > 0 && partnerPct > 0) {
      return "You're both in sync! Keep it up!";
    }
    return null;
  })();

  return {
    valentinePartnerName,
    partnerProfileImage,
    currentUserName,
    currentUserProfileImage,
    partnerGoalData,
    partnerJustUpdated,
    selectedView,
    setSelectedView,
    viewTransitionAnim,
    partnerPulseAnim,
    handleViewSwitch,
    displayedName,
    displayedTitle,
    displayedColor,
    motivationalNudge,
    isValentine,
  };
}
