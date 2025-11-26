// components/HintPopup.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Animated, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';

interface Props {
  visible: boolean;
  hint: string;
  sessionNumber: number;
  totalSessions: number;
  onClose: () => void;
}

const HintPopup: React.FC<Props> = ({ visible, hint, sessionNumber, totalSessions, onClose }) => {
  const slideAnim = useModalAnimation(visible);
  const confettiRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => confettiRef.current?.start(), 150);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={[commonStyles.modalOverlay, { padding: 24 }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable style={{ width: '100%', alignItems: 'center' }} onPress={(e) => e.stopPropagation()}>

            <View style={styles.iconContainer}>
              <Text style={{ fontSize: 32 }}>✨</Text>
            </View>

            <Text style={styles.h1}>Your Hint!
            </Text>

            <View style={styles.hintContainer}>
              <Text style={styles.hint}>{hint}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
              ]}
              onPress={onClose}
            >
              <Text style={styles.btnText}>Awesome!</Text>
            </Pressable>

            <ConfettiCannon
              ref={confettiRef}
              autoStart={false}
              count={80}
              explosionSpeed={420}
              fallSpeed={2600}
              origin={{ x: 150, y: -10 }}
              fadeOut
            />
          </Pressable>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF', // Light purple bg
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#FAF5FF',
  },
  h1: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 18,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    fontWeight: '500',
  },
  hintContainer: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hint: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  btn: {
    width: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.5,
  },
});

export default HintPopup;
