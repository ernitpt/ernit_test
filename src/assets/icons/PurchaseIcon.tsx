// icons/PurchaseIcon.tsx
import * as React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function PurchaseIcon({ width = 24, height = 24 }) {
  const grad1 = React.useId();
  const grad2 = React.useId();

  return (
    <Svg width={width} height={height} viewBox="0 0 18 18" fill="none">
      <Path
        d="M1 6H17L16.165 15.181C16.1198 15.6779 15.8906 16.14 15.5222 16.4766C15.1538 16.8131 14.673 16.9998 14.174 17H3.826C3.32704 16.9998 2.84617 16.8131 2.4778 16.4766C2.10942 16.14 1.88016 15.6779 1.835 15.181L1 6Z"
        stroke={`url(#${grad1})`}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M5 8V5C5 3.93913 5.42143 2.92172 6.17157 2.17157C6.92172 1.42143 7.93913 1 9 1C10.0609 1 11.0783 1.42143 11.8284 2.17157C12.5786 2.92172 13 3.93913 13 5V8"
        stroke={`url(#${grad2})`}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Defs>
        <LinearGradient id={grad1} x1="9" y1="17" x2="9" y2="6" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#6316A5" />
          <Stop offset="1" stopColor="#2577CA" />
        </LinearGradient>
        <LinearGradient id={grad2} x1="9" y1="8" x2="9" y2="1" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#6316A5" />
          <Stop offset="1" stopColor="#2577CA" />
        </LinearGradient>
      </Defs>
    </Svg>
  );
}
