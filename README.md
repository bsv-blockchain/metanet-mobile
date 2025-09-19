# BSV Browser

Enabling identity, micropayments, and use of BSV websites on mobile devices.

- Runs ReactNative substrate via WebView
- Lets web apps talk to a wallet
- Authenticates with WAB
- Permissions management
- Trust and identity management
- ...

## Development Setup

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- [Expo CLI](https://docs.expo.dev/get-started/installation/#expo-cli)
- iOS Simulator (for macOS) or Android Emulator
- Expo development build (recommended over Expo Go)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd metanet-mobile
```

2. Install dependencies:
```bash
npm install
```

3. Configure the app:
```bash
npm run configure
```

### Running the App

This app uses **Expo development builds** for the best development experience. Development builds include native dependencies that aren't available in Expo Go.

#### Option 1: iOS Simulator (macOS only)
```bash
npm run ios
```

#### Option 2: Android Emulator
```bash
npm run android
```

#### Option 3: Start development server
```bash
npm run start
```
Then scan the QR code with your development build app on a physical device.

### First-time Setup

After the app starts:
1. Choose your network (mainnet/testnet)
2. Select WAB and Auth Method (Twiloo Phone recommended)
3. Pick a Storage URL
4. Complete wallet setup: enter phone, verification code, password, and save recovery key
5. You're ready to use BSV apps!

### Building for Distribution

This app uses EAS Build for creating production-ready builds. You can build locally without uploading to Expo's servers.

#### Prerequisites for Building
- [EAS CLI](https://docs.expo.dev/build/setup/#install-the-latest-eas-cli) installed globally
- Xcode (for iOS builds, macOS only)
- Android Studio or Android SDK (for Android builds)

#### Android Builds

**APK Build (for testing/sideloading):**
```bash
npm run apk-android
# or manually:
# eas build --profile preview-apk --platform android --local
```

**AAB Build (for Google Play Store):**
```bash
# Use the production profile for AAB builds
eas build --profile production --platform android --local
```

#### iOS Builds

**IPA Build (for App Store/TestFlight):**
```bash
npm run ipa-ios
# or manually:
# eas build --profile production --platform ios --local
```

#### Development Builds

**For testing with development features:**
```bash
# Android development build
eas build --profile development --platform android --local

# iOS development build
eas build --profile development --platform ios --local
```

#### Build Profiles

The app uses these EAS build profiles (defined in `eas.json`):
- **development**: Development client with debugging features
- **preview**: Internal distribution builds
- **preview-apk**: Android APK for testing
- **production**: App store/Play store ready builds

### Advanced: Custom Development Builds

If you need to modify native code or work with custom native modules:

```bash
npm run prebuild
```

This generates native iOS/Android projects and applies Firebase configurations. Only needed for advanced development scenarios.

### Recommended Dev Tools

- [VS Code](https://code.visualstudio.com/)
- [React Native Debugger](https://github.com/jhen0409/react-native-debugger)
- [Flipper](https://fbflipper.com/) (for debugging)

## License

The license for the code in this repository is the Open BSV License.
