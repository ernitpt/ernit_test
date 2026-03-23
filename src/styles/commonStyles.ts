import { StyleSheet } from 'react-native';
import { Colors } from '../config/colors';

export const createCommonStyles = (colors: typeof Colors) => StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
