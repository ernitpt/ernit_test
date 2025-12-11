import * as React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function ProfileActive({ width = 36, height = 40 }) {
  const gradId = React.useId(); // unique per render

  return (
    <Svg width={width} height={height} viewBox="0 0 36 40" fill="none">
      <Path
        d="M34 38V34C34 31.8783 33.1571 29.8434 31.6569 28.3431C30.1566 26.8429 28.1217 26 26 26H10C7.87827 26 5.84344 26.8429 4.34315 28.3431C2.84285 29.8434 2 31.8783 2 34V38M26 10C26 14.4183 22.4183 18 18 18C13.5817 18 10 14.4183 10 10C10 5.58172 13.5817 2 18 2C22.4183 2 26 5.58172 26 10Z"
        stroke={`url(#${gradId})`}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Defs>
        <LinearGradient
          id={gradId}
          x1="18"
          y1="38"
          x2="18"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#6316A5" />
          <Stop offset="1" stopColor="#2577CA" />
        </LinearGradient>
      </Defs>
    </Svg>
  );
}
