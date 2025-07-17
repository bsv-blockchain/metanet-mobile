// https://docs.expo.dev/guides/using-eslint/
import expoConfig from 'eslint-config-expo/latest'

export default [
  ...expoConfig,
  {
    // Keep only basic ESLint rules without Prettier enforcement
    ignores: ['node_modules/', 'babel.config.js', 'metro.config.js', 'jest.config.js']
  }
]
