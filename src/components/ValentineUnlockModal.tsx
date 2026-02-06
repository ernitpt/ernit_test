import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Animated,
} from 'react-native';
import { Trophy } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { commonStyles } from '../styles/commonStyles';
import { useModalAnimation } from '../hooks/useModalAnimation';

interface ValentineUnlockModalProps {
    visible: boolean;
    partnerName?: string;
    onClaim: () => void;
}

export const ValentineUnlockModal: React.FC<ValentineUnlockModalProps> = ({
    visible,
    partnerName,
    onClaim,
}) => {
    const slideAnim = useModalAnimation(visible);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClaim}
        >
            <TouchableOpacity
                style={commonStyles.modalOverlay}
                activeOpacity={1}
                onPress={onClaim}
            >
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                    pointerEvents={visible ? "box-none" : "none"}
                >
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        <LinearGradient
                            colors={['#FFE5EF', '#FFF4ED']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.modalContent}
                        >
                            {/* Trophy Icon */}
                            <View style={styles.iconContainer}>
                                <LinearGradient
                                    colors={['#FFD700', '#FFA500']}
                                    style={styles.iconBg}
                                >
                                    <Trophy color="#FFFFFF" size={50} fill="#FFFFFF" />
                                </LinearGradient>
                            </View>

                            {/* Title */}
                            <Text style={styles.title}>You Both Did It! 💝</Text>

                            {/* Message */}
                            <Text style={styles.message}>
                                {partnerName || 'Your partner'} just completed their goal!{'\n'}
                                Time to claim your reward together.
                            </Text>

                            {/* Claim Button */}
                            <TouchableOpacity
                                onPress={onClaim}
                                activeOpacity={0.8}
                                style={styles.claimButton}
                            >
                                <LinearGradient
                                    colors={['#8B5CF6', '#6366F1']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.claimButtonGradient}
                                >
                                    <Text style={styles.claimButtonText}>Claim Reward</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        width: '90%',
        maxWidth: 400,
        alignSelf: 'center',
        marginHorizontal: 20,
    },
    modalContent: {
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 20,
    },
    iconContainer: {
        marginBottom: 20,
    },
    iconBg: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#1F2937',
        marginBottom: 16,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        lineHeight: 24,
        color: '#4B5563',
        textAlign: 'center',
        marginBottom: 28,
    },
    claimButton: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    claimButtonGradient: {
        paddingVertical: 18,
        alignItems: 'center',
    },
    claimButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
