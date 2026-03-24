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
    android: {
      package: "com.ernit.ernit",
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
      ["@stripe/stripe-react-native", { merchantIdentifier: "merchant.app.ernit" }],
    ],
    extra: {
      eas: {
        projectId: "a17b540a-7edc-4ebc-b73c-c8d019738e0d",
      },
    },
  },
};
