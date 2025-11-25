import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface FeedIconProps {
    width?: number;
    height?: number;
    color?: string;
}

const FeedIcon: React.FC<FeedIconProps> = ({
    width = 24,
    height = 24,
    color = '#9CA3AF'
}) => {
    return (
        <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
            <Path
                d="M3 7.5C3 6.67157 3.67157 6 4.5 6H19.5C20.3284 6 21 6.67157 21 7.5C21 8.32843 20.3284 9 19.5 9H4.5C3.67157 9 3 8.32843 3 7.5Z"
                fill={color}
            />
            <Path
                d="M3 12C3 11.1716 3.67157 10.5 4.5 10.5H19.5C20.3284 10.5 21 11.1716 21 12C21 12.8284 20.3284 13.5 19.5 13.5H4.5C3.67157 13.5 3 12.8284 3 12Z"
                fill={color}
            />
            <Path
                d="M4.5 15C3.67157 15 3 15.6716 3 16.5C3 17.3284 3.67157 18 4.5 18H19.5C20.3284 18 21 17.3284 21 16.5C21 15.6716 20.3284 15 19.5 15H4.5Z"
                fill={color}
            />
        </Svg>
    );
};

export default FeedIcon;
