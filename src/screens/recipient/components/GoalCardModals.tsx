import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../../../config/colors';
import { Experience } from '../../../types';

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
}

export const CelebrationModal: React.FC<CelebrationModalProps> = ({ visible, onClose }) => {
  const celebrationScale = useRef(new Animated.Value(0)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const particlesAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      celebrationScale.setValue(0);
      celebrationOpacity.setValue(0);
      particlesAnim.setValue(0);

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

      setTimeout(() => {
        Animated.timing(particlesAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, 150);
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
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.celebrationOverlay}>
        <Animated.View
          style={[
            styles.celebrationContainer,
            {
              opacity: celebrationOpacity,
              transform: [{ scale: celebrationScale }],
            },
          ]}
        >
          {/* Particle Effects */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * 2 * Math.PI;
            const distance = 80;
            return (
              <Animated.View
                key={i}
                style={[
                  styles.particle,
                  {
                    backgroundColor: [Colors.primary, '#10b981', '#f59e0b', '#ef4444', Colors.accent][i % 5],
                    transform: [
                      {
                        translateX: particlesAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.cos(angle) * distance],
                        }),
                      },
                      {
                        translateY: particlesAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.sin(angle) * distance],
                        }),
                      },
                      {
                        scale: particlesAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                      },
                    ],
                    opacity: particlesAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0, 1, 0],
                    }),
                  },
                ]}
              />
            );
          })}

          <View style={styles.celebrationIconContainer}>
            <Text style={styles.celebrationIcon}>🎉</Text>
          </View>
          <Text style={styles.celebrationTitle}>Amazing!</Text>
          <Text style={styles.celebrationMessage}>Session complete!</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ─── ValentineExperienceDetailsModal ────────────────────────────────

interface ValentineExperienceDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  experience: Experience | null;
}

export const ValentineExperienceDetailsModal: React.FC<ValentineExperienceDetailsModalProps> = ({
  visible,
  onClose,
  experience,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.valentineModalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Hero image with gradient overlay */}
            <View style={styles.heroImageWrap}>
              {experience && (
                <Image
                  source={{ uri: experience.coverImageUrl }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                start={{ x: 0, y: 0.35 }}
                end={{ x: 0, y: 1 }}
                style={styles.heroGradient}
              >
                {experience?.category && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{experience.category}</Text>
                  </View>
                )}
              </LinearGradient>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={onClose}
              >
                <X color="#fff" size={20} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {experience && (
              <View style={styles.modalBody}>
                {/* Title & subtitle */}
                <Text style={styles.valentineModalTitle}>{experience.title}</Text>
                {experience.subtitle && (
                  <Text style={styles.valentineModalSubtitle}>{experience.subtitle}</Text>
                )}

                {experience.price != null && (
                  <Text style={styles.priceText}>€{experience.price}</Text>
                )}

                {/* Info pills */}
                <View style={styles.modalInfoPills}>
                  {experience.location && (
                    <View style={styles.infoPill}>
                      <Text style={styles.infoPillIcon}>📍</Text>
                      <Text style={styles.infoPillText}>{experience.location}</Text>
                    </View>
                  )}
                  {experience.duration && (
                    <View style={styles.infoPill}>
                      <Text style={styles.infoPillIcon}>⏱️</Text>
                      <Text style={styles.infoPillText}>{experience.duration}</Text>
                    </View>
                  )}
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Description */}
                <Text style={styles.modalSectionTitle}>About This Experience</Text>
                <Text style={styles.modalDescription}>{experience.description}</Text>
              </View>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
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
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#EF4444',
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
  },
  celebrationContainer: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  particle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  celebrationIconContainer: {
    marginBottom: 16,
  },
  celebrationIcon: {
    fontSize: 64,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  celebrationMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  // Valentine experience details
  valentineModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 12,
  },
  heroImageWrap: {
    width: '100%',
    height: 260,
    position: 'relative',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalBody: {
    padding: 22,
    paddingTop: 20,
  },
  valentineModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  valentineModalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 4,
  },
  priceText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 10,
  },
  modalInfoPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primaryBorder + '40',
  },
  infoPillIcon: {
    fontSize: 14,
  },
  infoPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 18,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 24,
  },
});
