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

type ConfirmationNavigationProp = NativeStackNavigationProp<
  GiverStackParamList,
  'Confirmation'
>;

const ConfirmationScreen = () => {
  const navigation = useNavigation<ConfirmationNavigationProp>();
  const route = useRoute();
  const { experienceGift } = route.params as { experienceGift: ExperienceGift };
  const { dispatch } = useApp();

  // Success animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
  
  const [experience, setExperience] = useState<any>(null);

  useEffect(() => {
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        setExperience(exp);
      } catch (error) {
        console.error("Error fetching experience:", error);
        Alert.alert("Error", "Could not load experience details.");
      }
    };
    fetchExperience();
  }, [experienceGift.experienceId]);


  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(experienceGift.claimCode);
    Alert.alert('✓ Copied!', 'Claim code copied to clipboard.');
  };

  const handleShareCode = async () => {
    try {
      const shareOptions = {
        title: 'Gift Code',
        message: `
        Hey! Got you an Ernit experience. A little boost for your goals.

        Sign up and use code ${experienceGift.claimCode} at https://ernit.app to set up your goals. Once you complete your goals, you'll see what I got you 😎

        Earn it. Unlock it. Enjoy it 💙
        `
      };

      const result = await Share.share(shareOptions);

      // Optional: handle what happens after sharing
      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // Shared successfully via specific app (e.g., 'com.whatsapp')
          console.log('Shared via', result.activityType);
        } else {
          // Shared successfully (user might have copied or saved)
        }
      } else if (result.action === Share.dismissedAction) {
        // User dismissed the share sheet
        console.log('Share dismissed');
      }
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

  // Show loading state
  if (!experience) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 16, color: "#6b7280" }}>Loading experience...</Text>
      </View>
    );
  }

  const experienceImage = Array.isArray(experience.imageUrl)
    ? experience.imageUrl[0]
    : experience.imageUrl;
    
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
              Your thoughtful gift is ready to share 🎉
            </Text>
          </Animated.View>
        </View>

        {/* Experience Card */}
        <View style={styles.experienceCard}>
          <Image
            source={{ uri: experienceImage }}
            style={styles.experienceImage}
            resizeMode="cover"
          />
          <View style={styles.experienceOverlay}>
            <Gift color="#fff" size={24} />
          </View>
          
          <View style={styles.experienceContent}>
            <Text style={styles.experienceTitle}>
              {experience.title}
            </Text>
            {experience.subtitle && (
              <Text style={styles.experienceSubtitle}>
                {experience.subtitle}
              </Text>
            )}
            
            <View style={styles.priceTag}>
              <Text style={styles.priceAmount}>
                €{experience.price.toFixed(2)}
              </Text>
            </View>

            {/* Personal Message */}
            {experienceGift.personalizedMessage && (
              <View style={styles.messageCard}>
                <Text style={styles.messageLabel}>Your Message</Text>
                <Text style={styles.messageText}>
                  "{experienceGift.personalizedMessage}"
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Claim Code Section */}
        <View style={styles.codeSection}>
          <View style={styles.codeSectionHeader}>
            <Text style={styles.codeSectionTitle}>Gift Code</Text>
            <Text style={styles.codeSectionSubtitle}>
              Share this code to unlock the experience
            </Text>
          </View>

          <View style={styles.codeCard}>
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>{experienceGift.claimCode}</Text>
            </View>
            
            <View style={styles.codeActions}>
              <TouchableOpacity
                style={styles.copyCodeButton}
                onPress={handleCopyCode}
                activeOpacity={0.7}
              >
                <Copy color="#8b5cf6" size={20} />
                <Text style={styles.copyCodeText}>Copy Code</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.shareCodeButton}
                onPress={handleShareCode}
                activeOpacity={0.7}
              >
                <Text style={styles.shareCodeText}>Share</Text>
                <ArrowRight color="#fff" size={20} />
              </TouchableOpacity>
            </View>
          </View>
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
  experienceCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  experienceImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#e5e7eb',
  },
  experienceOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  experienceContent: {
    padding: 20,
  },
  experienceTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  experienceSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 16,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#faf5ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 20,
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  messageCard: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#374151',
    lineHeight: 22,
  },
  codeSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  codeSectionHeader: {
    marginBottom: 16,
  },
  codeSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  codeSectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  codeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  codeDisplay: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  codeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#8b5cf6',
    textAlign: 'center',
    letterSpacing: 6,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  copyCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  shareCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 10,
  },
  shareCodeText: {
    fontSize: 16,
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

export default ConfirmationScreen;