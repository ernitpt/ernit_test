import React from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { X } from 'lucide-react-native';

interface ImageViewerProps {
    visible: boolean;
    imageUri: string;
    onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ visible, imageUri, onClose }) => {
    const { width, height } = Dimensions.get('window');

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />

                {/* Close button */}
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <View style={styles.closeButtonCircle}>
                        <X size={24} color="#fff" />
                    </View>
                </TouchableOpacity>

                {/* Image */}
                <TouchableOpacity
                    style={styles.imageContainer}
                    activeOpacity={1}
                    onPress={onClose}
                >
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
    },
    closeButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageContainer: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
});

export default ImageViewer;
