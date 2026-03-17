import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { db } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { analyticsService } from '../services/AnalyticsService';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { logger } from '../utils/logger';

interface Props {
    children: ReactNode;
    screenName: string;
    userId?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        const errorData = {
            message: error.message,
            stack: error.stack?.substring(0, 2000), // Limit stack size
            componentStack: errorInfo.componentStack?.substring(0, 1000),
            screenName: this.props.screenName,
            userId: this.props.userId || 'unknown',
            timestamp: new Date().toISOString(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        };

        // Also log to console for development
        logger.error('🔴 ErrorBoundary caught:', error.message, errorInfo);

        // Track in analytics
        analyticsService.trackEvent('error_boundary_triggered', 'error', {
            screenName: this.props.screenName,
            errorMessage: error.message,
        });

        // Try Firestore first
        try {
            await addDoc(collection(db, 'errors'), {
                ...errorData,
                timestamp: new Date(),
            });
            logger.log('✅ Error logged to Firestore');
        } catch (firestoreError) {
            logger.error('⚠️ Failed to log to Firestore (likely security rules):', firestoreError);

            // Fallback: Save to localStorage so it can be retrieved later
            try {
                if (typeof localStorage === 'undefined') throw new Error('No localStorage');
                const existingErrors = JSON.parse(localStorage.getItem('ernit_error_log') || '[]');
                existingErrors.push(errorData);
                // Keep only last 10 errors
                const trimmed = existingErrors.slice(-10);
                localStorage.setItem('ernit_error_log', JSON.stringify(trimmed));
                logger.log('✅ Error saved to localStorage instead');
                logger.log('📋 Error details:', JSON.stringify(errorData, null, 2));
            } catch (localError) {
                // Last resort: just log to console
                logger.error('❌ Could not save error anywhere:', localError);
                logger.error('📋 Error details:', JSON.stringify(errorData, null, 2));
            }
        }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        // On web, reload the page; on native, just reset the error state
        if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
            window.location.reload();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>😔</Text>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.message}>
                        We're having trouble loading this page.{'\n'}
                        Please try refreshing.
                    </Text>
                    <Button
                        title="Try Again"
                        variant="primary"
                        onPress={this.handleReset}
                    />
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
        backgroundColor: Colors.white,
    },
    emoji: {
        fontSize: Typography.emojiLarge.fontSize,
        marginBottom: Spacing.xl,
    },
    title: {
        ...Typography.heading1,
        fontWeight: '800',
        color: Colors.textPrimary,
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    message: {
        ...Typography.subheading,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: Spacing.xxxl,
    },
});
