import React, { Component, ReactNode, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { analyticsService } from '../services/AnalyticsService';
import { logErrorToFirestore } from '../utils/errorLogger';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { logger } from '../utils/logger';

interface Props {
    children: ReactNode;
    screenName: string;
    userId?: string;
    colors: typeof Colors;
    styles: ReturnType<typeof createStyles>;
}

interface State {
    hasError: boolean;
    error: Error | null;
    resetAttempts: number;
}

class ErrorBoundaryClass extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, resetAttempts: 0 };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
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
        this.setState(prev => ({
            hasError: false,
            error: null,
            resetAttempts: prev.resetAttempts + 1,
        }));
        // On web, reload the page; on native, just reset the error state
        if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
            window.location.reload();
        }
    };

    render() {
        const { styles } = this.props;
        if (this.state.hasError) {
            const tooManyAttempts = this.state.resetAttempts >= 2;
            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>😔</Text>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.message}>
                        {tooManyAttempts
                            ? 'This section keeps crashing.\nPlease restart the app.'
                            : 'We\'re having trouble loading this page.\nPlease try refreshing.'}
                    </Text>
                    {!tooManyAttempts && (
                        <Button
                            title="Try Again"
                            variant="primary"
                            onPress={this.handleReset}
                            style={{ backgroundColor: this.props.colors.actionBlue }}
                        />
                    )}
                </View>
            );
        }

        return this.props.children;
    }
}

// ─── Public wrapper uses hooks to inject colors ────────────────────────────────

interface ErrorBoundaryProps {
    children: ReactNode;
    screenName: string;
    userId?: string;
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children, screenName, userId }) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <ErrorBoundaryClass
            screenName={screenName}
            userId={userId}
            colors={colors}
            styles={styles}
        >
            {children}
        </ErrorBoundaryClass>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: Spacing.xl,
            backgroundColor: colors.white,
        },
        emoji: {
            fontSize: Typography.emojiLarge.fontSize,
            marginBottom: Spacing.xl,
        },
        title: {
            ...Typography.heading1,
            fontWeight: '800',
            color: colors.textPrimary,
            marginBottom: Spacing.md,
            textAlign: 'center',
        },
        message: {
            ...Typography.subheading,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 24,
            marginBottom: Spacing.xxxl,
        },
    });
