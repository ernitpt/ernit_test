import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Notification } from '../types';
import { goalService } from '../services/GoalService';
import { notificationService } from '../services/NotificationService';
import { userService } from '../services/userService';
import GoalChangeSuggestionModal from './GoalChangeSuggestionModal';

interface GoalChangeSuggestionNotificationProps {
  notification: Notification;
  onActionTaken: () => void;
}

const GoalChangeSuggestionNotification: React.FC<GoalChangeSuggestionNotificationProps> = ({
  notification,
  onActionTaken,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState<any>(null);

  const suggestedWeeks = notification.data?.suggestedTargetCount || 0;
  const suggestedSessions = notification.data?.suggestedSessionsPerWeek || 0;

  const handleAcceptSuggestion = async () => {
    if (!notification.data?.goalId || !notification.id) return;
    setError(null);
    setLoading(true);
    
    try {
      // Fetch goal to get current values if not already loaded
      let currentGoal = goal;
      if (!currentGoal) {
        currentGoal = await goalService.getGoalById(notification.data.goalId);
        if (currentGoal) {
          setGoal(currentGoal);
        }
      }
      
      if (!currentGoal || !currentGoal.id) {
        setError('Could not load goal. Please try again.');
        setLoading(false);
        return;
      }

      // Accept the suggestion as-is
      const updated = await goalService.respondToGoalSuggestion(
        notification.data.goalId,
        suggestedWeeks,
        suggestedSessions,
        undefined
      );

      // Notify giver
      const giverName = await userService.getUserName(notification.data.senderId || '');
      await notificationService.createNotification(
        notification.data.senderId || '',
        'goal_approval_response',
        '✅ Receiver accepted your goal suggestion',
        `Receiver accepted your suggestion: ${suggestedWeeks} weeks, ${suggestedSessions} sessions per week`,
        {
          goalId: notification.data.goalId,
          recipientId: notification.data.recipientId || '',
        }
      );

      // Delete the notification (force delete after action is taken)
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError) {
        console.warn('Could not delete notification:', deleteError);
        // Try direct delete as fallback
        try {
          const { doc, deleteDoc: deleteDocFn } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const ref = doc(db, 'notifications', notification.id);
          await deleteDocFn(ref);
        } catch (e) {
          console.warn('Direct delete failed:', e);
        }
      }

      onActionTaken();
    } catch (error: any) {
      console.error('Error accepting suggestion:', error);
      setError(error?.message || 'Failed to accept suggestion. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async () => {
    if (!notification.data?.goalId) return;
    setError(null);
    
    try {
      // Fetch goal if not already loaded
      if (!goal) {
        const fetchedGoal = await goalService.getGoalById(notification.data.goalId);
        if (fetchedGoal) {
          setGoal(fetchedGoal);
          setShowModal(true);
        } else {
          setError('Could not load goal. Please try again.');
        }
      } else {
        setShowModal(true);
      }
    } catch (error: any) {
      console.error('Error loading goal:', error);
      setError('Could not load goal. Please try again.');
    }
  };

  const handleGoalUpdated = async (updatedGoal: any) => {
    // Delete the notification after goal is updated (force delete after action is taken)
    if (notification.id) {
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError) {
        console.warn('Could not delete notification:', deleteError);
        // Try direct delete as fallback
        try {
          const { doc, deleteDoc: deleteDocFn } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const ref = doc(db, 'notifications', notification.id);
          await deleteDocFn(ref);
        } catch (e) {
          console.warn('Direct delete failed:', e);
        }
      }
    }
    
    setShowModal(false);
    onActionTaken();
  };

  // Load goal on mount if not already loaded
  useEffect(() => {
    if (!goal && notification.data?.goalId) {
      goalService.getGoalById(notification.data.goalId)
        .then((fetchedGoal) => {
          if (fetchedGoal) {
            setGoal(fetchedGoal);
          }
        })
        .catch((error) => {
          console.error('Error loading goal:', error);
          // Don't set error here, just log it - user might not need it until they click
        });
    }
  }, [notification.data?.goalId]);

  return (
    <>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{notification.title}</Text>
          <Text style={styles.message}>{notification.message}</Text>
          {notification.data?.giverMessage && (
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Message from giver:</Text>
              <Text style={styles.messageText}>{notification.data.giverMessage}</Text>
            </View>
          )}
          <Text style={styles.details}>
            Suggested: {suggestedWeeks} weeks, {suggestedSessions} sessions per week
          </Text>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={handleAcceptSuggestion}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Accept</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.changeButton]}
            onPress={handleOpenModal}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Change</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Goal Change Suggestion Modal */}
      {goal && (
        <GoalChangeSuggestionModal
          visible={showModal}
          goal={goal}
          onClose={() => setShowModal(false)}
          onGoalUpdated={handleGoalUpdated}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  content: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  messageBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#78350f',
  },
  details: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '500',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  changeButton: {
    backgroundColor: '#f59e0b',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default GoalChangeSuggestionNotification;

