export default {
  expo: {
    name: "Ernit",
    slug: "ernit",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "ernit",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    androidStatusBar: {
      barStyle: "light-content",
      backgroundColor: "#00000000",
      translucent: true,
    },
    ios: {
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
        CFBundleDevelopmentRegion: "en",
        CFBundleLocalizations: ["en", "pt"],
      },
    },
    android: {
      package: "com.ernit.ernit",
      backgroundColor: "#FAFAF5",
      softwareKeyboardLayoutMode: "pan",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      googleServicesFile: "./google-services.json",
    },
    web: {
      bundler: "metro",
    },
    plugins: [
      "expo-secure-store",
      "expo-web-browser",
      "expo-notifications",
      "expo-image-picker",
      "expo-sensors",
      "expo-av",
      "expo-localization",
      ["@stripe/stripe-react-native", { merchantIdentifier: "merchant.app.ernit" }],
    ],
    updates: {
      url: "https://u.expo.dev/a17b540a-7edc-4ebc-b73c-c8d019738e0d",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      eas: {
        projectId: "a17b540a-7edc-4ebc-b73c-c8d019738e0d",
      },
    },
  },
};
