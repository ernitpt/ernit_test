// functions/src/hintCategories.ts

export type HintCategory =
    | 'what_to_bring'
    | 'what_to_wear'
    | 'physical_prep'
    | 'mental_prep'
    | 'atmosphere'
    | 'sensory'
    | 'activity_level'
    | 'location_type'
    | 'geographic_clues';

export interface HintCategoryDefinition {
    name: HintCategory;
    description: string;
    promptGuidance: string;
    examples: {
        vague: string[];
        thematic: string[];
        strong: string[];
        finale: string[];
    };
}

export const HINT_CATEGORIES: Record<HintCategory, HintCategoryDefinition> = {
    what_to_bring: {
        name: 'what_to_bring',
        description: 'Items to bring or pack',
        promptGuidance: 'Focus ONLY on items to bring. Adjust specificity based on difficulty band - early hints should NOT reveal what the items are FOR.',
        examples: {
            vague: [
                'Pack light.',
                'You won\'t need much.',
                'Bring something to stay hydrated.',
            ],
            thematic: [
                'A water bottle will be your friend.',
                'Don\'t forget something to tie your hair back.',
                'Bring a small towel.',
            ],
            strong: [
                'Chalk might come in handy.',
                'Bring a camera - you\'ll want proof.',
                'Pack extra socks.',
            ],
            finale: [
                'Bring climbing chalk if you have it.',
                'A GoPro would be perfect for capturing the climbs.',
                'Extra socks for the climbing shoes.',
            ],
        },
    },

    what_to_wear: {
        name: 'what_to_wear',
        description: 'Clothing and footwear recommendations',
        promptGuidance: 'Focus ONLY on what to wear. Early hints should mention comfort/style without revealing WHY.',
        examples: {
            vague: [
                'Dress for comfort, not style.',
                'Think casual.',
                'Leave the fancy outfit at home.',
            ],
            thematic: [
                'Comfortable footwear is key.',
                'Wear something you can move in.',
                'Athletic wear recommended.',
            ],
            strong: [
                'Sneakers or athletic shoes work best.',
                'Wear pants you can bend in.',
                'Moisture-wicking clothes are smart.',
            ],
            finale: [
                'Climbing shoes available to rent, or bring your own.',
                'Athletic pants and a breathable shirt are perfect for the gym.',
                'Closed-toe athletic shoes required.',
            ],
        },
    },

    physical_prep: {
        name: 'physical_prep',
        description: 'Physical preparation and body readiness',
        promptGuidance: 'Focus on physical readiness. Early hints should be general wellness, later hints can mention specific body parts or movements.',
        examples: {
            vague: [
                'A good night\'s sleep will serve you well.',
                'Stay hydrated today.',
                'Light stretching never hurts.',
            ],
            thematic: [
                'Stretch those arms and legs.',
                'Your muscles will thank you for warming up.',
                'Upper body strength helps.',
            ],
            strong: [
                'Grip strength matters more than you think.',
                'Your forearms are about to get a workout.',
                'Core strength is key.',
            ],
            finale: [
                'Warm up those climbing muscles - arms, core, and legs.',
                'Your grip strength will be tested on the wall.',
                'Expect a full-body workout.',
            ],
        },
    },

    mental_prep: {
        name: 'mental_prep',
        description: 'Mindset and mental readiness',
        promptGuidance: 'Focus on mental state and expectations. Keep vague early, can mention specific emotions/challenges later.',
        examples: {
            vague: [
                'Come with an open mind.',
                'Leave your worries behind.',
                'Zero expectations, maximum curiosity.',
            ],
            thematic: [
                'Trust yourself more than you think you need to.',
                'Embrace the challenge.',
                'Fear is part of the fun.',
            ],
            strong: [
                'Heights might be involved. Just saying.',
                'Your comfort zone is about to expand.',
                'Conquering fear feels amazing.',
            ],
            finale: [
                'If you\'re afraid of heights, this is your chance to face it.',
                'Climbing is 50% physical, 50% mental.',
                'Trust the harness, trust yourself.',
            ],
        },
    },

    atmosphere: {
        name: 'atmosphere',
        description: 'Vibe, mood, or feeling of the experience',
        promptGuidance: 'Focus on the overall vibe. Keep abstract early, can be more specific about setting later.',
        examples: {
            vague: [
                'The energy is different here.',
                'Expect a mix of calm and excitement.',
                'Think adventure, not relaxation.',
            ],
            thematic: [
                'Adrenaline meets focus.',
                'The vibe is supportive and energizing.',
                'Everyone here is pushing their limits.',
            ],
            strong: [
                'Gym vibes with a vertical twist.',
                'The sound of chalk and determination.',
                'Climbers of all levels, one shared goal.',
            ],
            finale: [
                'The climbing gym atmosphere is electric.',
                'Walls covered in colorful holds, climbers everywhere.',
                'Indoor climbing community at its best.',
            ],
        },
    },

    sensory: {
        name: 'sensory',
        description: 'What they\'ll see, hear, smell, taste, or feel',
        promptGuidance: 'Focus on ONE specific sense. Keep vague about what causes the sensation early, can be clearer later.',
        examples: {
            vague: [
                'Your hands will remember this.',
                'Listen closely.',
                'The smell might surprise you.',
            ],
            thematic: [
                'Chalk dust in the air.',
                'The sound of effort and encouragement.',
                'Your palms will feel it.',
            ],
            strong: [
                'The texture of climbing holds under your fingers.',
                'Hear the slap of hands on holds.',
                'Chalk everywhere - you\'ll smell it.',
            ],
            finale: [
                'The feel of textured climbing holds as you ascend.',
                'The sound of climbers calling out beta.',
                'Chalk dust and the smell of rubber shoes.',
            ],
        },
    },

    activity_level: {
        name: 'activity_level',
        description: 'Physical intensity or pace',
        promptGuidance: 'Focus on intensity/pace. Keep abstract early, can mention specific exertion levels later.',
        examples: {
            vague: [
                'Pace yourself.',
                'It\'s more intense than it looks.',
                'Expect to break a sweat.',
            ],
            thematic: [
                'Bursts of effort, moments of rest.',
                'Your heart rate will spike.',
                'Intense but manageable.',
            ],
            strong: [
                'Climbing is deceptively exhausting.',
                'Short routes, big effort.',
                'Your arms will feel it tomorrow.',
            ],
            finale: [
                'Each climb is a sprint - intense but brief.',
                'Expect your forearms to burn on the wall.',
                'Climbing routes range from easy to challenging.',
            ],
        },
    },


    location_type: {
        name: 'location_type',
        description: 'Type of place (indoor/outdoor/urban/nature)',
        promptGuidance: 'Focus on setting type. Keep very vague early, can specify indoor/outdoor later.',
        examples: {
            vague: [
                'The setting might surprise you.',
                'Not where you\'d expect.',
                'Indoor or outdoor? You\'ll see.',
            ],
            thematic: [
                'Climate-controlled comfort.',
                'No weather worries.',
                'Indoor adventure.',
            ],
            strong: [
                'Think gym, but not the usual kind.',
                'Walls, but not what you\'re picturing.',
                'Indoor facility, outdoor mindset.',
            ],
            finale: [
                'Indoor climbing gym with walls up to 40 feet.',
                'Climate-controlled climbing facility.',
                'Gym setting with vertical challenges.',
            ],
        },
    },

    geographic_clues: {
        name: 'geographic_clues',
        description: 'Hints about nearby regions/areas (not exact location from subtitle)',
        promptGuidance: 'Reference the SURROUNDING REGION or nearby areas, NOT the exact location shown in the subtitle. The subtitle shows the specific location (e.g., "Sesimbra"), so hints should mention the broader area (e.g., "shores of Setúbal"). Keep vague early, can be more specific about the region later.',
        examples: {
            vague: [
                'Not too far from Lisbon.',
                'Coastal region.',
                'South of the capital.',
            ],
            thematic: [
                'Near the Atlantic coast.',
                'In the Setúbal peninsula.',
                'A scenic area outside the city.',
            ],
            strong: [
                'Popular spot along the western shore.',
                'In the beaches area south of Lisbon.',
                'Known region for outdoor activities.',
            ],
            finale: [
                'Along the beautiful shores of Setúbal.',
                'In one of the most scenic coastal areas near Lisbon.',
                'A gem in the Arrábida natural park region.',
            ],
        },
    },
};

/**
 * Selects the next hint category ensuring variety
 */
export function selectHintCategory(
    sessionNumber: number,
    previousCategories: HintCategory[]
): HintCategory {
    const allCategories = Object.keys(HINT_CATEGORIES) as HintCategory[];

    // Find categories not yet used
    const unusedCategories = allCategories.filter(
        cat => !previousCategories.includes(cat)
    );

    // If we have unused categories, pick the first one
    if (unusedCategories.length > 0) {
        return unusedCategories[0];
    }

    // All categories used - find least recently used
    // Count how many sessions ago each category was used
    const categoryLastIndex: Record<HintCategory, number> = {} as any;

    previousCategories.forEach((cat, index) => {
        categoryLastIndex[cat] = index;
    });

    // Sort categories by last usage (oldest first)
    const sortedByUsage = allCategories.sort((a, b) => {
        const aIndex = categoryLastIndex[a] ?? -1;
        const bIndex = categoryLastIndex[b] ?? -1;
        return aIndex - bIndex;
    });

    return sortedByUsage[0];
}
