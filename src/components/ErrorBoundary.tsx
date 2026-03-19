import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { analyticsService } from '../services/AnalyticsService';
import { logErrorToFirestore } from '../utils/errorLogger';
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

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log to console for development
        logger.error('🔴 ErrorBoundary caught:', error.message, errorInfo);

        // Track in analytics
        analyticsService.trackEvent('error_boundary_triggered', 'error', {
            screenName: this.props.screenName,
            errorMessage: error.message,
        });

        // Fire-and-forget — do not await in lifecycle methods
        logErrorToFirestore(error, {
            screenName: this.props.screenName,
            feature: 'ErrorBoundary',
            userId: this.props.userId,
            additionalData: {
                componentStack: errorInfo.componentStack?.substring(0, 1000),
            },
        }).catch(e => logger.warn('Failed to log error to Firestore:', e));
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
