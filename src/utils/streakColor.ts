// Streak color interpolation — shared between StreakBanner and achievement screens

export type RGB = [number, number, number];

// Color changes every 15 sessions for noticeable progression
export const COLOR_STOPS: { at: number; rgb: RGB }[] = [
  { at: 0,   rgb: [249, 115, 22] },   // #F97316 — warm orange (candle)
  { at: 15,  rgb: [245, 158, 11] },   // #F59E0B — amber (torch)
  { at: 30,  rgb: [234, 88, 12] },    // #EA580C — dark orange (campfire)
  { at: 45,  rgb: [220, 38, 38] },    // #DC2626 — red (hot coals)
  { at: 60,  rgb: [185, 28, 28] },    // #B91C1C — deep crimson (furnace)
  { at: 75,  rgb: [159, 18, 57] },    // #9F1239 — wine/berry (inferno)
  { at: 90,  rgb: [124, 58, 237] },   // #7C3AED — purple (plasma)
  { at: 105, rgb: [109, 40, 217] },   // #6D28D9 — violet (deep plasma)
  { at: 120, rgb: [67, 56, 202] },    // #4338CA — indigo (storm)
  { at: 135, rgb: [30, 27, 75] },     // #1E1B4B — dark indigo (void core)
  { at: 150, rgb: [202, 138, 4] },    // #CA8A04 — dark gold (legendary transition)
  { at: 165, rgb: [250, 204, 21] },   // #FACC15 — gold (legendary flame)
];

export const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

export const rgbToHex = ([r, g, b]: RGB): string =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

export const getFlameRGB = (streak: number): RGB => {
  const s = Math.min(Math.max(streak, 0), 165);
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (s <= COLOR_STOPS[i + 1].at) {
      const t = (s - COLOR_STOPS[i].at) / (COLOR_STOPS[i + 1].at - COLOR_STOPS[i].at);
      return lerpRGB(COLOR_STOPS[i].rgb, COLOR_STOPS[i + 1].rgb, t);
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1].rgb;
};

export const getFlameHex = (streak: number): string => rgbToHex(getFlameRGB(streak));
