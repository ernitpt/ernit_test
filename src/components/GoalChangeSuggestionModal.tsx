import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Goal } from '../types';
import { goalService } from '../services/GoalService';
import { notificationService } from '../services/NotificationService';
import { userService } from '../services/userService';

interface GoalChangeSuggestionModalProps {
  visible: boolean;
  goal: Goal;
  onClose: () => void;
  onGoalUpdated: (goal: Goal) => void;
}

const GoalChangeSuggestionModal: React.FC<GoalChangeSuggestionModalProps> = ({
  visible,
  goal,
  onClose,
  onGoalUpdated,
}) => {
  const initialWeeks = goal?.initialTargetCount || goal?.targetCount || 0;
  const initialSessions = goal?.initialSessionsPerWeek || goal?.sessionsPerWeek || 0;
  const suggestedWeeks = goal?.suggestedTargetCount || goal?.targetCount || 0;
  const suggestedSessions = goal?.suggestedSessionsPerWeek || goal?.sessionsPerWeek || 0;

  // Calculate min values (30% above initial, same as before)
  const minWeeks = Math.ceil(initialWeeks + (suggestedWeeks - initialWeeks) * 0.3);
  const minSessions = Math.ceil(initialSessions + (suggestedSessions - initialSessions) * 0.3);

  // Max values: 5 weeks and 7 sessions per week (logical limits)
  const maxWeeks = 5;
  const maxSessions = 7;

  const [selectedWeeks, setSelectedWeeks] = useState(suggestedWeeks || initialWeeks || 0);
  const [selectedSessions, setSelectedSessions] = useState(suggestedSessions || initialSessions || 0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && goal) {
      // Reset to max (giver's suggestion) when modal opens
      const weeks = goal?.suggestedTargetCount || goal?.targetCount || 0;
      const sessions = goal?.suggestedSessionsPerWeek || goal?.sessionsPerWeek || 0;
      setSelectedWeeks(weeks);
      setSelectedSessions(sessions);
      setMessage('');
      setError(null);
    }
  }, [visible, goal]);

  const adjustWeeks = (delta: number) => {
    if (loading) return;
    const newValue = Math.max(minWeeks, Math.min(maxWeeks, selectedWeeks + delta));
    setSelectedWeeks(newValue);
    setError(null);
  };

  const adjustSessions = (delta: number) => {
    if (loading) return;
    const newValue = Math.max(minSessions, Math.min(maxSessions, selectedSessions + delta));
    setSelectedSessions(newValue);
    setError(null);
  };

  const handleWeeksChange = (text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''));
    if (!isNaN(num)) {
      const clamped = Math.max(minWeeks, Math.min(maxWeeks, num));
      setSelectedWeeks(clamped);
    } else if (text === '') {
      setSelectedWeeks(minWeeks);
    }
  };

  const handleSessionsChange = (text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''));
    if (!isNaN(num)) {
      const clamped = Math.max(minSessions, Math.min(maxSessions, num));
      setSelectedSessions(clamped);
    } else if (text === '') {
      setSelectedSessions(minSessions);
    }
  };

  const handleAccept = async () => {
    if (!goal || !goal.id) {
      setError('Goal information is missing. Please try again.');
      return;
    }

    // Validate limits
    if (selectedWeeks > 5) {
      setError('The maximum duration is 5 weeks.');
      return;
    }
    if (selectedSessions > 7) {
      setError('The maximum is 7 sessions per week.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const updated = await goalService.respondToGoalSuggestion(
        goal.id,
        selectedWeeks,
        selectedSessions,
        message.trim() || undefined
      );

      // Notify giver
      const receiverName = await userService.getUserName(goal.userId || '');
      const giverId = goal.empoweredBy || '';
      if (giverId) {
        await notificationService.createNotification(
          giverId,
          'goal_approval_response',
          `${receiverName} accepted your goal suggestion`,
          `Accepted goal: ${selectedWeeks} weeks, ${selectedSessions} sessions per week`,
          {
            goalId: goal.id,
            recipientId: goal.userId,
          }
        );
      }

      onGoalUpdated(updated);
      onClose();
    } catch (error: any) {
      console.error('Error responding to suggestion:', error);
      setError(error?.message || 'Failed to update goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Goal Change Suggestion</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {goal?.giverMessage && (
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Message from {goal.empoweredBy}:</Text>
              <Text style={styles.messageText}>{goal.giverMessage}</Text>
            </View>
          )}

          <View style={styles.goalInfo}>
            <Text style={styles.infoLabel}>Your original goal:</Text>
            <Text style={styles.infoText}>
              {initialWeeks} weeks, {initialSessions} sessions per week
            </Text>
          </View>

          <View style={styles.goalInfo}>
            <Text style={styles.infoLabel}>Giver's suggestion:</Text>
            <Text style={styles.infoText}>
              {suggestedWeeks} weeks, {suggestedSessions} sessions per week
            </Text>
          </View>

          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Choose your goal:</Text>
            <Text style={styles.selectorValue}>
              {selectedWeeks} weeks, {selectedSessions} sessions per week
            </Text>

            <View style={styles.rangeInfo}>
              <Text style={styles.rangeText}>
                Range: {minWeeks}-{maxWeeks} weeks, {minSessions}-{maxSessions} sessions/week
              </Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weeks:</Text>
              <View style={styles.numberInputContainer}>
                <TouchableOpacity
                  style={[
                    styles.adjustButton,
                    (selectedWeeks <= minWeeks || loading) && styles.adjustButtonDisabled
                  ]}
                  onPress={() => adjustWeeks(-1)}
                  disabled={selectedWeeks <= minWeeks || loading}
                  activeOpacity={selectedWeeks <= minWeeks ? 1 : 0.7}
                >
                  <Text style={[
                    styles.adjustButtonText,
                    (selectedWeeks <= minWeeks || loading) && styles.adjustButtonTextDisabled
                  ]}>−</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.numberInput}
                    value={selectedWeeks.toString()}
                    onChangeText={handleWeeksChange}
                    keyboardType="numeric"
                    editable={!loading}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.adjustButton,
                    (selectedWeeks >= maxWeeks || loading) && styles.adjustButtonDisabled
                  ]}
                  onPress={() => adjustWeeks(1)}
                  disabled={selectedWeeks >= maxWeeks || loading}
                  activeOpacity={selectedWeeks >= maxWeeks ? 1 : 0.7}
                >
                  <Text style={[
                    styles.adjustButtonText,
                    (selectedWeeks >= maxWeeks || loading) && styles.adjustButtonTextDisabled
                  ]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sessions per week:</Text>
              <View style={styles.numberInputContainer}>
                <TouchableOpacity
                  style={[
                    styles.adjustButton,
                    (selectedSessions <= minSessions || loading) && styles.adjustButtonDisabled
                  ]}
                  onPress={() => adjustSessions(-1)}
                  disabled={selectedSessions <= minSessions || loading}
                  activeOpacity={selectedSessions <= minSessions ? 1 : 0.7}
                >
                  <Text style={[
                    styles.adjustButtonText,
                    (selectedSessions <= minSessions || loading) && styles.adjustButtonTextDisabled
                  ]}>−</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.numberInput}
                    value={selectedSessions.toString()}
                    onChangeText={handleSessionsChange}
                    keyboardType="numeric"
                    editable={!loading}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.adjustButton,
                    (selectedSessions >= maxSessions || loading) && styles.adjustButtonDisabled
                  ]}
                  onPress={() => adjustSessions(1)}
                  disabled={selectedSessions >= maxSessions || loading}
                  activeOpacity={selectedSessions >= maxSessions ? 1 : 0.7}
                >
                  <Text style={[
                    styles.adjustButtonText,
                    (selectedSessions >= maxSessions || loading) && styles.adjustButtonTextDisabled
                  ]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TextInput
            style={styles.messageInput}
            placeholder="Your message to giver (optional)..."
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              setError(null);
            }}
            multiline
            numberOfLines={3}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.acceptButton]}
              onPress={handleAccept}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  messageBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
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
  goalInfo: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  selectorContainer: {
    marginVertical: 20,
  },
  selectorLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  selectorValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7c3aed',
    textAlign: 'center',
    marginBottom: 12,
  },
  rangeInfo: {
    marginBottom: 16,
  },
  rangeText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  numberInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.5,
  },
  adjustButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  adjustButtonTextDisabled: {
    color: '#9ca3af',
  },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#7c3aed',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    marginRight: 12,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default GoalChangeSuggestionModal;

