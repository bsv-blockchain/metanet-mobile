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
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  Code,
  CameraDeviceFormat
} from 'react-native-vision-camera';
import { Audio } from 'expo-av'; // Import expo-av for sound
import { logWithTimestamp } from '@/utils/logging'; // Local import with @

// Define the handle type for the ref
export interface ScannerHandle {
  dismiss: () => void;
}

interface ScannerProps {
  scannedData: string | null; // Add scannedData as a prop
  setScannedData: (data: string | null) => void; // No callback
  showScanner: boolean; // Required prop
  onDismiss: () => void; // Callback to unmount scanner
}

// Type guard for Platform.OS including 'web'
const isWebPlatform = (os: string): os is 'web' => os === 'web';

const UniversalScanner = React.forwardRef<ScannerHandle, ScannerProps>(
  (
    { scannedData, setScannedData, showScanner, onDismiss }: ScannerProps,
    ref: ForwardedRef<ScannerHandle>
  ) => {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [showDismiss, setShowDismiss] = useState(false); // Show Dismiss button after 30s
    const mountTimeRef = useRef<number | null>(null); // Track mount time
    const dismissTimerRef = useRef<number | null>(null); // For 30-second timeout
    const sound = useRef<Audio.Sound | null>(null); // Ref for audio

    const { hasPermission: visionPermission, requestPermission } =
      useCameraPermission();
    const device = useCameraDevice('back', {
      physicalDevices: ['ultra-wide-angle-camera'] // Prefer faster camera
    });

    // Pre-scan permission check
    useEffect(() => {
      logWithTimestamp(
        'components/UniversalScanner',
        '🔍 Checking camera permission before scan'
      );
      const checkPermissions = async () => {
        if (!isWebPlatform(Platform.OS)) {
          const status = await requestPermission();
          logWithTimestamp(
            'components/UniversalScanner',
            '🔑 Permission request result',
            { status }
          );
          setHasPermission(status);
          if (!status) {
            Alert.alert(
              'Camera Permission Required',
              'Please grant camera permission to scan codes.',
              [
                { text: 'Cancel', onPress: () => setScannedData('') },
                { text: 'OK', onPress: () => checkPermissions() }
              ]
            );
          }
        } else {
          logWithTimestamp(
            'components/UniversalScanner',
            '🌐 Web not supported, permission check skipped'
          );
          setHasPermission(false); // Web not supported without expo-camera
        }
      };
      if (showScanner && hasPermission === null) checkPermissions();
    }, [requestPermission, setScannedData, showScanner, hasPermission]);

    // Load and prepare the click sound
    useEffect(() => {
      async function loadSound() {
        try {
          const { sound: newSound } = await Audio.Sound.createAsync(
            require('@/assets/camera-shutter-click.mp3') // Use absolute project path
          );
          sound.current = newSound;
          logWithTimestamp(
            'components/UniversalScanner',
            '🔊 Sound loaded successfully v1.0'
          );
        } catch (error) {
          logWithTimestamp(
            'components/UniversalScanner',
            '❌ Error loading sound v1.0',
            { error }
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
          logWithTimestamp(
            'components/UniversalScanner',
            '🎵 Click sound played v1.0'
          );
        } catch (error) {
          logWithTimestamp(
            'components/UniversalScanner',
            '❌ Error playing sound v1.0',
            { error }
          );
        }
      } else {
        logWithTimestamp(
          'components/UniversalScanner',
          '⚠️ Sound not loaded v1.0'
        );
      }
    };

    logWithTimestamp(
      'components/UniversalScanner',
      '🚀 Component mounted v1.0',
      {
        showScanner,
        isMounted
      }
    );

    const codeScanner = useCodeScanner({
      codeTypes: [
        'qr',
        'upc-a',
        'upc-e',
        'ean-8',
        'ean-13',
        'code-39',
        'code-93',
        'code-128',
        'pdf-417',
        'aztec',
        'data-matrix'
      ], // Standardized hyphenated format
      onCodeScanned: (codes: Code[]) => {
        logWithTimestamp(
          'components/UniversalScanner',
          '📷 onCodeScanned triggered v1.0',
          { codesLength: codes.length, scanned }
        );
        if (codes.length > 0 && !scanned) {
          const barcode = codes[0];
          const barcodeText = barcode.value;
          if (barcodeText) {
            logWithTimestamp(
              'components/UniversalScanner',
              '✅ Scan detected v1.0',
              { type: barcode.type, value: barcodeText }
            );
            setScannedData(barcodeText);
            setScanned(true);
            playClickSound();
            logWithTimestamp(
              'components/UniversalScanner',
              '📤 Scan data set to:',
              barcodeText
            );
            setTimeout(() => {
              logWithTimestamp(
                'components/UniversalScanner',
                '🔄 Scan re-enabled after timeout v1.0'
              );
              setScanned(false);
              if (ref && 'current' in ref && ref.current) {
                ref.current.dismiss();
              }
            }, 300);
          }
        }
      }
    });

    useEffect(() => {
      logWithTimestamp(
        'components/UniversalScanner',
        '🔧 Mount effect triggered v1.0',
        { showScanner, isMounted }
      );
      if (showScanner && !isMounted) {
        logWithTimestamp(
          'components/UniversalScanner',
          '📥 Mounting camera v1.0'
        );
        setIsMounted(true);
        mountTimeRef.current = Date.now();
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
        }
        dismissTimerRef.current = setTimeout(() => {
          logWithTimestamp(
            'components/UniversalScanner',
            '⏰ Showing dismiss button after 30s v1.0'
          );
          setShowDismiss(true);
        }, 30000); // 30-second timeout
      } else if (!showScanner && isMounted) {
        logWithTimestamp(
          'components/UniversalScanner',
          '📤 Unmounting camera v1.0'
        );
        setIsMounted(false);
        mountTimeRef.current = null;
        setShowDismiss(false);
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
      }
    }, [showScanner, isMounted]);

    useEffect(() => {
      logWithTimestamp('components/UniversalScanner', '🔄 State updated v1.0', {
        torchOn,
        scanned,
        showDismiss
      });
    }, [torchOn, scanned, showDismiss]);

    // Expose dismiss method via ref
    useImperativeHandle(
      ref,
      () => ({
        dismiss: () => {
          logWithTimestamp(
            'components/UniversalScanner',
            '🚪 Dismissing scanner via ref v1.0'
          );
          try {
            setScannedData(''); // Return empty string on dismissal
            onDismiss();
            logWithTimestamp(
              'components/UniversalScanner',
              '✅ Dismissal completed with empty string'
            );
          } catch (error) {
            logWithTimestamp(
              'components/UniversalScanner',
              '❌ Error during dismiss v1.0',
              { error }
            );
          }
        }
      }),
      [onDismiss, setScannedData]
    );

    if ((Platform.OS as string) !== 'web' && !device) {
      logWithTimestamp(
        'components/UniversalScanner',
        '⚠️ No camera device available v1.0'
      );
      return (
        <View style={styles.container}>
          <Text>No camera available</Text>
          <TouchableOpacity onPress={() => setScannedData('')}>
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if ((Platform.OS as string) !== 'web' && !visionPermission) {
      logWithTimestamp(
        'components/UniversalScanner',
        '🔐 Permission not granted v1.0'
      );
      return (
        <View style={styles.container}>
          <Text>Requesting camera permission...</Text>
          <TouchableOpacity onPress={() => setScannedData('')}>
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (isWebPlatform(Platform.OS)) {
      logWithTimestamp(
        'components/UniversalScanner',
        '🌐 Web not supported without expo-camera'
      );
      return (
        <View style={styles.container}>
          <Text>Web scanning not supported</Text>
          <TouchableOpacity onPress={() => setScannedData('')}>
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Select a lower resolution format with the highest maxFps
    const format = device?.formats
      .filter(f => f.videoWidth <= 640 && f.videoHeight <= 480)
      .reduce(
        (prev, current) => (prev.maxFps > current.maxFps ? prev : current),
        device?.formats[0]
      );

    return (
      showScanner && (
        <TouchableWithoutFeedback
          onPress={() => {
            logWithTimestamp(
              'components/UniversalScanner',
              '🚪 Dismissing scanner via tap v1.0'
            );
            playClickSound();
            if (ref && 'current' in ref && ref.current) {
              ref.current.dismiss();
            }
          }}
        >
          <View style={styles.container}>
            <View style={styles.webViewOverlay} pointerEvents="box-none" />
            <View style={styles.overlayFullScreen} />
            <View style={styles.cameraContainer}>
              <VisionCamera
                style={StyleSheet.absoluteFill}
                device={device!}
                isActive={isMounted || showScanner}
                codeScanner={codeScanner}
                torch={torchOn ? 'on' : 'off'}
                fps={format?.maxFps || 30}
                videoStabilizationMode="off"
                format={format}
                onError={error =>
                  logWithTimestamp(
                    'components/UniversalScanner',
                    '❌ Camera error v1.0',
                    { error }
                  )
                }
              />
            </View>
            <View style={styles.overlay}>
              <View style={styles.scanArea} />
            </View>
            {showDismiss && (
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  logWithTimestamp(
                    'components/UniversalScanner',
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
                  'components/UniversalScanner',
                  '🔦 Torch button pressed v1.0',
                  { torchOn }
                );
                setTorchOn(!torchOn);
              }}
              disabled={(Platform.OS as string) === 'web'}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.torchText}>
                {torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      )
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  webViewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Dimensions.get('window').height / 2,
    backgroundColor: 'transparent'
  },
  overlayFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent'
  },
  cameraContainer: {
    height: Dimensions.get('window').height / 2,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  },
  overlay: {
    height: Dimensions.get('window').height / 2,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center'
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
    borderRadius: 5
  },
  closeText: {
    fontSize: 16,
    color: '#000'
  },
  torchButton: {
    position: 'absolute',
    bottom: 80,
    backgroundColor: 'fff',
    padding: 10,
    borderRadius: 5
  },
  torchText: {
    fontSize: 16,
    color: '#000'
  }
});

export default UniversalScanner;
