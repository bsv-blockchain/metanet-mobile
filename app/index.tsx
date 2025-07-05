import { enableScreens } from 'react-native-screens'; // Add this import
enableScreens(); // Call this immediately before any UI components

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert
} from 'react-native';
import ConfigModal from '@/components/ConfigModal';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AppLogo from '@/components/AppLogo';
import { useTheme } from '@/context/theme/ThemeContext';
import { useWallet } from '@/context/WalletContext';
import { useLocalStorage } from '@/context/LocalStorageProvider';
import { Utils } from '@bsv/sdk';
import UniversalScanner, { ScannerHandle } from '@/components/UniversalScanner'; // Import with type
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { logWithTimestamp } from '@/utils/logging'; // Local import with @

// Declare scanCodeWithCamera as an optional property on the Window type
declare global {
  interface Window {
    scanCodeWithCamera?: (reason: string) => Promise<string>;
  }
}

const LoginScreen = () => {
  const { colors, isDark } = useTheme();
  const {
    managers,
    selectedWabUrl,
    selectedStorageUrl,
    selectedMethod,
    selectedNetwork,
    finalizeConfig
  } = useWallet();
  const { getSnap, setItem, getItem } = useLocalStorage();
  const [loading, setLoading] = React.useState(false);
  const [initializing, setInitializing] = useState(true);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false); // State to show/hide scanner
  const [initialMount, setInitialMount] = useState(true); // Track initial mount
  const [webViewRef] = useState<any>(null); // Reference to WebView for Metanet app
  const scanResolver = useRef<(data: string) => void | null>(null);
  const scannerRef = useRef<ScannerHandle>(null); // Typed ref

  const showUniversalScanner = useCallback(() => {
    logWithTimestamp('app/index', 'Scan button pressed v1.3', { showScanner });
    setShowScanner(true);
    setInitialMount(false); // Reset initial mount flag
  }, []);

  const handleGetStarted = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${selectedWabUrl}/info`);
      if (!res.ok) {
        throw new Error(`Failed to fetch info: ${res.status}`);
      }
      const wabInfo = await res.json();
      console.log({
        wabInfo,
        selectedWabUrl,
        selectedMethod,
        selectedNetwork,
        selectedStorageUrl
      });
      const finalConfig = {
        wabUrl: selectedWabUrl,
        wabInfo,
        method: selectedMethod || wabInfo.supportedAuthMethods[0],
        network: selectedNetwork,
        storageUrl: selectedStorageUrl
      };
      const success = finalizeConfig(finalConfig);
      if (!success) {
        Alert.alert(
          'Error',
          'Failed to finalize configuration. Please try again.'
        );
        return;
      }
      await setItem('finalConfig', JSON.stringify(finalConfig));
      const snap = await getSnap();
      if (!snap) {
        router.push('/auth/phone');
        return;
      }
      await managers?.walletManager?.loadSnapshot(snap);
      router.replace('/browser');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to get started. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const [showConfig, setShowConfig] = useState(false);

  const handleConfig = () => {
    setShowConfig(true);
  };

  const handleConfigDismiss = () => {
    setShowConfig(false);
  };

  const handleConfigured = async () => {
    try {
      const finalConfig = JSON.parse((await getItem('finalConfig')) || '');
      const success = finalizeConfig(finalConfig);
      if (!success) return;
      const snap = await getSnap();
      if (!snap) {
        router.push('/auth/phone');
        return;
      }
      const snapArr = Utils.toArray(snap, 'base64');
      await managers?.walletManager?.loadSnapshot(snapArr);
      router.replace('/browser');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to authenticate. Please try again.');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const snap = await getSnap();
        if (snap) {
          await managers?.walletManager?.loadSnapshot(snap);
          router.replace('/browser');
        }
      } finally {
        setInitializing(false);
      }
    })();
  }, [getSnap, managers?.walletManager]);

  // Single effect for scannedData handling with stricter condition
  useEffect(() => {
    logWithTimestamp('app/index', 'Scanned data updated v1.3', {
      scannedData,
      showScanner,
      initialMount
    });
    if (
      !initialMount &&
      scannedData === null &&
      showScanner &&
      scannedData !== undefined
    ) {
      // Added scannedData !== undefined to avoid initial null
      setTimeout(() => {
        if (showScanner) {
          // Only unmount if still visible
          logWithTimestamp(
            'app/index',
            'Setting showScanner to false after scan or timeout v1.3'
          );
          setShowScanner(false); // Ensure unmount after scan resolution or timeout
          logWithTimestamp(
            'app/index',
            'Closing scanner due to scannedData being null v1.3'
          );
        }
      }, 100); // Increased delay to 100ms for stability
    } else if (scannedData && scanResolver.current) {
      logWithTimestamp('app/index', 'Resolving scan data v1.3', {
        scannedData
      });
      scanResolver.current(scannedData);
      scanResolver.current = null;
      setScannedData(null); // Clear after resolution
    }
  }, [scannedData, initialMount]);

  // Inject scanCodeWithCamera into window for Metanet apps
  useEffect(() => {
    window.scanCodeWithCamera = async (reason: string): Promise<string> => {
      return new Promise(resolve => {
        logWithTimestamp('app/index', 'Scan initiated v1.3', { reason });
        scanResolver.current = resolve;
        setShowScanner(true);
        setInitialMount(false); // Reset on new scan request
        // Auto-dismiss after 30s if not scanned
        const timeout = setTimeout(() => {
          if (scanResolver.current) {
            logWithTimestamp('app/index', 'Scan timed out v1.3');
            scanResolver.current('');
            scanResolver.current = null;
            setShowScanner(false);
          }
        }, 30000);
        // Cleanup on unmount or resolve
        return () => clearTimeout(timeout);
      });
    };
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View
        style={[
          styles.contentContainer,
          { backgroundColor: colors.background }
        ]}
      >
        <View style={styles.logoContainer}>
          <AppLogo />
        </View>
        {!initializing && (
          <>
            <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>
              Metanet
            </Text>
            <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>
              Browser with identity and payments built in
            </Text>
            <TouchableOpacity
              style={[
                styles.getStartedButton,
                { backgroundColor: colors.primary, opacity: loading ? 0.2 : 1 }
              ]}
              onPress={handleGetStarted}
              disabled={loading}
            >
              <Text
                style={[
                  styles.getStartedButtonText,
                  { color: colors.buttonText }
                ]}
              >
                Get Started
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.scannerButton,
                {
                  backgroundColor: colors.secondary,
                  opacity: loading ? 0.2 : 1
                }
              ]}
              onPress={showUniversalScanner}
              disabled={loading}
            >
              <Text
                style={[styles.scannerButtonText, { color: colors.buttonText }]}
              >
                Scan QR Code
              </Text>
            </TouchableOpacity>
            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
              By continuing, you agree to our Terms of Service and Privacy
              Policy
            </Text>
            <TouchableOpacity
              style={styles.configButton}
              onPress={handleConfig}
            >
              <View style={styles.configIconContainer}>
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={colors.secondary}
                />
                <Text style={styles.configButtonText}>Configure Providers</Text>
              </View>
            </TouchableOpacity>
            <ConfigModal
              visible={showConfig}
              onDismiss={handleConfigDismiss}
              onConfigured={handleConfigured}
            />
            {showScanner && (
              <View style={styles.scannerOverlay}>
                <UniversalScanner
                  ref={scannerRef}
                  scannedData={scannedData} // Pass scannedData as prop
                  setScannedData={setScannedData}
                  showScanner={showScanner}
                  onDismiss={() => {
                    try {
                      if (scannerRef.current) {
                        logWithTimestamp(
                          'app/index',
                          'Attempting dismiss via ref v1.3'
                        );
                        scannerRef.current.dismiss();
                      }
                    } catch (error) {
                      logWithTimestamp(
                        'app/index',
                        'Error during ref dismiss v1.3',
                        { error }
                      );
                    }
                    setShowScanner(false);
                  }} // Direct unmount via ref with error handling
                />
              </View>
            )}
            <WebView
              ref={webViewRef}
              source={{ uri: 'about:blank' }} // Placeholder, replace with Metanet app URL
              style={styles.webView}
              onMessage={event => console.log(event.nativeEvent.data)} // Optional: handle messages
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen; // Ensure default export

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  logoContainer: {
    marginBottom: 40
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white'
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  welcomeText: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center'
  },
  getStartedButton: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10
  },
  scannerButton: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10
  },
  getStartedButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  scannerButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
    padding: 10
  },
  configIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8
  },
  configButtonText: {
    color: '#0066cc',
    fontSize: 14,
    marginLeft: 2
  },
  chevronIcon: {
    marginRight: 2
  },
  termsText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 15
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10, // Ensure scanner is above other content
    backgroundColor: 'rgba(0, 0, 0, 0.5)' // Match scanner background
  },
  webView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1 // Below scanner overlay
  }
});
