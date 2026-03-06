import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { ShoppingBag, Gift } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useApp } from '../context/AppContext';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { commonStyles } from '../styles/commonStyles';

interface EmpowerChoiceModalProps {
    visible: boolean;
    userName: string;
    experienceTitle?: string;
    experiencePrice?: number;
    pledgedExperienceId?: string;
    goalId: string;
    goalUserId: string;
    onClose: () => void;
}

const EmpowerChoiceModal: React.FC<EmpowerChoiceModalProps> = ({
    visible,
    userName,
    experienceTitle,
    experiencePrice,
    pledgedExperienceId,
    goalId,
    goalUserId,
    onClose,
}) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { dispatch } = useApp();

    const setEmpowerContext = () => {
        dispatch({
            type: 'SET_EMPOWER_CONTEXT',
            payload: { goalId, userId: goalUserId, userName },
        });
    };

    const handleDirect = () => {
        if (!pledgedExperienceId) return;
        setEmpowerContext();
        onClose();
        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: pledgedExperienceId, quantity: 1 }],
        });
    };

    const handleBrowse = () => {
        setEmpowerContext();
        onClose();
        navigation.navigate('CategorySelection');
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={commonStyles.modalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={styles.modal}>
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        <Text style={styles.title}>Gift an Experience</Text>
                        <Text style={styles.subtitle}>
                            Celebrate {userName}'s progress
                        </Text>

                        {/* Option 1: Buy pledged experience */}
                        {experienceTitle && pledgedExperienceId && (
                            <TouchableOpacity
                                style={styles.optionPrimary}
                                onPress={handleDirect}
                                activeOpacity={0.8}
                            >
                                <ShoppingBag size={18} color={Colors.white} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.optionPrimaryText} numberOfLines={1}>
                                        Gift "{experienceTitle}"
                                    </Text>
                                    {experiencePrice != null && (
                                        <Text style={styles.optionPrice}>
                                            {'\u20AC'}{experiencePrice}
                                        </Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Option 2: Browse */}
                        <TouchableOpacity
                            style={styles.optionSecondary}
                            onPress={handleBrowse}
                            activeOpacity={0.8}
                        >
                            <Gift size={18} color={Colors.primary} />
                            <Text style={styles.optionSecondaryText}>Choose Another Experience</Text>
                        </TouchableOpacity>

                        {/* Cancel */}
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onClose}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modal: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        width: '90%',
        maxWidth: 360,
        padding: Spacing.sectionGap,
        ...Shadows.lg,
    },
    title: {
        ...Typography.heading3,
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    subtitle: {
        ...Typography.small,
        color: Colors.textSecondary,
        marginBottom: Spacing.xl,
    },
    optionPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.secondary,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.cardPadding,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
    },
    optionPrimaryText: {
        ...Typography.bodyBold,
        color: Colors.white,
    },
    optionPrice: {
        ...Typography.caption,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '600',
        marginTop: Spacing.xxs,
    },
    optionSecondary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.primarySurface,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.cardPadding,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
        marginBottom: Spacing.sm,
    },
    optionSecondaryText: {
        ...Typography.bodyBold,
        color: Colors.primary,
    },
    cancelButton: {
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    cancelText: {
        ...Typography.small,
        color: Colors.textMuted,
    },
});

export default EmpowerChoiceModal;
