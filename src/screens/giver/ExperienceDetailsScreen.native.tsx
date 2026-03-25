import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { ChevronLeft, HelpCircle } from 'lucide-react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import {
  Experience,
} from '../../types';
import { useGiverNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import HowItWorksModal from '../../components/HowItWorksModal';
import { ExperienceDetailSkeleton } from '../../components/SkeletonLoader';
import { partnerService } from '../../services/PartnerService';
import { PartnerUser } from '../../types';
import { logger } from '../../utils/logger';
import { config } from '../../config/environment';
import { vh } from '../../utils/responsive';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';

export default function ExperienceDetailsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useGiverNavigation();
  const route = useRoute();

  // Handle case where route params might be undefined
  const routeParams = route.params as { experience?: Experience } | undefined;
  const experience = routeParams?.experience;

  const { state, dispatch } = useApp();
  const { showError } = useToast();

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
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
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
      // SECURITY FIX: Native client-side gift creation is blocked by Firestore rules
      // (allow create: if false). Redirect to the web checkout flow which uses a
      // Cloud Function to create gifts server-side after payment confirmation.
      const createIntent = httpsCallable(functions, config.stripeFunctions.createPaymentIntent);
      const cartMetadata = [{
        experienceId: experience.id,
        partnerId: experience.partnerId || '',
        quantity: 1,
      }];
      const result = await createIntent({
        amount: experience.price,
        giverId: state.user?.id,
        giverName: state.user?.displayName || '',
        partnerId: experience.partnerId || '',
        cartMetadata,
        personalizedMessage,
      });
      const data = result.data as { clientSecret: string };

      // Hand off to the web checkout flow — gift creation happens server-side
      // via the stripeWebhook Cloud Function after payment succeeds.
      navigation.navigate('ExperienceCheckout', {
        cartItems: [{ experienceId: experience.id, quantity: 1 }],
        clientSecret: data.clientSecret,
      } as never);
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
      <LinearGradient colors={colors.gradientPrimary} style={styles.gradient}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xxl }} keyboardShouldPersistTaps="handled">          <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('CategorySelection');
            }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft color={colors.white} size={22} />
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
            <HelpCircle color={colors.primary} size={18} />
            <Text style={styles.howItWorksText}>How it works</Text>
          </TouchableOpacity>

          <Text style={styles.price}>€{experience.price}</Text>

          <TextInput
            style={styles.textInput}
            placeholder="Write a personal message..."
            placeholderTextColor={colors.gray300}
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

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  gradient: { flex: 1 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backText: { color: colors.white, ...Typography.heading3, fontWeight: '600', marginLeft: Spacing.xs },
  image: { width: '100%', height: vh(240), borderRadius: BorderRadius.lg, marginBottom: Spacing.lg },
  title: { color: colors.white, ...Typography.heading2, fontWeight: '700', marginBottom: Spacing.sm },
  desc: { color: colors.border, ...Typography.subheading, marginBottom: Spacing.sm },
  howItWorksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  howItWorksText: {
    color: colors.primary,
    ...Typography.body,
    fontWeight: '600',
    marginLeft: Spacing.xs,
  },
  price: { color: colors.white, ...Typography.large, fontWeight: '700', marginBottom: Spacing.lg },
  textInput: {
    backgroundColor: colors.whiteAlpha25,
    color: colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  purchaseButton: { backgroundColor: colors.white, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  purchaseText: { textAlign: 'center', color: colors.primary, ...Typography.heading3, fontWeight: '700' },
});
