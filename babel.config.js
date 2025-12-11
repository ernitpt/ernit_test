module.exports = function (api) {
  api.cache(true);

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // ✅ SECURITY: Remove console logs in production (keeps error/warn)
      isProduction && ['transform-remove-console', { exclude: ['error', 'warn'] }],
      // 👇 This must always be the LAST plugin
      'react-native-reanimated/plugin',
    ].filter(Boolean),
  };
};
