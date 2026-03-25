import React, { useMemo, useEffect, useCallback } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import Button from '../components/Button';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types'; // Ensure this path is correct
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

type LandingScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Landing'>;

const LandingScreen = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const navigation = useNavigation<LandingScreenNavigationProp>();
  const { state } = useApp();

  // Redirect authenticated users to Goals
  useEffect(() => {
    if (state.user?.id) {
      navigation.reset({ index: 0, routes: [{ name: 'Goals' }] });
    }
  }, [state.user?.id, navigation]);

  const handleSignIn = useCallback(() => {
    navigation.navigate('Auth', { mode: 'signin' });
  }, [navigation]);

  const handleSignUp = useCallback(() => {
    navigation.navigate('Auth', { mode: 'signup' });
  }, [navigation]);

  return (
    <ErrorBoundary screenName="LandingScreen">
    <LinearGradient
      colors={colors.gradientPrimary}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.container}>

          {/* Top Section - Logo & Tagline */}
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 600, delay: 200 }}
          >
            <View style={styles.topSection}>

              <Image
                // IMPORTANT: Make sure this relative path is correct for your file structure
                source={require('../assets/icon.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Ernit app logo"
              />

              {/* Logo Text */}
              <View style={styles.logoTextContainer}>
                <Text style={styles.title}>
                  Ernit
                </Text>
                <Text style={styles.tagline}>
                  Gamified Rewards & Experiences
                </Text>
              </View>
            </View>
          </MotiView>

          {/* Bottom Section - Two Options */}
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 600, delay: 500 }}
          >
            <View style={styles.bottomSection}>
              {/* Sign In Button */}
              <View style={styles.buttonWrapper}>
                <Button
                  variant="secondary"
                  title="Sign In"
                  onPress={handleSignIn}
                  fullWidth
                />
              </View>

              {/* Sign Up Button */}
              <View style={styles.buttonWrapper}>
                <Button
                  variant="primary"
                  title="Sign Up"
                  onPress={handleSignUp}
                  fullWidth
                  gradient
                />
              </View>
            </View>
          </MotiView>
        </View>
      </SafeAreaView>
    </LinearGradient>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    gradient: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing.xxxl,
    },
    topSection: {
      alignItems: 'center',
    },
    logo: {
      width: 120,
      height: 120,
      marginBottom: Spacing.lg,
    },
    logoTextContainer: {
      marginBottom: Spacing.xxxl,
      alignItems: 'center',
    },
    title: {
      ...Typography.brandLogo,
      color: colors.white,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    tagline: {
      ...Typography.large,
      color: colors.primaryTint,
      textAlign: 'center',
    },
    bottomSection: {
      marginTop: Spacing.xxxl,
    },
    buttonWrapper: {
      marginBottom: Spacing.lg,
    },
  });

export default LandingScreen;
