import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  StyleSheet,
  Animated,
  Platform,
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Copy, CheckCircle, Gift, ArrowRight } from 'lucide-react-native';
import { GiverStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { experienceService } from '../../services/ExperienceService';
import { Experience } from '../../types';

type ConfirmationMultipleNavigationProp = NativeStackNavigationProp<
  GiverStackParamList,
  'ConfirmationMultiple'
>;

interface GiftWithExperience {
  gift: ExperienceGift;
  experience: Experience | null;
}

const ConfirmationMultipleScreen = () => {
  const navigation = useNavigation<ConfirmationMultipleNavigationProp>();
  const route = useRoute();
  const { experienceGifts } = route.params as { experienceGifts: ExperienceGift[] };
  const { dispatch } = useApp();

  // Success animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [giftsWithExperiences, setGiftsWithExperiences] = useState<GiftWithExperience[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const fetchExperiences = async () => {
      try {
        const promises = experienceGifts.map(async (gift) => {
          const experience = await experienceService.getExperienceById(gift.experienceId);
          return { gift, experience };
        });
        const results = await Promise.all(promises);
        setGiftsWithExperiences(results);
      } catch (error) {
        console.error("Error fetching experiences:", error);
        Alert.alert("Error", "Could not load experience details.");
      } finally {
        setLoading(false);
      }
    };
    fetchExperiences();
  }, [experienceGifts]);

  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('✓ Copied!', 'Claim code copied to clipboard.');
  };

  const handleShareCode = async (code: string, experienceTitle?: string) => {
    try {
      const shareOptions = {
        title: 'Gift Code',
        message: `
        Hey! Got you an Ernit experience${experienceTitle ? `: ${experienceTitle}` : ''}. A little boost for your goals.

        Sign up and use code ${code} at https://ernit.app to set up your goals. Once you complete your goals, you'll see what I got you 😎

        Earn it. Unlock it. Enjoy it 💙
        `
      };

      const result = await Share.share(shareOptions);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share the code');
    }
  };

  const handleBackToHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'CategorySelection' }],
    });
  };

  if (loading) {
    return (
      <MainScreen activeRoute="Home">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading gifts...</Text>
        </View>
      </MainScreen>
    );
  }

  return (
    <MainScreen activeRoute="Home">
      <StatusBar style="dark" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Success Header with Animation */}
        <View style={styles.heroSection}>
          <Animated.View
            style={[
              styles.successIcon,
              {
                transform: [{ scale: scaleAnim }],
                opacity: fadeAnim,
              },
            ]}
          >
            <CheckCircle color="#10b981" size={64} strokeWidth={2.5} />
          </Animated.View>
          
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Payment Successful!</Text>
            <Text style={styles.heroSubtitle}>
              {experienceGifts.length} thoughtful gift(s) ready to share 🎉
            </Text>
          </Animated.View>
        </View>

        {/* Gifts List */}
        <View style={styles.giftsContainer}>
          {giftsWithExperiences.map((item, index) => {
            if (!item.experience) return null;
            
            const experienceImage = Array.isArray(item.experience.imageUrl)
              ? item.experience.imageUrl[0]
              : item.experience.imageUrl;

            return (
              <View key={item.gift.id || index} style={styles.giftCard}>
                <Image
                  source={{ uri: experienceImage }}
                  style={styles.giftImage}
                  resizeMode="cover"
                />
                <View style={styles.giftOverlay}>
                  <Gift color="#fff" size={20} />
                </View>
                
                <View style={styles.giftContent}>
                  <Text style={styles.giftTitle}>{item.experience.title}</Text>
                  {item.experience.subtitle && (
                    <Text style={styles.giftSubtitle}>{item.experience.subtitle}</Text>
                  )}
                  
                  <View style={styles.priceTag}>
                    <Text style={styles.priceAmount}>
                      €{item.experience.price.toFixed(2)}
                    </Text>
                  </View>

                  {/* Personal Message */}
                  {item.gift.personalizedMessage && (
                    <View style={styles.messageCard}>
                      <Text style={styles.messageLabel}>Your Message</Text>
                      <Text style={styles.messageText}>
                        "{item.gift.personalizedMessage}"
                      </Text>
                    </View>
                  )}

                  {/* Claim Code */}
                  <View style={styles.codeSection}>
                    <Text style={styles.codeLabel}>Gift Code</Text>
                    <View style={styles.codeDisplay}>
                      <Text style={styles.codeText}>{item.gift.claimCode}</Text>
                    </View>
                    
                    <View style={styles.codeActions}>
                      <TouchableOpacity
                        style={styles.copyCodeButton}
                        onPress={() => handleCopyCode(item.gift.claimCode)}
                        activeOpacity={0.7}
                      >
                        <Copy color="#8b5cf6" size={18} />
                        <Text style={styles.copyCodeText}>Copy</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.shareCodeButton}
                        onPress={() => handleShareCode(item.gift.claimCode, item.experience?.title)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.shareCodeText}>Share</Text>
                        <ArrowRight color="#fff" size={18} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* How It Works */}
        <View style={styles.howItWorksSection}>
          <Text style={styles.howItWorksTitle}>How It Works</Text>
          
          <View style={styles.stepsContainer}>
            {[
              {
                step: '1',
                title: 'Share the Code',
                desc: 'Send the gift code to your recipient',
              },
              {
                step: '2',
                title: 'Set Goals',
                desc: 'They create personal goals to earn the experience',
              },
              {
                step: '3',
                title: 'Track Progress',
                desc: 'AI hints guide them as they work toward their goals',
              },
              {
                step: '4',
                title: 'Unlock Reward',
                desc: 'Experience is revealed when goals are complete',
              },
            ].map((item, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepIndicator}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNumber}>{item.step}</Text>
                  </View>
                  {index < 3 && <View style={styles.stepLine} />}
                </View>
                
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{item.title}</Text>
                  <Text style={styles.stepDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={handleBackToHome}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  heroSection: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  giftsContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 20,
  },
  giftCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  giftImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#e5e7eb',
  },
  giftOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftContent: {
    padding: 20,
  },
  giftTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  giftSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#faf5ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  messageCard: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
    marginBottom: 16,
  },
  messageLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  messageText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#374151',
    lineHeight: 20,
  },
  codeSection: {
    marginTop: 8,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  codeDisplay: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  codeText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#8b5cf6',
    textAlign: 'center',
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f5f3ff',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  copyCodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  shareCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingVertical: 10,
    borderRadius: 8,
  },
  shareCodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  howItWorksSection: {
    marginHorizontal: 20,
    marginTop: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  howItWorksTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  stepsContainer: {
    gap: 4,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 16,
  },
  stepIndicator: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#e9d5ff',
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
    paddingVertical: 8,
    paddingBottom: 20,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  homeButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  homeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ConfirmationMultipleScreen;







