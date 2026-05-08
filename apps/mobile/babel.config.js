module.exports = function (api) {
  api.cache(true);
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    // En tests omitimos nativewind/babel porque react-native-css-interop
    // requiere react-native-worklets/plugin que no está disponible en Jest
    return {
      presets: [['babel-preset-expo']],
    };
  }
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
