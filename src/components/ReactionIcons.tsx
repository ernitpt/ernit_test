import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface ReactionIconProps {
    size?: number;
}

export const ReactionLike: React.FC<ReactionIconProps> = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
            <LinearGradient id="likeGradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <Stop offset="0%" stopColor="#8b5cf6" />
                <Stop offset="100%" stopColor="#6366f1" />
            </LinearGradient>
        </Defs>
        <Path
            d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83v7.84C7 18.95 8.05 20 9.34 20h8.11c.7 0 1.36-.37 1.72-.97l2.66-6.15z"
            fill="url(#likeGradient)"
        />
    </Svg>
);

export const ReactionHeart: React.FC<ReactionIconProps> = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
            <LinearGradient id="heartGradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <Stop offset="0%" stopColor="#ec4899" />
                <Stop offset="100%" stopColor="#ef4444" />
            </LinearGradient>
        </Defs>
        <Path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="url(#heartGradient)"
        />
    </Svg>
);

export const ReactionMuscle: React.FC<ReactionIconProps> = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
            <LinearGradient id="muscleGradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <Stop offset="0%" stopColor="#f59e0b" />
                <Stop offset="100%" stopColor="#d97706" />
            </LinearGradient>
        </Defs>
        <Path
            d="M19.56 11.36L13 4.79V2.5l.72-.72c.39-.39 1.02-.39 1.41 0l3.88 3.88c.39.39.39 1.02 0 1.41l-.72.72h2.21v6.57c0 .55-.45 1-1 1h-6.57l-.72-.72c-.39-.39-.39-1.02 0-1.41l3.88-3.88c.39-.39 1.02-.39 1.41 0l.72.72v2.29h1.28z M8.5 13.5l2.5 3.01L14.5 13.5h-6z M9 12c0-1.1.9-2 2-2s2 .9 2 2H9z M20.3 12.79l-1.41-1.41-1.41 1.41 1.41 1.41 1.41-1.41z M5 13c-1.65 0-3 1.35-3 3s1.35 3 3 3h1.31l.62 3.05c.18.91.98 1.56 1.91 1.56h4.32c.93 0 1.73-.65 1.91-1.56l.62-3.05H17c1.65 0 3-1.35 3-3s-1.35-3-3-3H5z"
            fill="url(#muscleGradient)"
        />
        {/* Simplified muscle arm shape */}
        <Path
            d="M16,9 c0,0,0,0,0,0 c-1.3-1.3-3.4-1.3-4.7,0 l-2.8,2.8 c-0.4,0.4-0.4,1,0,1.4 c0.4,0.4,1,0.4,1.4,0 l2.8-2.8 c0.5-0.5,1.4-0.5,1.9,0 c0.5,0.5,0.5,1.4,0,1.9 l-6.3,6.3 c-0.9,0.9-2.5,0.9-3.4,0 l-1.4-1.4 c-0.4-0.4-1-0.4-1.4,0 c-0.4,0.4-0.4,1,0,1.4 l1.4,1.4 c1.7,1.7,4.5,1.7,6.2,0 l6.3-6.3 C17.3,12.4,17.3,10.3,16,9 z M20.5,13.5 c-0.4-0.4-1-0.4-1.4,0 l-1.4,1.4 c-0.9,0.9-2.5,0.9-3.4,0 l-6.3-6.3 c-0.5-0.5-0.5-1.4,0-1.9 c0.5-0.5,1.4-0.5,1.9,0 l2.8,2.8 c0.4,0.4,1,0.4,1.4,0 c0.4-0.4,0.4-1,0-1.4 l-2.8-2.8 c-1.3-1.3-3.4-1.3-4.7,0 c0,0,0,0,0,0 c-1.3,1.3-1.3,3.4,0,4.7 l6.3,6.3 c1.7,1.7,4.5,1.7,6.2,0 l1.4-1.4 C20.9,14.5,20.9,13.9,20.5,13.5 z"
            fill="url(#muscleGradient)"
        />
    </Svg>
);
