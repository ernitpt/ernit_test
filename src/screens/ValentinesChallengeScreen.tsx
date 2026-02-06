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
    Alert,
    Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Sparkles, Heart, Check, Flame, Mail, CheckCircle, X } from 'lucide-react-native';
import { RootStackParamList } from '../types';

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
    { icon: '✨', name: 'Other', color: '#10B981' },
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ValentinesChallenge'>;

export default function ValentinesChallengeScreen() {
    const navigation = useNavigation<NavigationProp>();

    const [experiences, setExperiences] = useState<any[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
    const [customGoal, setCustomGoal] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    // New state for multi-step flow
    const [step, setStep] = useState(1);
    const [selectedMode, setSelectedMode] = useState<'revealed' | 'secret' | null>(null);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    // Email state
    const [purchaserEmail, setPurchaserEmail] = useState('');
    const [partnerEmail, setPartnerEmail] = useState('');
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // Surprise Me state
    const [isSurpriseMode, setIsSurpriseMode] = useState(false);
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 200]);
    const [showPriceSlider, setShowPriceSlider] = useState(false);

    // Experience details modal
    const [showDetailsModal, setShowDetailsModal] = useState(false);

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
                    // Don't auto-select first experience - let user choose
                } else {
                    setExperiences(FALLBACK_EXPERIENCES);
                    // Don't auto-select first experience - let user choose
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

    // Email validation helper
    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    };

    const isEmailValid = (email: string): boolean => {
        return email.trim().length > 0 && validateEmail(email);
    };

    // Get filtered experiences based on category and price range
    const getFilteredExperiences = () => {
        return experiences.filter(exp => {
            // Category filter
            if (selectedCategory !== 'All' && exp.category) {
                const expCat = exp.category.toLowerCase().trim();
                const filterCat = selectedCategory.toLowerCase().trim();

                const categoryMatch =
                    (filterCat === 'wellness' && (expCat === 'relaxation' || expCat === 'spa' || expCat === 'health' || expCat === 'wellness')) ||
                    (filterCat === 'creative' && (expCat === 'culture' || expCat === 'arts' || expCat === 'creative' || expCat === 'workshop')) ||
                    expCat.includes(filterCat) ||
                    filterCat.includes(expCat);

                if (!categoryMatch) return false;
            }

            // Price filter (only when surprise mode is active)
            if (isSurpriseMode) {
                const price = exp.price || 0;
                if (price < priceRange[0] || price > priceRange[1]) {
                    return false;
                }
            }

            return true;
        });
    };

    // Pick a random experience from filtered list
    const pickRandomExperience = () => {
        const filtered = getFilteredExperiences();
        if (filtered.length === 0) {
            Alert.alert('No Experiences', 'No experiences match your criteria. Try adjusting the price range or category.');
            return null;
        }
        const randomIndex = Math.floor(Math.random() * filtered.length);
        return filtered[randomIndex];
    };

    // Handle surprise me selection
    const handleSurpriseMeClick = () => {
        setIsSurpriseMode(true);
        setShowPriceSlider(true);
        setSelectedMode('secret'); // Force secret mode

        // Pick initial random experience
        const randomExp = pickRandomExperience();
        if (randomExp) {
            setSelectedExperience({
                ...randomExp,
                title: '🎁 Surprise Experience',
                isSurprise: true,
                actualExperience: randomExp
            });
        }
    };

    // Handle reroll
    const handleReroll = () => {
        const randomExp = pickRandomExperience();
        if (randomExp) {
            setSelectedExperience({
                ...randomExp,
                title: '🎁 Surprise Experience',
                isSurprise: true,
                actualExperience: randomExp
            });
        }
    };

    // Auto-reroll when category changes in surprise mode
    React.useEffect(() => {
        if (isSurpriseMode) {
            handleReroll();
        }
    }, [selectedCategory]);

    // Auto-reroll when price range changes in surprise mode
    React.useEffect(() => {
        if (isSurpriseMode) {
            handleReroll();
        }
    }, [priceRange[0], priceRange[1]]);

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
                {loading ? (
                    <ActivityIndicator color="#7C3AED" />
                ) : !selectedExperience ? (
                    <View style={styles.heroCard}>
                        <View style={styles.heroMainRow}>
                            <View style={styles.heroIconBox}>
                                <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                                    <Text style={{ fontSize: 24 }}>🎁</Text>
                                </View>
                            </View>
                            <View style={styles.heroInfo}>
                                <Text style={styles.heroTitle}>Select an experience</Text>
                                <Text style={styles.heroPriceLabel}>Choose below to get started</Text>
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={styles.heroCard}>
                        <View style={styles.heroMainRow}>
                            <View style={styles.heroIconBox}>
                                {isSurpriseMode ? (
                                    <View style={[styles.randomIconBox, { width: '100%', height: '100%' }]}>
                                        <Sparkles color="#F59E0B" size={28} />
                                    </View>
                                ) : (
                                    <Image
                                        source={{ uri: selectedExperience.coverImageUrl }}
                                        style={styles.heroImage}
                                        resizeMode="cover"
                                    />
                                )}
                            </View>
                            <View style={styles.heroInfo}>
                                <Text style={styles.heroTitle}>
                                    {isSurpriseMode ? '🎁 Surprise Experience' : selectedExperience.title}
                                </Text>
                                <View style={styles.heroPriceRow}>
                                    <Text style={styles.heroPrice}>
                                        €{isSurpriseMode && selectedExperience.actualExperience
                                            ? selectedExperience.actualExperience.price * 2
                                            : selectedExperience.price * 2}
                                    </Text>
                                    <Text style={styles.heroPriceLabel}>for two</Text>
                                </View>
                            </View>
                        </View>

                        {/* Summary Badges */}
                        <View style={styles.heroContextRow}>
                            <View style={styles.contextBadge}>
                                <Text style={styles.contextEmoji}>
                                    {selectedGoal === 'Other' ? '✨' :
                                        selectedGoal === 'Yoga' ? '🧘' :
                                            selectedGoal === 'Gym' ? '🏋️' :
                                                selectedGoal === 'Run' ? '🏃‍♀️' : '🎯'}
                                </Text>
                                <Text style={styles.contextText}>
                                    {selectedGoal === 'Other' ? (customGoal.trim() || 'Custom') : (selectedGoal || 'Select goal')}
                                </Text>
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

                        {/* View Details Button - Only for non-surprise experiences */}
                        {!isSurpriseMode && (
                            <TouchableOpacity
                                style={styles.viewDetailsButton}
                                onPress={() => setShowDetailsModal(true)}
                            >
                                <Text style={styles.viewDetailsText}>View Experience Details</Text>
                            </TouchableOpacity>
                        )}
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
                                    {/* Random Option - Always shown first */}
                                    <TouchableOpacity
                                        style={[
                                            styles.expCard,
                                            isSurpriseMode && styles.expCardActive
                                        ]}
                                        onPress={handleSurpriseMeClick}
                                    >
                                        <View style={[styles.expIconBox, styles.randomIconBox]}>
                                            <Sparkles color="#F59E0B" size={32} />
                                        </View>
                                        <Text style={[
                                            styles.expTitle,
                                            isSurpriseMode && styles.expTitleActive
                                        ]} numberOfLines={2}>
                                            Surprise Me!
                                        </Text>
                                        {isSurpriseMode && (
                                            <View style={styles.checkBadge}>
                                                <Check color="#fff" size={12} strokeWidth={3} />
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    {/* Regular experiences */}
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
                                        .map((exp) => {
                                            // Don't show as selected if in surprise mode (to avoid spoiling the surprise)
                                            const isSelected = !isSurpriseMode && selectedExperience?.id === exp.id;

                                            return (
                                                <TouchableOpacity
                                                    key={exp.id}
                                                    style={[
                                                        styles.expCard,
                                                        isSelected && styles.expCardActive
                                                    ]}
                                                    onPress={() => {
                                                        setSelectedExperience(exp);
                                                        setIsSurpriseMode(false);
                                                        setShowPriceSlider(false);
                                                        setSelectedMode(null); // Reset mode selection
                                                    }}
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
                                                        isSelected && styles.expTitleActive
                                                    ]} numberOfLines={2}>
                                                        {exp.title}
                                                    </Text>
                                                    {isSelected && (
                                                        <View style={styles.checkBadge}>
                                                            <Check color="#fff" size={12} strokeWidth={3} />
                                                        </View>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                </ScrollView>
                            )}

                            {/* Price Slider Popover - Shown when Surprise Me is active */}
                            {showPriceSlider && isSurpriseMode && (
                                <View style={styles.priceSliderPopover}>
                                    {/* Popover Arrow */}
                                    <View style={styles.popoverArrow} />

                                    <View style={styles.popoverContent}>
                                        <View style={styles.popoverHeader}>
                                            <Text style={styles.popoverTitle}>Set Price Range</Text>
                                            <TouchableOpacity
                                                style={styles.closePopoverButton}
                                                onPress={() => setShowPriceSlider(false)}
                                            >
                                                <X color="#6B7280" size={16} />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.priceLabelsRow}>
                                            <Text style={styles.priceLabel}>€{priceRange[0]}</Text>
                                            <TouchableOpacity style={styles.rerollButtonCompact} onPress={handleReroll}>
                                                <Sparkles color="#F59E0B" size={14} />
                                            </TouchableOpacity>
                                            <Text style={styles.priceLabel}>€{priceRange[1]}</Text>
                                        </View>

                                        {/* Single Range Slider with two thumbs */}
                                        <View style={styles.rangeSliderContainer}>
                                            {(() => {
                                                const minPercent = (priceRange[0] / 200) * 100;
                                                const maxPercent = (priceRange[1] / 200) * 100;
                                                const rangeWidth = maxPercent - minPercent;

                                                return (
                                                    <View
                                                        style={styles.rangeSliderTrack}
                                                        onStartShouldSetResponder={() => true}
                                                        onResponderGrant={(event) => {
                                                            const { locationX } = event.nativeEvent;
                                                            const trackWidth = width - 80;
                                                            const percentage = Math.max(0, Math.min(1, locationX / trackWidth));
                                                            const clickedValue = Math.round(percentage * 200);

                                                            // Determine which thumb to move based on proximity
                                                            const distToMin = Math.abs(clickedValue - priceRange[0]);
                                                            const distToMax = Math.abs(clickedValue - priceRange[1]);

                                                            if (distToMin < distToMax && clickedValue < priceRange[1]) {
                                                                setPriceRange([clickedValue, priceRange[1]]);
                                                            } else if (clickedValue > priceRange[0]) {
                                                                setPriceRange([priceRange[0], clickedValue]);
                                                            }
                                                        }}
                                                        onResponderMove={(event) => {
                                                            const { locationX } = event.nativeEvent;
                                                            const trackWidth = width - 80;
                                                            const percentage = Math.max(0, Math.min(1, locationX / trackWidth));
                                                            const clickedValue = Math.round(percentage * 200);

                                                            const distToMin = Math.abs(clickedValue - priceRange[0]);
                                                            const distToMax = Math.abs(clickedValue - priceRange[1]);

                                                            if (distToMin < distToMax && clickedValue < priceRange[1]) {
                                                                setPriceRange([clickedValue, priceRange[1]]);
                                                            } else if (clickedValue > priceRange[0]) {
                                                                setPriceRange([priceRange[0], clickedValue]);
                                                            }
                                                        }}
                                                    >
                                                        {/* Background track */}
                                                        <View style={styles.rangeTrackBackground} />

                                                        {/* Active range highlight */}
                                                        <View
                                                            style={[
                                                                styles.rangeTrackActive,
                                                                {
                                                                    left: `${minPercent}%` as any,
                                                                    width: `${rangeWidth}%` as any,
                                                                },
                                                            ]}
                                                        />

                                                        {/* Min thumb */}
                                                        <View style={[styles.rangeThumb, { left: `${minPercent}%` as any }]}>
                                                            <View style={styles.rangeThumbInner} />
                                                        </View>

                                                        {/* Max thumb */}
                                                        <View style={[styles.rangeThumb, { left: `${maxPercent}%` as any }]}>
                                                            <View style={styles.rangeThumbInner} />
                                                        </View>
                                                    </View>
                                                );
                                            })()}
                                        </View>

                                        <Text style={styles.popoverHint}>
                                            ⚠️ This is a mystery experience. It cannot be changed at any point
                                        </Text>
                                    </View>
                                </View>
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
                                            if (goal.name !== 'Other') {
                                                setCustomGoal(''); // Clear custom goal when selecting preset
                                            }
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

                            {/* Custom Goal Input - Only show when "Other" is selected */}
                            {selectedGoal === 'Other' && (
                                <View style={styles.customGoalContainer}>
                                    <Text style={styles.customGoalLabel}>Enter your custom goal:</Text>
                                    <View style={styles.customGoalInputWrapper}>
                                        <Text style={styles.customGoalIcon}>✨</Text>
                                        <TextInput
                                            style={styles.customGoalInput}
                                            placeholder="e.g., Cook, Paint, Write..."
                                            placeholderTextColor="#9ca3af"
                                            value={customGoal}
                                            onChangeText={setCustomGoal}
                                            autoFocus
                                        />
                                    </View>
                                </View>
                            )}
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
                        {/* Email Collection Section */}
                        <View style={styles.emailSection}>
                            <Text style={styles.sectionTitle}>
                                <Mail size={20} color="#FF6B9D" /> Who's taking the challenge?
                            </Text>

                            <View style={styles.emailInputContainer}>
                                <TextInput
                                    style={[
                                        styles.emailInput,
                                        purchaserEmail && !isEmailValid(purchaserEmail) && styles.emailInputError
                                    ]}
                                    placeholder="Your email"
                                    placeholderTextColor="#999"
                                    value={purchaserEmail}
                                    onChangeText={setPurchaserEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                {purchaserEmail && isEmailValid(purchaserEmail) && (
                                    <CheckCircle
                                        size={20}
                                        color="#10B981"
                                        style={styles.emailCheckIcon}
                                    />
                                )}
                            </View>

                            <View style={styles.emailInputContainer}>
                                <TextInput
                                    style={[
                                        styles.emailInput,
                                        partnerEmail && !isEmailValid(partnerEmail) && styles.emailInputError
                                    ]}
                                    placeholder="Your partner's email"
                                    placeholderTextColor="#999"
                                    value={partnerEmail}
                                    onChangeText={setPartnerEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                {partnerEmail && isEmailValid(partnerEmail) && (
                                    <CheckCircle
                                        size={20}
                                        color="#10B981"
                                        style={styles.emailCheckIcon}
                                    />
                                )}
                            </View>

                            <Text style={styles.emailHint}>
                                💌 You'll both receive redemption codes via email
                            </Text>
                        </View>

                        {isSurpriseMode ? (
                            <>
                                <Text style={styles.sectionTitle}>Surprise Mode - Hidden Only</Text>
                                <View style={styles.surpriseModeCard}>
                                    <View style={[styles.modeIconBox, styles.secretBox]}>
                                        <Sparkles color="#F59E0B" size={24} />
                                    </View>
                                    <View style={styles.modeContent}>
                                        <Text style={styles.modeTitle}>🎁 Secret Mode (Required)</Text>
                                        <Text style={styles.modeDesc}>
                                            Since you chose "Surprise Me", the experience will remain hidden throughout the challenge. Our hints will keep you guessing!
                                        </Text>
                                    </View>
                                    <View style={[styles.radioCircle, styles.radioCircleActive]}>
                                        <View style={styles.radioDot} />
                                    </View>
                                </View>
                                <View style={styles.surpriseWarning}>
                                    <Text style={styles.surpriseWarningText}>
                                        ⚠️ Revealed mode is not available when using "Surprise Me". The mystery is part of the fun!
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={styles.sectionTitle}>Choose Your Mode</Text>

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
                                            The experience is hidden! Our hints will keep them guessing throughout the challenge to keep them motivated.
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
                            </>
                        )}
                    </View>
                )
                }

                {/* Summary */}


                <View style={{ height: 100 }} />
            </ScrollView >

            {/* Fixed Footer */}
            <View style={styles.footer} >
                <TouchableOpacity
                    style={[styles.ctaButton, step === 2 && !selectedMode && !isSurpriseMode && styles.ctaButtonDisabled]}
                    onPress={async () => {
                        if (step === 1) {
                            // Validate selections before continuing
                            if (!selectedExperience) {
                                Alert.alert('Selection Required', 'Please select an experience before continuing');
                                return;
                            }
                            if (!selectedGoal) {
                                Alert.alert('Selection Required', 'Please select your goal type before continuing');
                                return;
                            }
                            if (selectedGoal === 'Other' && !customGoal.trim()) {
                                Alert.alert('Custom Goal Required', 'Please enter your custom goal before continuing');
                                return;
                            }
                            setStep(2);
                        } else if (step === 2 && (selectedMode || isSurpriseMode)) {
                            // Validate emails
                            if (!isEmailValid(purchaserEmail) || !isEmailValid(partnerEmail)) {
                                Alert.alert('Invalid Email', 'Please enter valid email addresses for both you and your partner');
                                return;
                            }

                            if (purchaserEmail.toLowerCase().trim() === partnerEmail.toLowerCase().trim()) {
                                Alert.alert('Same Email', 'Please use different email addresses for you and your partner');
                                return;
                            }

                            setIsProcessingPayment(true);

                            try {
                                // Handle surprise mode experience selection
                                let finalExperience = selectedExperience;
                                if (isSurpriseMode && selectedExperience?.actualExperience) {
                                    // Use the pre-selected random experience
                                    finalExperience = selectedExperience.actualExperience;
                                    console.log('🎁 Using surprise experience:', finalExperience.title);
                                }

                                // Create valentine challenge metadata
                                const valentineData = {
                                    purchaserEmail: purchaserEmail.trim(),
                                    partnerEmail: partnerEmail.trim(),
                                    experienceId: finalExperience.id,
                                    experiencePrice: finalExperience.price,
                                    mode: selectedMode,
                                    goalType: selectedGoal === 'Other' ? customGoal.trim() : selectedGoal,
                                    weeks,
                                    sessionsPerWeek,
                                };

                                // Navigate to checkout with Valentine data
                                navigation.navigate('ValentineCheckout', {
                                    valentineData,
                                    totalAmount: finalExperience.price * 2,
                                });
                            } catch (error: any) {
                                Alert.alert('Error', error.message || 'Failed to process. Please try again.');
                            } finally {
                                setIsProcessingPayment(false);
                            }
                        }
                    }}
                    disabled={(step === 2 && !selectedMode && !isSurpriseMode) || isProcessingPayment}
                >
                    <Text style={styles.ctaText}>
                        {isProcessingPayment ? 'Processing...' : (step === 1 ? 'Continue' : 'Proceed to Payment')}
                    </Text>
                </TouchableOpacity>
                {step === 2 && isSurpriseMode && (
                    <Text style={styles.footerWarning}>
                        🎁 Surprise mode: You'll buy a mystery experience
                    </Text>
                )}
            </View >

            {/* Experience Details Modal */}
            <Modal
                visible={showDetailsModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowDetailsModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Close Button */}
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() => setShowDetailsModal(false)}
                            >
                                <X color="#6B7280" size={24} />
                            </TouchableOpacity>

                            {/* Cover Image */}
                            {selectedExperience && !isSurpriseMode && (
                                <>
                                    <Image
                                        source={{ uri: selectedExperience.coverImageUrl }}
                                        style={styles.modalImage}
                                        resizeMode="cover"
                                    />

                                    {/* Title & Subtitle */}
                                    <View style={styles.modalHeader}>
                                        <Text style={styles.modalTitle}>{selectedExperience.title}</Text>
                                        {selectedExperience.subtitle && (
                                            <Text style={styles.modalSubtitle}>{selectedExperience.subtitle}</Text>
                                        )}
                                    </View>

                                    {/* Info Pills */}
                                    <View style={styles.modalInfoPills}>
                                        {selectedExperience.location && (
                                            <View style={styles.infoPill}>
                                                <Text style={styles.infoPillIcon}>📍</Text>
                                                <Text style={styles.infoPillText}>{selectedExperience.location}</Text>
                                            </View>
                                        )}
                                        {selectedExperience.duration && (
                                            <View style={styles.infoPill}>
                                                <Text style={styles.infoPillIcon}>⏱️</Text>
                                                <Text style={styles.infoPillText}>{selectedExperience.duration}</Text>
                                            </View>
                                        )}
                                        <View style={styles.infoPill}>
                                            <Text style={styles.infoPillIcon}>💰</Text>
                                            <Text style={styles.infoPillText}>€{selectedExperience.price * 2} for two</Text>
                                        </View>
                                    </View>

                                    {/* Description */}
                                    <View style={styles.modalSection}>
                                        <Text style={styles.modalSectionTitle}>About This Experience</Text>
                                        <Text style={styles.modalDescription}>{selectedExperience.description}</Text>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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
    randomIconBox: {
        backgroundColor: '#FFFBEB',
        justifyContent: 'center',
        alignItems: 'center',
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
        width: '48%', // Force 2 columns (approx 100% / 2 minus gap)
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
    emailSection: {
        marginBottom: 24,
    },
    emailInputContainer: {
        position: 'relative',
        marginBottom: 12,
    },
    emailInput: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        color: '#111',
    },
    emailInputError: {
        borderColor: '#EF4444',
    },
    emailCheckIcon: {
        position: 'absolute',
        right: 16,
        top: 14,
    },
    emailHint: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 8,
    },
    priceSliderPopover: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginTop: 12,
        marginHorizontal: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        position: 'relative',
    },
    popoverArrow: {
        position: 'absolute',
        top: -6,
        left: 50,
        width: 12,
        height: 12,
        backgroundColor: '#fff',
        transform: [{ rotate: '45deg' }],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 8,
    },
    popoverContent: {
        padding: 16,
    },
    popoverHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    popoverTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1F2937',
    },
    closePopoverButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    priceLabelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    priceLabel: {
        fontSize: 16,
        fontWeight: '800',
        color: '#F59E0B',
    },
    rerollButtonCompact: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFBEB',
        borderWidth: 1.5,
        borderColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    rangeSliderContainer: {
        marginBottom: 12,
    },
    rangeSliderTrack: {
        height: 6,
        position: 'relative',
        width: '100%',
        justifyContent: 'center',
    },
    rangeTrackBackground: {
        position: 'absolute',
        width: '100%',
        height: 6,
        backgroundColor: '#E5E7EB',
        borderRadius: 3,
    },
    rangeTrackActive: {
        position: 'absolute',
        height: 6,
        backgroundColor: '#F59E0B',
        borderRadius: 3,
    },
    rangeThumb: {
        position: 'absolute',
        top: -5,
        marginLeft: -11,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#F59E0B',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    rangeThumbInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#F59E0B',
    },
    popoverHint: {
        fontSize: 11,
        color: '#92400E',
        textAlign: 'center',
        fontWeight: '600',
    },
    surpriseWarning: {
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#F59E0B',
    },
    surpriseWarningText: {
        fontSize: 13,
        color: '#92400E',
        lineHeight: 18,
        fontWeight: '600',
    },
    surpriseModeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#F5F3FF',
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#8B5CF6',
        marginBottom: 16,
    },
    footerWarning: {
        fontSize: 13,
        color: '#F59E0B',
        textAlign: 'center',
        marginTop: 8,
        fontWeight: '600',
    },
    viewDetailsButton: {
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        alignItems: 'center',
    },
    viewDetailsText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1F2937',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        width: '100%',
        maxWidth: 500,
        maxHeight: '80%',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    modalImage: {
        width: '100%',
        height: 250,
        backgroundColor: '#F3F4F6',
    },
    modalHeader: {
        padding: 20,
        paddingBottom: 12,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 16,
        color: '#6B7280',
        lineHeight: 22,
    },
    modalInfoPills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        gap: 8,
        marginBottom: 12,
    },
    infoPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        paddingVertical: 6,
        paddingHorizontal: 12,
        gap: 6,
    },
    infoPillIcon: {
        fontSize: 14,
    },
    infoPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4B5563',
    },
    modalSection: {
        padding: 20,
        paddingTop: 12,
    },
    modalSectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 12,
    },
    modalDescription: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
    },
});
