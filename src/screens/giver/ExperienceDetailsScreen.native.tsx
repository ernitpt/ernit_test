import React, { useState, useEffect, useRef } from 'react';
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
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
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
  const submittingRef = useRef(false);
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
          <Text style={{ color: Colors.white, ...Typography.subheading }}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const handlePurchase = async () => {
    if (submittingRef.current || isSubmitting) return;
    submittingRef.current = true;

    if (!personalizedMessage.trim()) {
      showError('Please add a personalized message');
      submittingRef.current = false;
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
        claimCode: Array.from(
          crypto.getRandomValues(new Uint8Array(8)),
          (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 36]
        ).join(''),
      };

      const experienceGift = await experienceGiftService.createExperienceGift(
        experienceGiftData as ExperienceGift
      );
      dispatch({ type: 'SET_EXPERIENCE_GIFT', payload: experienceGift });
      showSuccess('Gift purchased successfully!');
      navigation.navigate('Confirmation', { experienceGift });
    } catch (err: unknown) {
      logger.error('❌ Payment error:', err);
      const message = err instanceof Error ? err.message : String(err);
      showError(message || 'Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <ErrorBoundary screenName="ExperienceDetailsScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Home">
      <StatusBar style="light" />
      <LinearGradient colors={Colors.gradientPrimary} style={styles.gradient}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xxl }}>          <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('CategorySelection');
            }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft color={Colors.white} size={22} />
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
            placeholderTextColor={Colors.gray300}
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
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backText: { color: Colors.white, ...Typography.heading3, fontWeight: '600', marginLeft: Spacing.xs },
  image: { width: '100%', height: 240, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg },
  title: { color: Colors.white, ...Typography.heading2, fontWeight: '700', marginBottom: Spacing.sm },
  desc: { color: Colors.border, ...Typography.subheading, marginBottom: Spacing.sm },
  howItWorksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  howItWorksText: {
    color: Colors.primary,
    ...Typography.body,
    fontWeight: '600',
    marginLeft: Spacing.xs,
  },
  price: { color: Colors.white, ...Typography.large, fontWeight: '700', marginBottom: Spacing.lg },
  textInput: {
    backgroundColor: Colors.whiteAlpha25,
    color: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  purchaseButton: { backgroundColor: Colors.white, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  purchaseText: { textAlign: 'center', color: Colors.primary, ...Typography.heading3, fontWeight: '700' },
});
