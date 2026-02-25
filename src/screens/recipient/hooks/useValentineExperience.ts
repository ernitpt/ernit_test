import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { Goal, Experience } from '../../../types';
import { experienceService } from '../../../services/ExperienceService';
import { db } from '../../../services/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { logger } from '../../../utils/logger';
import { buildValentineGift } from '../goalCardUtils';
import { serializeNav } from '../../../utils/serializeNav';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../types';

interface UseValentineExperienceOptions {
  goal: Goal;
  setCurrentGoal: React.Dispatch<React.SetStateAction<Goal>>;
  valentinePartnerName: string | null;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Goals'>;
}

export function useValentineExperience({
  goal,
  setCurrentGoal,
  valentinePartnerName,
  navigation,
}: UseValentineExperienceOptions) {
  const [valentineExperience, setValentineExperience] = useState<Experience | null>(null);
  const [valentineChallengeMode, setValentineChallengeMode] = useState<'revealed' | 'secret' | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const isValentine = !!goal.valentineChallengeId;

  // Fetch challenge and experience data
  useEffect(() => {
    if (!isValentine) {
      setValentineExperience(null);
      setValentineChallengeMode(null);
      return;
    }

    const fetchValentineExperience = async () => {
      try {
        const challengeDoc = await getDoc(doc(db, 'valentineChallenges', goal.valentineChallengeId!));
        if (challengeDoc.exists()) {
          const challengeData = challengeDoc.data();
          setValentineChallengeMode(challengeData.mode);

          if (challengeData.experienceId) {
            const experience = await experienceService.getExperienceById(challengeData.experienceId);
            setValentineExperience(experience);
          } else {
            setValentineExperience(null);
          }
        }
      } catch (error) {
        logger.error('Error fetching Valentine challenge/experience:', error);
      }
    };

    fetchValentineExperience();
  }, [isValentine, goal.valentineChallengeId]);

  // Listen for goal unlock when waiting for partner
  useEffect(() => {
    if (!goal.id || !goal.isFinished || goal.isUnlocked || !isValentine) return;

    const unsubscribe = onSnapshot(
      doc(db, 'goals', goal.id),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();

        if (data.isUnlocked && !goal.isUnlocked) {
          logger.log('Partner finished! Goal unlocked.');

          setCurrentGoal((prev) => ({
            ...prev,
            isUnlocked: true,
            unlockedAt: data.unlockedAt?.toDate(),
          }));

          Alert.alert(
            'Partner Finished!',
            `${valentinePartnerName || 'Your partner'} has completed their goal! You can both now redeem your experience together.`,
            [
              {
                text: 'View Completion',
                onPress: async () => {
                  try {
                    const gift = await buildValentineGift(goal);
                    if (!gift) {
                      logger.error('Valentine challenge not found for completion navigation');
                      return;
                    }
                    navigation.navigate('Completion', {
                      goal: serializeNav({ ...goal, isUnlocked: true }),
                      experienceGift: serializeNav(gift),
                    });
                  } catch (error) {
                    logger.error('Error navigating to completion:', error);
                  }
                }
              }
            ]
          );
        }
      },
      (error) => {
        logger.error('Error listening to goal unlock:', error);
      }
    );

    return () => unsubscribe();
  }, [goal.id, goal.isFinished, goal.isUnlocked, isValentine, valentinePartnerName]);

  return {
    valentineExperience,
    valentineChallengeMode,
    showDetailsModal,
    setShowDetailsModal,
  };
}
