 import { StyleSheet, Platform } from 'react-native';

export const commonStyles = StyleSheet.create({
    gradientHeader: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        overflow: 'hidden',
        paddingBottom: 18,
        paddingTop: 28,
    },
    header: {
        paddingHorizontal: 24,
        // paddingTop: 34,
        paddingBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#ffffff',
        // marginBottom: 4,
    },
});