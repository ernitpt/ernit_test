import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { ChevronLeft, HelpCircle } from 'lucide-react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import {
  Experience,
  ExperienceGift,
} from '../../types';
import { useGiverNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import HowItWorksModal from '../../components/HowItWorksModal';
import { ExperienceDetailSkeleton } from '../../components/SkeletonLoader';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { partnerService } from '../../services/PartnerService';
import { PartnerUser } from '../../types';
import { logger } from '../../utils/logger';
import { config } from '../../config/environment';
import Colors from '../../config/colors';
import { useToast } from '../../context/ToastContext';

export default function ExperienceDetailsScreen() {
  const navigation = useGiverNavigation();
  const route = useRoute();

  // Handle case where route params might be undefined
  const routeParams = route.params as { experience?: Experience } | undefined;
  const experience = routeParams?.experience;

  const { state, dispatch } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { showSuccess, showError } = useToast();

  const [personalizedMessage, setPersonalizedMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Redirect if data is missing
  useEffect(() => {
    if (!experience?.id) {
      logger.warn('Missing/invalid experience on ExperienceDetailsScreen (Native), redirecting to Home');
      navigation.reset({
        index: 0,
        routes: [{ name: 'CategorySelection' }],
      });
    }
  }, [experience, navigation]);

  useEffect(() => {
    const loadPartner = async () => {
      if (!experience?.partnerId) return;
      const p = await partnerService.getPartnerById(experience.partnerId);
      setPartner(p);
    };
    loadPartner();
  }, [experience?.partnerId]);

  // Early return if data is invalid
  if (!experience?.id) {
    return (
      <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const handlePurchase = async () => {
    if (!personalizedMessage.trim()) {
      showError('Please add a personalized message');
      return;
    }
    setIsSubmitting(true);

    try {
      // 1️⃣ Create PaymentIntent - uses environment-based function name
      const createIntent = httpsCallable(functions, config.stripeFunctions.createPaymentIntent);
      const { data }: any = await createIntent({
        amount: experience.price,
        experienceId: experience.id,
        giverId: state.user?.id,
      });
      const clientSecret = data.clientSecret;

      // 2️⃣ Init & Present payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Ernit',
      });
      if (initError) throw initError;
      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) throw paymentError;

      // 3️⃣ Create gift
      const experienceGiftData: ExperienceGift = {
        id: Date.now().toString(),
        giverId: state.user?.id || '',
        giverName: state.user?.displayName || '',
        experienceId: experience.id,
        partnerId: experience.partnerId || '',
        personalizedMessage,
        deliveryDate: new Date(),
        status: 'pending',
        payment: 'paid',
        createdAt: new Date(),
        claimCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      };

      const experienceGift = await experienceGiftService.createExperienceGift(
        experienceGiftData as ExperienceGift
      );
      dispatch({ type: 'SET_EXPERIENCE_GIFT', payload: experienceGift });
      showSuccess('Gift purchased successfully!');
      navigation.navigate('Confirmation', { experienceGift });
    } catch (err: any) {
      logger.error('❌ Payment error:', err);
      showError(err.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Home">
      <StatusBar style="light" />
      <LinearGradient colors={Colors.gradientPrimary} style={styles.gradient}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>          <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft color="#fff" size={22} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

          <Image
            source={{ uri: experience.coverImageUrl }}
            style={styles.image}
            accessibilityLabel={`${experience.title} experience cover image`}
          />
          <Text style={styles.title}>{experience.title}</Text>
          <Text style={styles.desc}>{experience.description}</Text>

          <TouchableOpacity
            onPress={() => setShowHowItWorks(true)}
            style={styles.howItWorksButton}
            accessibilityRole="button"
            accessibilityLabel="How it works"
          >
            <HelpCircle color={Colors.primary} size={18} />
            <Text style={styles.howItWorksText}>How it works</Text>
          </TouchableOpacity>

          <Text style={styles.price}>€{experience.price}</Text>

          <TextInput
            style={styles.textInput}
            placeholder="Write a personal message..."
            placeholderTextColor="#ccc"
            value={personalizedMessage}
            onChangeText={setPersonalizedMessage}
            multiline
            accessibilityLabel="Personal message"
          />

          <TouchableOpacity
            onPress={handlePurchase}
            style={[styles.purchaseButton, isSubmitting && { opacity: 0.7 }]}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={`Purchase gift for ${experience.price} euros`}
          >
            <Text style={styles.purchaseText}>
              {isSubmitting ? 'Processing...' : `Purchase Gift – €${experience.price}`}
            </Text>
          </TouchableOpacity>

        </ScrollView>

        <HowItWorksModal
          visible={showHowItWorks}
          onClose={() => setShowHowItWorks(false)}
        />
      </LinearGradient>
    </MainScreen>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backText: { color: '#fff', fontSize: 17, fontWeight: '600', marginLeft: 4 },
  image: { width: '100%', height: 240, borderRadius: 16, marginBottom: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  desc: { color: '#ddd', fontSize: 16, marginBottom: 8 },
  howItWorksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  howItWorksText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  price: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  purchaseButton: { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 12 },
  purchaseText: { textAlign: 'center', color: Colors.primary, fontSize: 18, fontWeight: 'bold' },
});
