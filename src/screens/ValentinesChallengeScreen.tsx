import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
    Platform,
    TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Sparkles, Heart, Check, Flame } from 'lucide-react-native';

import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Experience } from '../types';
import { Image, ActivityIndicator, Animated } from 'react-native';

const { width } = Dimensions.get('window');

// Fallback data in case of empty fetch or error
const FALLBACK_EXPERIENCES = [
    { id: '1', title: 'Romantic Dinner', coverImageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80', price: 70, category: 'food-culture' },
    { id: '2', title: 'Couples Spa', coverImageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80', price: 100, category: 'relaxation' },
];

const GOAL_TYPES = [
    { icon: '🏋️', name: 'Gym', color: '#8B5CF6' },
    { icon: '🧘', name: 'Yoga', color: '#EC4899' },
    { icon: '🏃‍♀️', name: 'Run', color: '#3B82F6' },
];

// Beautiful Slider Component
const ModernSlider = ({
    label,
    value,
    min,
    max,
    onChange,
    leftLabel,
    rightLabel,
    unit,
    unitPlural,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (val: number) => void;
    leftLabel: string;
    rightLabel: string;
    unit?: string;
    unitPlural?: string;
}) => {
    const handlePress = (event: any) => {
        const { locationX } = event.nativeEvent;
        const trackWidth = width - 96; // Container width minus padding
        const percentage = Math.max(0, Math.min(1, locationX / trackWidth));
        const newValue = Math.round(min + percentage * (max - min));
        onChange(newValue);
    };

    const progress = ((value - min) / (max - min)) * 100;

    // Determine which unit to display
    const displayUnit = unit && unitPlural ? (value === 1 ? unit : unitPlural) : '';

    return (
        <View style={styles.sliderContainer}>
            <Text style={styles.sliderTitle}>{label}</Text>
            <View style={styles.sliderValueRow}>
                <Text style={styles.sliderValue}>{value}</Text>
                {displayUnit && <Text style={styles.sliderUnit}>{displayUnit}</Text>}
            </View>

            <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabelText}>{leftLabel}</Text>
                <Text style={styles.sliderLabelText}>{rightLabel}</Text>
            </View>

            <View
                style={styles.sliderTrack}
                onStartShouldSetResponder={() => true}
                onResponderGrant={handlePress}
                onResponderMove={handlePress}
            >
                <View style={[styles.sliderProgress, { width: `${progress}%` }]} />
                <View style={[styles.sliderThumb, { left: `${progress}%` }]}>
                    <View style={styles.sliderThumbInner} />
                </View>
            </View>
        </View>
    );
};

export default function ValentinesChallengeScreen() {
    const navigation = useNavigation();

    const [experiences, setExperiences] = useState<any[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedGoal, setSelectedGoal] = useState(GOAL_TYPES[0].name);
    const [customGoal, setCustomGoal] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    // New state for multi-step flow
    const [step, setStep] = useState(1);
    const [selectedMode, setSelectedMode] = useState<'revealed' | 'secret' | null>(null);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (step === 2) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [step]);

    // Fetch experiences
    React.useEffect(() => {
        const fetchExperiences = async () => {
            try {
                // Fetch more items to ensure we get all categories
                const q = query(collection(db, 'experiences'), limit(100));
                const snapshot = await getDocs(q);
                const fetched: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (fetched.length > 0) {
                    // Log unique categories for debugging
                    const categories = [...new Set(fetched.map(e => e.category))];
                    console.log('Available categories:', categories);
                    console.log('Sample experience:', fetched[0]);

                    setExperiences(fetched);
                    setSelectedExperience(fetched[0]);
                } else {
                    setExperiences(FALLBACK_EXPERIENCES);
                    setSelectedExperience(FALLBACK_EXPERIENCES[0]);
                }
            } catch (error) {
                console.error("Error fetching experiences:", error);
                setExperiences(FALLBACK_EXPERIENCES);
                setSelectedExperience(FALLBACK_EXPERIENCES[0]);
            } finally {
                setLoading(false);
            }
        };

        fetchExperiences();
    }, []);
    const [weeks, setWeeks] = useState(3);
    const [sessionsPerWeek, setSessionsPerWeek] = useState(3);

    const totalSessions = useMemo(() => weeks * sessionsPerWeek, [weeks, sessionsPerWeek]);

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="#1F2937" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Challenge</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Sticky Hero Card */}
            <View style={styles.stickyHeroContainer}>
                {loading || !selectedExperience ? (
                    <ActivityIndicator color="#7C3AED" />
                ) : (
                    <View style={styles.heroCard}>
                        <View style={styles.heroMainRow}>
                            <View style={styles.heroIconBox}>
                                <Image
                                    source={{ uri: selectedExperience.coverImageUrl }}
                                    style={styles.heroImage}
                                    resizeMode="cover"
                                />
                            </View>
                            <View style={styles.heroInfo}>
                                <Text style={styles.heroTitle}>{selectedExperience.title}</Text>
                                <View style={styles.heroPriceRow}>
                                    <Text style={styles.heroPrice}>
                                        {selectedExperience ? `€${selectedExperience.price * 2}` : ''}
                                    </Text>
                                    <Text style={styles.heroPriceLabel}>for two</Text>
                                </View>
                            </View>
                        </View>

                        {/* Summary Badges */}
                        <View style={styles.heroContextRow}>
                            <View style={styles.contextBadge}>
                                <Text style={styles.contextEmoji}>{selectedGoal === 'Yoga' ? '🧘' : selectedGoal === 'Gym' ? '🏋️' : selectedGoal === 'Run' ? '🏃‍♀️' : '🎯'}</Text>
                                <Text style={styles.contextText}>{selectedGoal}</Text>
                            </View>
                            <View style={styles.contextDivider} />
                            <View style={styles.contextBadge}>
                                <Text style={styles.contextLabel}>{weeks} weeks</Text>
                            </View>
                            <View style={styles.contextDivider} />
                            <View style={styles.contextBadge}>
                                <Text style={styles.contextLabel}>{sessionsPerWeek} sessions/wk</Text>
                            </View>
                        </View>
                    </View>
                )}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {step === 1 ? (
                    <>
                        {/* Experience Selection */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeaderRow}>
                                <Text style={styles.sectionTitle}>Choose Experience</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                                    {['All', 'Adventure', 'Wellness', 'Creative'].map((cat) => (
                                        <TouchableOpacity
                                            key={cat}
                                            onPress={() => setSelectedCategory(cat)}
                                            style={[
                                                styles.filterChip,
                                                selectedCategory === cat && styles.filterChipActive
                                            ]}
                                        >
                                            <Text style={[
                                                styles.filterText,
                                                selectedCategory === cat && styles.filterTextActive
                                            ]}>{cat}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                            {loading ? (
                                <ActivityIndicator size="small" color="#7C3AED" />
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                                    {experiences
                                        .filter(exp => {
                                            if (selectedCategory === 'All') return true;
                                            if (!exp.category) return false;

                                            const expCat = exp.category.toLowerCase().trim();
                                            const filterCat = selectedCategory.toLowerCase().trim();

                                            // Custom mappings for our common categories
                                            if (filterCat === 'wellness' && (expCat === 'relaxation' || expCat === 'spa' || expCat === 'health' || expCat === 'wellness')) return true;
                                            if (filterCat === 'creative' && (expCat === 'culture' || expCat === 'arts' || expCat === 'creative' || expCat === 'workshop')) return true;

                                            // General fallback
                                            return expCat.includes(filterCat) || filterCat.includes(expCat);
                                        })
                                        .map((exp) => (
                                            <TouchableOpacity
                                                key={exp.id}
                                                style={[
                                                    styles.expCard,
                                                    selectedExperience?.id === exp.id && styles.expCardActive
                                                ]}
                                                onPress={() => setSelectedExperience(exp)}
                                            >
                                                <View style={styles.expIconBox}>
                                                    <Image
                                                        source={{ uri: exp.coverImageUrl }}
                                                        style={styles.expImage}
                                                        resizeMode="cover"
                                                    />
                                                </View>
                                                <Text style={[
                                                    styles.expTitle,
                                                    selectedExperience?.id === exp.id && styles.expTitleActive
                                                ]} numberOfLines={2}>
                                                    {exp.title}
                                                </Text>
                                                {selectedExperience?.id === exp.id && (
                                                    <View style={styles.checkBadge}>
                                                        <Check color="#fff" size={12} strokeWidth={3} />
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                </ScrollView>
                            )}
                        </View>

                        {/* Goal Type */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Your Goal Type</Text>
                            <View style={styles.goalGrid}>
                                {GOAL_TYPES.map((goal) => (
                                    <TouchableOpacity
                                        key={goal.name}
                                        style={[
                                            styles.goalChip,
                                            selectedGoal === goal.name && { backgroundColor: goal.color }
                                        ]}
                                        onPress={() => {
                                            setSelectedGoal(goal.name);
                                            setCustomGoal(''); // Clear custom goal when selecting preset
                                        }}
                                    >
                                        <Text style={styles.goalIcon}>{goal.icon}</Text>
                                        <Text style={[
                                            styles.goalName,
                                            selectedGoal === goal.name && styles.goalNameActive
                                        ]}>{goal.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Custom Goal Input */}
                            <View style={styles.customGoalContainer}>
                                <Text style={styles.customGoalLabel}>Or enter your custom goal:</Text>
                                <View style={styles.customGoalInputWrapper}>
                                    <Text style={styles.customGoalIcon}>✨</Text>
                                    <TextInput
                                        style={styles.customGoalInput}
                                        placeholder="e.g., Cook, Paint, Write..."
                                        placeholderTextColor="#9ca3af"
                                        value={customGoal}
                                        onChangeText={(text) => {
                                            setCustomGoal(text);
                                            if (text.trim()) {
                                                setSelectedGoal(''); // Clear preset selection when typing custom
                                            }
                                        }}
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Challenge Intensity */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Challenge Intensity</Text>

                            <ModernSlider
                                label="Duration"
                                value={weeks}
                                min={1}
                                max={5}
                                onChange={setWeeks}
                                leftLabel="Chill"
                                rightLabel="Intense"
                                unit="week"
                                unitPlural="weeks"
                            />

                            <ModernSlider
                                label="Weekly Sessions"
                                value={sessionsPerWeek}
                                min={1}
                                max={7}
                                onChange={setSessionsPerWeek}
                                leftLabel="Easy"
                                rightLabel="Beast"
                            />
                        </View>
                    </>
                ) : (
                    /* Step 2: Mode Selection */
                    <View style={styles.section}>
                        <Text style={styles.questionTitle}>How will be your loved one's experience?</Text>

                        {/* Secret Mode */}
                        <TouchableOpacity
                            style={[
                                styles.modeCard,
                                selectedMode === 'secret' && styles.modeCardActive
                            ]}
                            onPress={() => setSelectedMode('secret')}
                        >
                            <View style={styles.popularBadge}>
                                <Flame color="#fff" size={12} fill="#fff" />
                                <Text style={styles.popularText}>MOST POPULAR</Text>
                            </View>

                            <View style={[styles.modeIconBox, styles.secretBox]}>
                                <Sparkles color="#F59E0B" size={24} />
                            </View>
                            <View style={styles.modeContent}>
                                <Text style={styles.modeTitle}>Secret Mode</Text>
                                <Text style={styles.modeDesc}>
                                    The experience is hidden! AI-generated hints will keep them guessing throughout the challenge.
                                </Text>
                            </View>
                            <View style={[
                                styles.radioCircle,
                                selectedMode === 'secret' && styles.radioCircleActive
                            ]}>
                                {selectedMode === 'secret' && <View style={styles.radioDot} />}
                            </View>
                        </TouchableOpacity>

                        {/* Revealed Mode */}
                        <TouchableOpacity
                            style={[
                                styles.modeCard,
                                selectedMode === 'revealed' && styles.modeCardActive
                            ]}
                            onPress={() => setSelectedMode('revealed')}
                        >
                            <View style={styles.modeIconBox}>
                                <Image
                                    source={{ uri: selectedExperience?.coverImageUrl }}
                                    style={styles.modeImage}
                                />
                            </View>
                            <View style={styles.modeContent}>
                                <Text style={styles.modeTitle}>Revealed Mode</Text>
                                <Text style={styles.modeDesc}>Your partner will instantly know what the experience is</Text>
                            </View>
                            <View style={[
                                styles.radioCircle,
                                selectedMode === 'revealed' && styles.radioCircleActive
                            ]}>
                                {selectedMode === 'revealed' && <View style={styles.radioDot} />}
                            </View>
                        </TouchableOpacity>
                    </View>
                )
                }

                {/* Summary */}


                <View style={{ height: 100 }} />
            </ScrollView >

            {/* Fixed Footer */}
            < View style={styles.footer} >
                <TouchableOpacity
                    style={[styles.ctaButton, step === 2 && !selectedMode && styles.ctaButtonDisabled]}
                    onPress={() => {
                        if (step === 1) {
                            setStep(2);
                        } else {
                            // Handle completion
                            console.log('Finished with mode:', selectedMode);
                        }
                    }}
                    disabled={step === 2 && !selectedMode}
                >
                    <Text style={styles.ctaText}>
                        {step === 1 ? 'Continue' : 'Start Challenge'}
                    </Text>
                </TouchableOpacity>
            </View >
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingTop: 16,
    },
    stickyHeroContainer: {
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    heroCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    heroMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    heroInfo: {
        flex: 1,
        marginLeft: 16,
    },
    heroIconBox: {
        width: 56,
        height: 56,
        borderRadius: 14,
        backgroundColor: '#F3F4F6',
        overflow: 'hidden',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 4,
    },
    heroPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    heroPrice: {
        fontSize: 28,
        fontWeight: '900',
        color: '#FF6B9D',
    },
    heroPriceLabel: {
        fontSize: 13,
        color: '#9CA3AF',
        fontWeight: '600',
    },
    heroContextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 10,
        justifyContent: 'space-between',
    },
    contextBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    contextDivider: {
        width: 1,
        height: 16,
        backgroundColor: '#E5E7EB',
    },
    contextEmoji: {
        fontSize: 14,
    },
    contextText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4B5563',
    },
    contextLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1F2937',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    filterScroll: {
        flexGrow: 0,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        marginLeft: 8,
    },
    filterChipActive: {
        backgroundColor: '#1F2937',
    },
    filterText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280',
    },
    filterTextActive: {
        color: '#fff',
    },
    cardScroll: {
        marginLeft: -4,
    },
    expCard: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        padding: 16,
        marginRight: 12,
        width: 110,
        alignItems: 'center',
        position: 'relative',
    },
    expCardActive: {
        borderColor: '#FF6B9D',
        backgroundColor: '#FFF0F5',
    },
    expIconBox: {
        width: 64,
        height: 64,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        overflow: 'hidden',
        marginBottom: 8,
    },
    expImage: {
        width: '100%',
        height: '100%',
    },
    expTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#6B7280',
        textAlign: 'center',
    },
    expTitleActive: {
        color: '#FF6B9D',
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#FF6B9D',
        justifyContent: 'center',
        alignItems: 'center',
    },
    goalGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    goalChip: {
        width: '31%', // Force 3 columns (approx 100% / 3 minus gap)
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#E5E7EB',
    },
    goalIcon: {
        fontSize: 20,
    },
    goalName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#6B7280',
    },
    goalNameActive: {
        color: '#fff',
    },
    customGoalContainer: {
        marginTop: 20,
    },
    customGoalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 10,
    },
    customGoalInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    customGoalIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    customGoalInput: {
        flex: 1,
        fontSize: 15,
        color: '#1F2937',
        paddingVertical: 10,
    },
    sliderContainer: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    sliderTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sliderValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 20,
        gap: 8,
    },
    sliderValue: {
        fontSize: 32,
        fontWeight: '900',
        color: '#1F2937',
    },
    sliderUnit: {
        fontSize: 18,
        fontWeight: '600',
        color: '#6B7280',
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sliderLabelText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9CA3AF',
    },
    sliderTrack: {
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        position: 'relative',
        width: '100%',
    },
    sliderProgress: {
        height: '100%',
        backgroundColor: '#FF6B9D',
        borderRadius: 4,
    },
    sliderThumb: {
        position: 'absolute',
        top: -8,
        marginLeft: -12,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    sliderThumbInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FF6B9D',
    },
    summaryCard: {
        backgroundColor: '#F5F3FF',
        borderRadius: 20,
        padding: 24,
        borderLeftWidth: 4,
        borderLeftColor: '#8B5CF6',
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1F2937',
    },
    summaryText: {
        fontSize: 15,
        lineHeight: 24,
        color: '#4B5563',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    ctaButton: {
        backgroundColor: '#1F2937',
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 6,
    },
    ctaText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
    ctaButtonDisabled: {
        opacity: 0.5,
    },
    questionTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 24,
        marginTop: 8,
    },
    modeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#F3F4F6',
        marginBottom: 16,
    },
    modeCardActive: {
        borderColor: '#8B5CF6',
        backgroundColor: '#F5F3FF',
    },
    modeIconBox: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    modeImage: {
        width: '100%',
        height: '100%',
    },
    secretBox: {
        backgroundColor: '#FFFBEB',
    },
    modeContent: {
        flex: 1,
        marginLeft: 16,
        marginRight: 12,
    },
    modeTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 4,
    },
    secretTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    modeDesc: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
    },
    radioCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioCircleActive: {
        borderColor: '#8B5CF6',
        backgroundColor: '#fff',
    },
    radioDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#8B5CF6',
    },
    popularBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: '#F59E0B',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderBottomLeftRadius: 8,
        borderTopRightRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        zIndex: 10,
    },
    popularText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
});
