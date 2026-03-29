import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute } from '@react-navigation/native';
import { ChevronLeft, HelpCircle, MapPin } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import {
  Experience,
} from '../../types';
import { useGiverNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import HowItWorksModal from '../../components/HowItWorksModal';
import { partnerService } from '../../services/PartnerService';
import { PartnerUser } from '../../types';
import { logger } from '../../utils/logger';
import { vh } from '../../utils/responsive';
import { sanitizeText } from '../../utils/sanitization';
import { getUserMessage } from '../../utils/AppError';
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

  const { state } = useApp();
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
    let mounted = true;
    const loadPartner = async () => {
      if (!experience?.partnerId) return;
      try {
        const p = await partnerService.getPartnerById(experience.partnerId);
        if (mounted) setPartner(p);
      } catch {
        // Non-critical — partner info is decorative; silently ignore
      }
    };
    loadPartner();
    return () => { mounted = false; };
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

  const handlePurchase = useCallback(async () => {
    if (submittingRef.current || isSubmitting) return;
    submittingRef.current = true;

    if (!personalizedMessage.trim()) {
      showError('Please add a personalized message');
      submittingRef.current = false;
      return;
    }
    setIsSubmitting(true);

    try {
      // Do NOT create a PaymentIntent here. ExperienceCheckout creates its own
      // PaymentIntent on mount — pre-creating one here would result in two
      // abandoned PaymentIntents (a financial leak / Stripe billing bug).
      // Pass only cart metadata; ExperienceCheckout owns PaymentIntent lifecycle.
      // TODO: ExperienceCheckout route type needs to accept these params - tracked as tech debt
      navigation.navigate('ExperienceCheckout', {
        cartItems: [{ experienceId: experience.id, quantity: 1 }],
        goalId: state.empowerContext?.goalId,
        personalizedMessage: sanitizeText(personalizedMessage.trim(), 500),
      } as never);
    } catch (err: unknown) {
      logger.error('❌ Navigation error:', err);
      showError(getUserMessage(err, 'Could not process your request. Please try again.'));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [experience, isSubmitting, personalizedMessage, state.user, state.empowerContext?.goalId, navigation, showError]);

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
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`${experience.title} experience cover image`}
          />
          <Text style={styles.title}>{experience.title}</Text>
          <Text style={styles.desc}>{experience.description}</Text>

          {/* Location + Map */}
          {(experience.location || partner?.mapsUrl) && (
            <View style={styles.locationSection}>
              {(partner?.address || experience.location) && (
                <View style={styles.addressRow}>
                  <MapPin color={colors.border} size={16} />
                  <Text style={styles.addressText}>
                    {partner?.address || experience.location}
                  </Text>
                </View>
              )}
              {partner?.mapsUrl && (
                <View style={styles.mapContainer}>
                  <WebView
                    source={{ uri: partner.mapsUrl.includes('?') ? `${partner.mapsUrl}&layer=` : `${partner.mapsUrl}?layer=` }}
                    style={{ flex: 1, borderRadius: BorderRadius.md }}
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                    nestedScrollEnabled={false}
                  />
                </View>
              )}
            </View>
          )}

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
            placeholder="Write a personal message..."
            value={personalizedMessage}
            onChangeText={setPersonalizedMessage}
            multiline
            accessibilityLabel="Personal message"
            inputStyle={styles.textInputInner}
            containerStyle={styles.textInputContainer}
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
  locationSection: { marginBottom: Spacing.lg },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  addressText: { color: colors.border, ...Typography.body, flex: 1 },
  mapContainer: { height: vh(180), borderRadius: BorderRadius.md, overflow: 'hidden', backgroundColor: colors.border },
  price: { color: colors.white, ...Typography.large, fontWeight: '700', marginBottom: Spacing.lg },
  textInputContainer: {
    marginBottom: Spacing.lg,
  },
  textInputInner: {
    color: colors.white,
  },
  purchaseButton: { backgroundColor: colors.white, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  purchaseText: { textAlign: 'center', color: colors.primary, ...Typography.heading3, fontWeight: '700' },
});
