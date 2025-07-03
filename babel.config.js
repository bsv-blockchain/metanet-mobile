module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // [
      //   'react-native-reanimated/plugin',
      //   {
      //     globals: ['__decode'],
      //     enableExperimentalWorkletSupport: true
      //   }
      // ],
      [
        '@babel/plugin-transform-modules-commonjs',
        {
          loose: true
        }
      ]
    ]
  }
}
