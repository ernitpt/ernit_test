import { StyleSheet } from 'react-native';
import Colors from '../config/colors';

export const commonStyles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: Colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
