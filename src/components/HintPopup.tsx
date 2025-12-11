// components/HintPopup.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Animated, Pressable, StyleSheet, TouchableOpacity, Image } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import AudioPlayer from './AudioPlayer';


interface Props {
  visible: boolean;
  hint: any; // string or PersonalizedHint object
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

  // Determine content
  const isObj = typeof hint === 'object' && hint !== null;
  const text = isObj ? (hint.text || hint.hint) : hint;
  const audioUrl = isObj ? hint.audioUrl : null;
  const imageUrl = isObj ? hint.imageUrl : null;
  const duration = isObj ? hint.duration : 0;
  const giverName = isObj ? hint.giverName : null;

  return (
    <>
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

              <Text style={styles.h1}>Your Hint!</Text>

              {giverName && (
                <Text style={styles.subHeader}>
                  {giverName} left you a hint
                </Text>
              )}

              <View style={styles.hintContainer}>
                {text ? <Text style={styles.hint}>{text}</Text> : null}

                {imageUrl && (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.hintImage}
                    resizeMode="cover"
                  />
                )}

                {audioUrl && (
                  <View style={styles.audioContainer}>
                    <AudioPlayer uri={audioUrl} duration={duration} variant="popup" />
                  </View>
                )}

                {giverName && (
                  <View style={styles.signatureContainer}>
                    <Text style={styles.signatureText}>– {giverName}</Text>
                  </View>
                )}
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
    </>
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
    backgroundColor: '#F3E8FF',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  subHeader: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 18,
    textAlign: 'center',
  },
  hintContainer: {
    width: '100%',
    maxHeight: 400,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 4,

  },
  hintImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#f3f4f6',
  },
  audioContainer: {
    width: '100%',
    alignItems: 'center',
  },
  signatureContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    width: '100%',
    alignItems: 'flex-end',
  },
  signatureText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    fontStyle: 'italic',
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
