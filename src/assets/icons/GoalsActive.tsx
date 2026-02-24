import * as React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Colors from '../../config/colors';

export default function GoalsActive({ width = 24, height = 24 }) {
    const grad0 = React.useId();
    const grad1 = React.useId();

    return (
        <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
            {/* Circular rotation shape */}
            <Path
                d="M13 2V4C17.39 4.54 20.5 8.53 19.96 12.92C19.7392 14.689 18.935 16.3339 17.6744 17.5944C16.4139 18.855 14.769 19.6593 13 19.88V21.88C18.5 21.28 22.45 16.34 21.85 10.85C21.33 6.19 17.66 2.5 13 2ZM11 2C9.03999 2.18 7.18999 2.95 5.66999 4.2L7.09999 5.74C8.21999 4.84 9.56999 4.26 11 4.06V2.06M4.25999 5.67C3.00513 7.18463 2.23508 9.04181 2.04999 11H4.04999C4.23999 9.58 4.79999 8.23 5.68999 7.1L4.25999 5.67ZM2.05999 13C2.25999 14.96 3.02999 16.81 4.26999 18.33L5.68999 16.9C4.80683 15.7696 4.24385 14.4226 4.05999 13H2.05999ZM7.05999 18.37L5.66999 19.74C7.18496 21.0024 9.03935 21.7887 11 22V20C9.57736 19.8161 8.23034 19.2532 7.09999 18.37H7.05999Z"
                fill={`url(#${grad0})`}
            />

            {/* Play triangle */}
            <Path
                d="M17 12L9.5 16.3301V7.66987L17 12Z"
                fill={`url(#${grad1})`}
            />

            <Defs>
                {/* gradient for circle */}
                <LinearGradient
                    id={grad0}
                    x1="11.9801"
                    y1="22"
                    x2="11.9801"
                    y2="2"
                    gradientUnits="userSpaceOnUse"
                >
                    <Stop stopColor={Colors.primaryDeep} />
                    <Stop offset="1" stopColor={Colors.accent} />
                </LinearGradient>

                {/* gradient for play triangle */}
                <LinearGradient
                    id={grad1}
                    x1="7"
                    y1="12"
                    x2="17"
                    y2="12"
                    gradientUnits="userSpaceOnUse"
                >
                    <Stop stopColor={Colors.primaryDeep} />
                    <Stop offset="1" stopColor={Colors.accent} />
                </LinearGradient>
            </Defs>
        </Svg>
    );
}
