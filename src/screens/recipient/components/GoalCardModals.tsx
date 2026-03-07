import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { X, MapPin, Share2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import Colors from '../../../config/colors';
import { Experience, PartnerUser } from '../../../types';
import { partnerService } from '../../../services/PartnerService';

// ─── CancelSessionModal ─────────────────────────────────────────────

interface CancelSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
}

export const CancelSessionModal: React.FC<CancelSessionModalProps> = ({
  visible,
  onClose,
  onConfirm,
  message,
}) => {
  const cancelScale = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(cancelScale, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [visible, cancelScale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.modalBox,
            { transform: [{ translateY: cancelScale }] },
          ]}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Cancel Session?</Text>
            <Text style={styles.modalSubtitle}>{message}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.modalButton, styles.cancelButtonPopup]}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onConfirm}
                style={[styles.modalButton, styles.confirmButton]}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmText}>Yes, cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── CelebrationModal ───────────────────────────────────────────────

interface CelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  onPostToFeed?: () => void;
  // Feed post preview data
  goalTitle?: string;
  sessionNumber?: number;
  totalSessions?: number;
  progressPct?: number;
  mediaUri?: string | null;
  userName?: string;
  userProfileImageUrl?: string;
  weeklyCount?: number;
  sessionsPerWeek?: number;
  weeksCompleted?: number;
  totalWeeks?: number;
}

export const CelebrationModal: React.FC<CelebrationModalProps> = ({
  visible,
  onClose,
  onPostToFeed,
  goalTitle,
  sessionNumber,
  totalSessions,
  progressPct,
  mediaUri,
  userName,
  userProfileImageUrl,
  weeklyCount,
  sessionsPerWeek,
  weeksCompleted,
  totalWeeks,
}) => {
  const celebrationScale = useRef(new Animated.Value(0)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiCannon | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState(false);

  useEffect(() => {
    if (visible) {
      celebrationScale.setValue(0);
      celebrationOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(celebrationScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(celebrationOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Fire confetti after a brief delay
      setTimeout(() => {
        confettiRef.current?.start();
      }, 200);
    } else {
      Animated.parallel([
        Animated.timing(celebrationScale, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(celebrationOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);


  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        <View style={styles.celebrationOverlay}>
          {/* Confetti Cannon */}
          <ConfettiCannon
            ref={confettiRef}
            autoStart={false}
            count={80}
            origin={{ x: -10, y: 0 }}
            explosionSpeed={350}
            fallSpeed={2500}
            fadeOut
            colors={[Colors.primary, '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']}
          />
          <Animated.View
            style={[
              styles.celebrationContainer,
              {
                opacity: celebrationOpacity,
                transform: [{ scale: celebrationScale }],
              },
            ]}
          >
            {/* Header */}
            <Text style={styles.celebrationHeader}>Session Complete</Text>

            {/* Feed post preview card */}
            <View style={styles.feedPreviewCard}>
              {/* Media at top if present */}
              {mediaUri && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setFullscreenMedia(true)}
                  style={styles.feedMediaWrapper}
                >
                  <Image
                    source={{ uri: mediaUri }}
                    style={styles.feedMediaAdaptive}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}

              {/* Author row */}
              <View style={styles.feedAuthorRow}>
                {userProfileImageUrl ? (
                  <Image source={{ uri: userProfileImageUrl }} style={styles.feedAvatar} />
                ) : (
                  <View style={[styles.feedAvatar, styles.feedAvatarPlaceholder]}>
                    <Text style={styles.feedAvatarText}>
                      {(userName?.[0] || 'U').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.feedAuthorName} numberOfLines={1}>
                    <Text style={{ fontWeight: '500' }}>{userName || 'You'}</Text> completed session
                  </Text>
                  <Text style={styles.feedTimestamp}>Just now</Text>
                </View>
              </View>

              {/* Capsule progress: sessions this week */}
              {sessionsPerWeek && sessionsPerWeek > 0 && (
                <View style={styles.feedProgressBlock}>
                  <View style={styles.feedProgressHeader}>
                    <Text style={styles.feedProgressBlockLabel}>Sessions this week</Text>
                    <Text style={styles.feedProgressBlockCount}>{weeklyCount || 0}/{sessionsPerWeek}</Text>
                  </View>
                  <View style={styles.feedCapsuleRow}>
                    {Array.from({ length: sessionsPerWeek }, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.feedCapsule,
                          i < (weeklyCount || 0)
                            ? { backgroundColor: Colors.primary }
                            : { backgroundColor: '#E5E7EB' },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Capsule progress: weeks completed */}
              {totalWeeks && totalWeeks > 0 && (
                <View style={styles.feedProgressBlock}>
                  <View style={styles.feedProgressHeader}>
                    <Text style={styles.feedProgressBlockLabel}>Weeks completed</Text>
                    <Text style={styles.feedProgressBlockCount}>{weeksCompleted || 0}/{totalWeeks}</Text>
                  </View>
                  <View style={styles.feedCapsuleRow}>
                    {Array.from({ length: Math.min(totalWeeks, 20) }, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.feedCapsule,
                          i < (weeksCompleted || 0)
                            ? { backgroundColor: Colors.secondary }
                            : { backgroundColor: '#E5E7EB' },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Buttons */}
            <View style={styles.celebrationButtons}>
              {onPostToFeed && (
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={() => { onPostToFeed(); onClose(); }}
                  activeOpacity={0.8}
                >
                  <Share2 size={16} color="#fff" />
                  <Text style={styles.shareButtonText}>Share to Feed</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.celebrationCloseBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.celebrationCloseBtnText}>
                  {onPostToFeed ? 'Skip' : 'Close'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Fullscreen media viewer */}
      {
        mediaUri && (
          <Modal
            visible={fullscreenMedia}
            transparent
            animationType="fade"
            onRequestClose={() => setFullscreenMedia(false)}
          >
            <View style={styles.fullscreenOverlay}>
              <TouchableOpacity
                style={styles.fullscreenClose}
                onPress={() => setFullscreenMedia(false)}
              >
                <X color="#fff" size={24} strokeWidth={2.5} />
              </TouchableOpacity>
              <Image
                source={{ uri: mediaUri }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            </View>
          </Modal>
        )
      }

    </>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Cancel modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonPopup: {
    backgroundColor: Colors.backgroundLight,
  },
  confirmButton: {
    backgroundColor: Colors.error,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Celebration
  celebrationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  celebrationContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  celebrationHeader: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  // Feed post preview
  feedPreviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  feedMediaWrapper: {
    backgroundColor: '#e5e7eb',
  },
  feedMediaAdaptive: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: Colors.border,
  },
  feedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  feedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
  },
  feedAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
  },
  feedAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  feedAuthorName: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  feedTimestamp: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  feedProgressBlock: {
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  feedProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  feedProgressBlockLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  feedProgressBlockCount: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  feedCapsuleRow: {
    flexDirection: 'row',
    gap: 5,
  },
  feedCapsule: {
    flex: 1,
    height: 7,
    borderRadius: 50,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  celebrationButtons: {
    gap: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  celebrationCloseBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  celebrationCloseBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});

