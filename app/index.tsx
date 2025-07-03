import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import UniversalScanner from '@/components/UniversalScanner'; // Use UniversalScanner
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

// Declare scanCodeWithCamera as an optional property on the Window type
declare global {
  interface Window {
    scanCodeWithCamera?: (reason: string) => Promise<string>;
  }
}

export default function LoginScreen() {
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
  const [webViewRef] = useState<any>(null); // Reference to WebView for Metanet app
  const scanResolver = useRef<(data: string) => void | null>(null);

  const showUniversalScanner = useCallback(() => {
    setShowScanner(true); // Use the state setter from useState
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

  // Handle scanned data
  useEffect(() => {
    if (scannedData && scanResolver.current) {
      scanResolver.current(scannedData);
      scanResolver.current = null;
      setShowScanner(false);
      setScannedData(null);
    }
  }, [scannedData]);

  // Inject scanCodeWithCamera into window for Metanet apps
  useEffect(() => {
    window.scanCodeWithCamera = async (reason: string): Promise<string> => {
      return new Promise(resolve => {
        console.log(`Scanning initiated for reason: ${reason}`);
        scanResolver.current = resolve;
        setShowScanner(true);
        // Auto-dismiss after 30s if not scanned
        const timeout = setTimeout(() => {
          if (scanResolver.current) {
            scanResolver.current('');
            scanResolver.current = null;
            setShowScanner(false);
          }
        }, 30000);
        // Cleanup on unmount or resolve
        return () => clearTimeout(timeout);
      });
    };
    // No need to delete if optional
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
              onPress={showUniversalScanner} // Use callback directly
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
              <UniversalScanner setScannedData={setScannedData} />
            )}
            <WebView
              ref={webViewRef}
              source={{ uri: 'about:blank' }} // Placeholder, replace with Metanet app URL
              style={StyleSheet.absoluteFill}
              onMessage={event => console.log(event.nativeEvent.data)} // Optional: handle messages
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

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
  }
});
