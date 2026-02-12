import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { db } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';

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
        console.error('🔴 ErrorBoundary caught:', error.message, errorInfo);

        // Try Firestore first
        try {
            await addDoc(collection(db, 'errors'), {
                ...errorData,
                timestamp: new Date(),
            });
            console.log('✅ Error logged to Firestore');
        } catch (firestoreError) {
            console.error('⚠️ Failed to log to Firestore (likely security rules):', firestoreError);

            // Fallback: Save to localStorage so it can be retrieved later
            try {
                const existingErrors = JSON.parse(localStorage.getItem('ernit_error_log') || '[]');
                existingErrors.push(errorData);
                // Keep only last 10 errors
                const trimmed = existingErrors.slice(-10);
                localStorage.setItem('ernit_error_log', JSON.stringify(trimmed));
                console.log('✅ Error saved to localStorage instead');
                console.log('📋 Error details:', JSON.stringify(errorData, null, 2));
            } catch (localError) {
                // Last resort: just log to console
                console.error('❌ Could not save error anywhere:', localError);
                console.error('📋 Error details:', JSON.stringify(errorData, null, 2));
            }
        }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        // Reload the page to reset state
        window.location.reload();
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
                    <TouchableOpacity
                        style={styles.button}
                        onPress={this.handleReset}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Refresh Page</Text>
                    </TouchableOpacity>
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
        padding: 20,
        backgroundColor: '#fff',
    },
    emoji: {
        fontSize: 64,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    button: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 12,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
