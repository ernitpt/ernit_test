import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Share, X } from 'lucide-react-native';
import Colors from '../config/colors';
import { useApp } from '../context/AppContext';

const ErnitLogo = require('../assets/favicon.png');

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstaller: React.FC = () => {
    const [showIOSPrompt, setShowIOSPrompt] = useState(false);
    const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const { state } = useApp();

    useEffect(() => {
        // Only run on web platform
        if (Platform.OS !== 'web') return;

        // Requirement: Only prompt to install if user is logged in AND has created a goal
        if (!state.user?.id || !state.goals || state.goals.length === 0) {
            return;
        }

        // 💝 Skip PWA install prompt if user is on valentines flow
        if (typeof window !== 'undefined' && window.location.pathname.includes('/valentines')) {
            console.log('💝 User on valentines flow - skipping PWA install prompt');
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
            console.log('PWA uninstalled detected - clearing dismissal flag');
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
            setTimeout(() => setShowIOSPrompt(true), 2000);
        }

        // Android: Listen for install prompt event
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show after a short delay
            setTimeout(() => setShowAndroidPrompt(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
            console.log('User accepted the install prompt');
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
            <Modal
                visible={true}
                transparent={true}
                animationType="fade"
                onRequestClose={handleIOSDismiss}
            >
                <View style={styles.overlay}>
                    <View style={styles.modalContainer}>
                        {/* Close button */}
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleIOSDismiss}
                        >
                            <X size={24} color="#9CA3AF" />
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.header}>
                            <Image source={ErnitLogo} style={{ width: 80, height: 80 }} />
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
                                        <Share size={20} color={Colors.accent} />
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
                        <TouchableOpacity
                            style={styles.dismissButton}
                            onPress={handleIOSDismiss}
                        >
                            <Text style={styles.dismissButtonText}>Maybe Later</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    }

    // Android Installation Modal
    if (showAndroidPrompt && deferredPrompt) {
        return (
            <Modal
                visible={true}
                transparent={true}
                animationType="slide"
                onRequestClose={handleAndroidDismiss}
            >
                <View style={styles.overlay}>
                    <View style={styles.modalContainer}>
                        {/* Close button */}
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleAndroidDismiss}
                        >
                            <X size={24} color="#9CA3AF" />
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.header}>
                            <Image source={ErnitLogo} style={{ width: 80, height: 80 }} />
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
                        <TouchableOpacity
                            style={styles.installButton}
                            onPress={handleAndroidInstall}
                        >
                            <Text style={styles.installButtonText}>Install App</Text>
                        </TouchableOpacity>

                        {/* Dismiss button */}
                        <TouchableOpacity
                            style={styles.dismissButton}
                            onPress={handleAndroidDismiss}
                        >
                            <Text style={styles.dismissButtonText}>Not Now</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    }

    return null;
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        backgroundColor: '#1F2937',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        position: 'relative',
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
        padding: 8,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        gap: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    instructions: {
        marginBottom: 24,
    },
    step: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    stepNumber: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.secondary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    stepNumberText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    stepDescription: {
        fontSize: 14,
        color: '#9CA3AF',
        lineHeight: 20,
    },
    shareIconDemo: {
        marginVertical: 8,
        padding: 8,
        backgroundColor: '#374151',
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    benefits: {
        backgroundColor: '#374151',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    benefitsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
    },
    benefit: {
        fontSize: 14,
        color: '#D1D5DB',
        marginBottom: 8,
        lineHeight: 20,
    },
    installButton: {
        backgroundColor: Colors.secondary,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 12,
    },
    installButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    dismissButton: {
        padding: 12,
        alignItems: 'center',
    },
    dismissButtonText: {
        color: '#9CA3AF',
        fontSize: 14,
    },
});
