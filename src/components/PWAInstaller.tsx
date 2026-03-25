import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Share, X } from 'lucide-react-native';
import { BaseModal } from './BaseModal';
import Button from './Button';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';

const ErnitLogo = require('../assets/favicon.png');

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstaller: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [showIOSPrompt, setShowIOSPrompt] = useState(false);
    const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const { state } = useApp();
    const iosPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const androidPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        // Only run on web platform
        if (Platform.OS !== 'web') return;

        // Requirement: Only prompt to install if user is logged in AND has created a goal
        if (!state.user?.id || !state.goals || state.goals.length === 0) {
            return;
        }

        // Detect iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

        // Check if currently in standalone mode (installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone ||
            document.referrer.includes('android-app://');

        // Check previous installation state
        const wasInstalled = localStorage.getItem('pwa-was-installed') === 'true';

        // Detect if app was uninstalled: was installed before but isn't now
        if (wasInstalled && !isStandalone) {
            // App was uninstalled! Clear the dismissal flag so prompt can reappear
            localStorage.removeItem('pwa-install-dismissed-until');
            localStorage.removeItem('pwa-was-installed');
            logger.log('PWA uninstalled detected - clearing dismissal flag');
        }

        // Update current installation state
        if (isStandalone) {
            localStorage.setItem('pwa-was-installed', 'true');
        }

        // Check if already dismissed (after potential cleanup above)
        const dismissedUntil = localStorage.getItem('pwa-install-dismissed-until');
        if (dismissedUntil) {
            const dismissedTimestamp = parseInt(dismissedUntil, 10);
            const now = Date.now();
            // If still within dismissal period, don't show prompt
            if (now < dismissedTimestamp) return;
            // Dismissal period expired, clear the flag
            localStorage.removeItem('pwa-install-dismissed-until');
        }

        // iOS: Show manual installation prompt if not installed
        if (isIOS && !isStandalone) {
            // Show after a short delay to not overwhelm the user
            iosPromptTimeoutRef.current = setTimeout(() => setShowIOSPrompt(true), 2000);
        }

        // Android: Listen for install prompt event
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show after a short delay
            androidPromptTimeoutRef.current = setTimeout(() => setShowAndroidPrompt(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            if (iosPromptTimeoutRef.current) clearTimeout(iosPromptTimeoutRef.current);
            if (androidPromptTimeoutRef.current) clearTimeout(androidPromptTimeoutRef.current);
        };
    }, [state.user?.id, state.goals?.length]);

    const handleIOSDismiss = () => {
        setShowIOSPrompt(false);
        // Dismiss for 7 days instead of permanently
        const sevenDaysFromNow = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('pwa-install-dismissed-until', sevenDaysFromNow.toString());
    };

    const handleAndroidInstall = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        await deferredPrompt.prompt();

        // Wait for the user's response
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            logger.log('User accepted the install prompt');
            // Track that app is now installed
            localStorage.setItem('pwa-was-installed', 'true');
        }

        // Clear the prompt
        setDeferredPrompt(null);
        setShowAndroidPrompt(false);
        // Dismiss for 7 days instead of permanently
        const sevenDaysFromNow = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('pwa-install-dismissed-until', sevenDaysFromNow.toString());
    };

    const handleAndroidDismiss = () => {
        setShowAndroidPrompt(false);
        // Dismiss for 7 days instead of permanently
        const sevenDaysFromNow = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('pwa-install-dismissed-until', sevenDaysFromNow.toString());
    };

    // iOS Installation Modal
    if (showIOSPrompt) {
        return (
            <BaseModal
                visible={true}
                onClose={handleIOSDismiss}
            >
                    <View style={styles.modalContainer}>
                        {/* Close button */}
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleIOSDismiss}
                        >
                            <X size={24} color={colors.textMuted} />
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.header}>
                            <Image source={ErnitLogo} style={{ width: 80, height: 80 }} resizeMode="contain" />
                            <Text style={styles.title}>Install Ernit</Text>
                            <Text style={styles.subtitle}>Get the full app experience with push notifications</Text>
                        </View>

                        {/* Instructions */}
                        <View style={styles.instructions}>
                            <View style={styles.step}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>1</Text>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Tap the Share button</Text>
                                    <View style={styles.shareIconDemo}>
                                        <Share size={20} color={colors.accent} />
                                    </View>
                                    <Text style={styles.stepDescription}>
                                        Look for the share icon in your Safari toolbar (bottom of screen)
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.step}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>2</Text>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Select "Add to Home Screen"</Text>
                                    <Text style={styles.stepDescription}>
                                        Scroll down and tap "Add to Home Screen"
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.step}>
                                <View style={styles.stepNumber}>
                                    <Text style={styles.stepNumberText}>3</Text>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Tap "Add"</Text>
                                    <Text style={styles.stepDescription}>
                                        Confirm by tapping "Add" in the top-right corner
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Benefits */}
                        <View style={styles.benefits}>
                            <Text style={styles.benefitsTitle}>You'll get:</Text>
                            <Text style={styles.benefit}>✓ Push notifications for goals & hints</Text>
                            <Text style={styles.benefit}>✓ Faster app launch</Text>
                            <Text style={styles.benefit}>✓ Full-screen experience</Text>
                        </View>

                        {/* Dismiss button */}
                        <Button
                            variant="ghost"
                            title="Maybe Later"
                            onPress={handleIOSDismiss}
                            style={styles.dismissButton}
                            fullWidth
                        />
                    </View>
            </BaseModal>
        );
    }

    // Android Installation Modal
    if (showAndroidPrompt && deferredPrompt) {
        return (
            <BaseModal
                visible={true}
                onClose={handleAndroidDismiss}
            >
                    <View style={styles.modalContainer}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleAndroidDismiss}
                        >
                            <X size={24} color={colors.textMuted} />
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.header}>
                            <Image source={ErnitLogo} style={{ width: 80, height: 80 }} resizeMode="contain" />
                            <Text style={styles.title}>Install Ernit</Text>
                            <Text style={styles.subtitle}>Get the full app experience</Text>
                        </View>

                        {/* Benefits */}
                        <View style={styles.benefits}>
                            <Text style={styles.benefit}>✓ Push notifications for goals & hints</Text>
                            <Text style={styles.benefit}>✓ Faster app launch from home screen</Text>
                            <Text style={styles.benefit}>✓ Full-screen experience</Text>
                        </View>

                        {/* Install button */}
                        <Button
                            variant="primary"
                            title="Install App"
                            onPress={handleAndroidInstall}
                            style={styles.installButton}
                            fullWidth
                        />

                        {/* Dismiss button */}
                        <Button
                            variant="ghost"
                            title="Not Now"
                            onPress={handleAndroidDismiss}
                            style={styles.dismissButton}
                            fullWidth
                        />
                    </View>
            </BaseModal>
        );
    }

    return null;
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: colors.overlayHeavy,
            justifyContent: 'center',
            alignItems: 'center',
            padding: Spacing.xl,
        },
        modalContainer: {
            backgroundColor: colors.gray800,
            borderRadius: BorderRadius.xxl,
            padding: Spacing.xxl,
            width: '100%',
            maxWidth: 400,
            position: 'relative',
        },
        closeButton: {
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            padding: Spacing.sm,
        },
        header: {
            alignItems: 'center',
            marginBottom: Spacing.xxl,
            gap: Spacing.lg,
        },
        title: {
            ...Typography.heading1,
            fontWeight: 'bold',
            color: colors.white,
            marginBottom: Spacing.sm,
        },
        subtitle: {
            ...Typography.body,
            color: colors.textMuted,
            textAlign: 'center',
        },
        instructions: {
            marginBottom: Spacing.xxl,
        },
        step: {
            flexDirection: 'row',
            marginBottom: Spacing.xl,
        },
        stepNumber: {
            width: 32,
            height: 32,
            borderRadius: BorderRadius.circle,
            backgroundColor: colors.secondary,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: Spacing.md,
        },
        stepNumberText: {
            color: colors.white,
            ...Typography.subheading,
            fontWeight: 'bold',
        },
        stepContent: {
            flex: 1,
        },
        stepTitle: {
            ...Typography.subheading,
            fontWeight: '600',
            color: colors.white,
            marginBottom: Spacing.xxs,
        },
        stepDescription: {
            ...Typography.small,
            color: colors.textMuted,
        },
        shareIconDemo: {
            marginVertical: Spacing.sm,
            padding: Spacing.sm,
            backgroundColor: colors.gray700,
            borderRadius: BorderRadius.sm,
            alignSelf: 'flex-start',
        },
        benefits: {
            backgroundColor: colors.gray700,
            borderRadius: BorderRadius.md,
            padding: Spacing.lg,
            marginBottom: Spacing.xl,
        },
        benefitsTitle: {
            ...Typography.small,
            fontWeight: '600',
            color: colors.white,
            marginBottom: Spacing.md,
        },
        benefit: {
            ...Typography.small,
            color: colors.gray300,
            marginBottom: Spacing.sm,
        },
        installButton: {
            backgroundColor: colors.secondary,
            borderRadius: BorderRadius.md,
            padding: Spacing.lg,
            alignItems: 'center',
            marginBottom: Spacing.md,
        },
        installButtonText: {
            color: colors.white,
            ...Typography.subheading,
            fontWeight: '600',
        },
        dismissButton: {
            padding: Spacing.md,
            alignItems: 'center',
        },
        dismissButtonText: {
            color: colors.textMuted,
            ...Typography.small,
        },
    });
