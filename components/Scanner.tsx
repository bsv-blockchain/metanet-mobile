import {
  BarcodeScanningResult,
  Camera,
  CameraView,
  PermissionStatus
} from 'expo-camera';
import React, {
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Dimensions,
  TouchableWithoutFeedback
} from 'react-native';
import { Audio } from 'expo-av'; // Import expo-av for sound
import { logWithTimestamp } from '@/utils/logging'; // Local import with @

// Define the handle type for the ref
export interface ScannerHandle {
  dismiss: () => void;
}

interface ScannerProps {
  scannedData: string | null; // Add scannedData as a prop for consistency
  setScannedData: (data: string | null) => void; // No callback
  showScanner: boolean; // Required prop to match UniversalScanner
  onDismiss: () => void; // Callback to unmount scanner
}

const Scanner = React.forwardRef<ScannerHandle, ScannerProps>(
  (
    { scannedData, setScannedData, showScanner, onDismiss }: ScannerProps,
    ref: ForwardedRef<ScannerHandle>
  ) => {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [torchOn, setTorchOn] = useState(false); // Add torch state
    const [isMounted, setIsMounted] = useState(false);
    const [showDismiss, setShowDismiss] = useState(false); // Add dismissal timeout
    const mountTimeRef = useRef<number | null>(null); // Track mount time
    const dismissTimerRef = useRef<number | null>(null); // For 30-second timeout
    const sound = useRef<Audio.Sound | null>(null); // Ref for audio

    // Pre-scan permission check
    useEffect(() => {
      logWithTimestamp(
        'components/Scanner',
        '🔍 Checking camera permission before scan'
      );
      const checkPermissions = async () => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        logWithTimestamp('components/Scanner', '🔑 Permission request result', {
          status
        });
        setHasPermission(status === PermissionStatus.GRANTED);
        if (status !== PermissionStatus.GRANTED) {
          Alert.alert(
            'Camera Permission Required',
            'Please enable camera access in Settings to use the scanner.',
            [
              { text: 'Cancel', onPress: () => setScannedData('') },
              { text: 'OK', onPress: () => checkPermissions() }
            ]
          );
        }
      };
      if (showScanner && hasPermission === null) checkPermissions();
    }, [setScannedData, showScanner, hasPermission]);

    // Load and prepare the click sound
    useEffect(() => {
      async function loadSound() {
        try {
          const { sound: newSound } = await Audio.Sound.createAsync(
            require('@/assets/camera-shutter-click.mp3')
          );
          sound.current = newSound;
          logWithTimestamp(
            'components/Scanner',
            '🔊 Sound loaded successfully v1.0'
          );
        } catch (error) {
          logWithTimestamp(
            'components/Scanner',
            '❌ Error loading sound v1.0',
            {
              error
            }
          );
        }
      }
      loadSound();
      return () => {
        if (sound.current) {
          sound.current.unloadAsync();
        }
      };
    }, []);

    // Play click sound with error handling
    const playClickSound = async () => {
      if (sound.current) {
        try {
          await sound.current.replayAsync();
          logWithTimestamp('components/Scanner', '🎵 Click sound played v1.0');
        } catch (error) {
          logWithTimestamp(
            'components/Scanner',
            '❌ Error playing sound v1.0',
            {
              error
            }
          );
        }
      } else {
        logWithTimestamp('components/Scanner', '⚠️ Sound not loaded v1.0');
      }
    };

    logWithTimestamp('components/Scanner', '🚀 Component mounted v1.0', {
      showScanner,
      isMounted
    });

    const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
      if (!scanned) {
        logWithTimestamp('components/Scanner', '✅ Scan detected v1.0', {
          value: data
        });
        setScannedData(data);
        setScanned(true);
        playClickSound();
        logWithTimestamp(
          'components/Scanner',
          '📤 Single scan data set to:',
          data
        );
        setTimeout(() => {
          logWithTimestamp(
            'components/Scanner',
            '🔄 Single scan re-enabled after timeout v1.0'
          );
          setScanned(false);
        }, 300);
      }
    };

    useEffect(() => {
      logWithTimestamp('components/Scanner', '🔧 Mount effect triggered v1.0', {
        showScanner,
        isMounted
      });
      if (showScanner && !isMounted) {
        logWithTimestamp('components/Scanner', '📥 Mounting camera v1.0');
        setIsMounted(true);
        mountTimeRef.current = Date.now();
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
        }
        dismissTimerRef.current = setTimeout(() => {
          logWithTimestamp(
            'components/Scanner',
            '⏰ Showing dismiss button after 30s v1.0'
          );
          setShowDismiss(true);
        }, 30000); // 30-second timeout
      } else if (!showScanner && isMounted) {
        logWithTimestamp('components/Scanner', '📤 Unmounting camera v1.0');
        setIsMounted(false);
        mountTimeRef.current = null;
        setShowDismiss(false);
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
      }
    }, [showScanner, isMounted]);

    // Expose dismiss method via ref
    useImperativeHandle(
      ref,
      () => ({
        dismiss: () => {
          logWithTimestamp(
            'components/Scanner',
            '🚪 Dismissing scanner via ref v1.0'
          );
          try {
            setScannedData(''); // Return empty string on dismissal
            onDismiss();
            logWithTimestamp(
              'components/Scanner',
              '✅ Dismissal completed with empty string'
            );
          } catch (error) {
            logWithTimestamp(
              'components/Scanner',
              '❌ Error during dismiss v1.0',
              {
                error
              }
            );
          }
        }
      }),
      [onDismiss, setScannedData]
    );

    if (hasPermission === null) {
      return (
        <View style={styles.container}>
          <Text>Loading...</Text>
          <TouchableOpacity onPress={() => setScannedData('')}>
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (hasPermission === false) {
      return (
        <View style={styles.container}>
          <Text>No camera access granted.</Text>
          <TouchableOpacity onPress={() => setScannedData('')}>
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableWithoutFeedback
        style={styles.container}
        onPress={() => {
          logWithTimestamp(
            'components/Scanner',
            '🚪 Dismissing scanner via tap v1.0'
          );
          playClickSound();
          if (ref && 'current' in ref && ref.current) {
            ref.current.dismiss();
          }
        }}
      >
        <View>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: [
                'qr',
                'upc_a',
                'upc_e',
                'ean8',
                'ean13',
                'code39',
                'code93',
                'code128',
                'pdf417',
                'aztec',
                'datamatrix'
              ] // Match UniversalScanner's standardized types
            }}
          />
          <View style={styles.overlay}>
            <View style={styles.scanArea} />
          </View>
          {showDismiss && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                logWithTimestamp(
                  'components/Scanner',
                  '🚪 Dismiss button pressed v1.0'
                );
                playClickSound();
                if (ref && 'current' in ref && ref.current) {
                  ref.current.dismiss();
                }
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeText}>Dismiss</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.torchButton}
            onPress={() => {
              logWithTimestamp(
                'components/Scanner',
                '🔦 Torch button pressed v1.0',
                {
                  torchOn
                }
              );
              setTorchOn(!torchOn);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.torchText}>
              {torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent overlay
    justifyContent: 'center',
    alignItems: 'center'
  },
  camera: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent'
  },
  closeButton: {
    position: 'absolute',
    bottom: 20,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    zIndex: 3
  },
  closeText: {
    fontSize: 16,
    color: '#000'
  },
  torchButton: {
    position: 'absolute',
    bottom: 20 + 50,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    zIndex: 3
  },
  torchText: {
    fontSize: 16,
    color: '#000'
  }
});

export default Scanner;
