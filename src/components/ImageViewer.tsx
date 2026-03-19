import React, { useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    BackHandler,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';

interface ImageViewerProps {
    visible: boolean;
    imageUri: string;
    imageUris?: string[];
    initialIndex?: number;
    onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
    visible,
    imageUri,
    imageUris,
    initialIndex = 0,
    onClose,
}) => {
    const { width, height } = Dimensions.get('window');
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList<string>>(null);
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

    const images =
        imageUris && imageUris.length > 0 ? imageUris : [imageUri];

    // Reset index when the viewer becomes visible
    useEffect(() => {
        if (!visible) return;
        const idx = initialIndex || 0;
        setCurrentIndex(idx);
        if (Platform.OS !== 'web' && idx > 0) {
            const timer = setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: idx, animated: false });
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [visible, initialIndex]);

    // Hardware back button handler (Android)
    useEffect(() => {
        if (!visible) return;
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => handler.remove();
    }, [visible, onClose]);

    const handleMomentumScrollEnd = (
        e: NativeSyntheticEvent<NativeScrollEvent>,
    ) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / width);
        setCurrentIndex(index);
    };

    const getItemLayout = (_: ArrayLike<string> | null | undefined, index: number) => ({
        length: width,
        offset: width * index,
        index,
    });

    const renderItem = ({ item, index }: { item: string; index: number }) => (
        <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
            {imageErrors.has(index) ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.backgroundLight }}>
                    <Text style={{ color: Colors.textMuted }}>Image failed to load</Text>
                </View>
            ) : (
                <Image
                    source={{ uri: item }}
                    style={{ width, height }}
                    resizeMode="contain"
                    onError={() => setImageErrors(prev => new Set(prev).add(index))}
                />
            )}
        </View>
    );

    const goToImage = (direction: 'prev' | 'next') => {
        const newIndex = direction === 'prev'
            ? Math.max(0, currentIndex - 1)
            : Math.min(images.length - 1, currentIndex + 1);
        setCurrentIndex(newIndex);
    };

    // Web: simple image display with arrow navigation
    const renderWebContent = () => (
        <View style={styles.webImageContainer}>
            {imageErrors.has(currentIndex) ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.backgroundLight }}>
                    <Text style={{ color: Colors.textMuted }}>Image failed to load</Text>
                </View>
            ) : (
                <Image
                    source={{ uri: images[currentIndex] }}
                    style={styles.webImage}
                    resizeMode="contain"
                    onError={() => setImageErrors(prev => new Set(prev).add(currentIndex))}
                />
            )}

            {/* Arrow navigation for multiple images */}
            {images.length > 1 && currentIndex > 0 && (
                <TouchableOpacity
                    style={[styles.arrowButton, styles.arrowLeft]}
                    onPress={() => goToImage('prev')}
                    accessibilityLabel="Previous image"
                    accessibilityRole="button"
                >
                    <ChevronLeft size={28} color={Colors.white} />
                </TouchableOpacity>
            )}
            {images.length > 1 && currentIndex < images.length - 1 && (
                <TouchableOpacity
                    style={[styles.arrowButton, styles.arrowRight]}
                    onPress={() => goToImage('next')}
                    accessibilityLabel="Next image"
                    accessibilityRole="button"
                >
                    <ChevronRight size={28} color={Colors.white} />
                </TouchableOpacity>
            )}
        </View>
    );

    // Native: horizontal FlatList with paging
    const renderNativeContent = () => (
        <FlatList
            ref={flatListRef}
            data={images}
            keyExtractor={(_, index) => String(index)}
            renderItem={renderItem}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={width}
            decelerationRate="fast"
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            initialScrollIndex={initialIndex || 0}
        />
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.container} accessibilityViewIsModal={true}>
                <StatusBar style="light" />

                {/* Close button */}
                <TouchableOpacity
                    style={[styles.closeButton, { top: insets.top + 8 }]}
                    onPress={onClose}
                    accessibilityLabel="Close image viewer"
                    accessibilityRole="button"
                >
                    <View style={styles.closeButtonCircle}>
                        <X size={24} color={Colors.white} />
                    </View>
                </TouchableOpacity>

                {/* Image content */}
                {Platform.OS === 'web' ? renderWebContent() : renderNativeContent()}

                {/* Dot indicators — only when there are multiple images */}
                {images.length > 1 && (
                    <View style={styles.dotsContainer}>
                        {images.map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    i === currentIndex
                                        ? styles.dotActive
                                        : styles.dotInactive,
                                ]}
                            />
                        ))}
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.overlayDark,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 50, // overridden at runtime with insets.top + 8
        right: 20,
        zIndex: 10,
    },
    closeButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.circle,
        backgroundColor: Colors.whiteAlpha25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    webImageContainer: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    webImage: {
        width: '100%',
        height: '100%',
    },
    arrowButton: {
        position: 'absolute',
        top: '50%',
        marginTop: -24,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
    arrowLeft: {
        left: 16,
    },
    arrowRight: {
        right: 16,
    },
    dotsContainer: {
        position: 'absolute',
        bottom: 40,
        flexDirection: 'row',
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginHorizontal: 4,
    },
    dotActive: {
        backgroundColor: Colors.white,
    },
    dotInactive: {
        backgroundColor: Colors.whiteAlpha40,
    },
});

export default ImageViewer;
