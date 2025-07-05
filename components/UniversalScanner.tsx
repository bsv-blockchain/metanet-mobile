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
  Dimensions
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

const UniversalScanner = React.forwardRef<ScannerHandle, ScannerProps>(
  (
    { scannedData, setScannedData, showScanner, onDismiss }: ScannerProps,
    ref: ForwardedRef<ScannerHandle>
  ) => {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [firstUrl, setFirstUrl] = useState<string | null>(null);
    const [showDismiss, setShowDismiss] = useState(false); // Show Dismiss button after 4s from launch
    const mountTimeRef = useRef<number | null>(null); // Track mount time
    const dismissTimerRef = useRef<number | null>(null); // Updated to number for setTimeout return
    const sound = useRef<Audio.Sound | null>(null); // Ref for audio

    const { hasPermission: visionPermission, requestPermission } =
      useCameraPermission();
    const device = useCameraDevice('back', {
      physicalDevices: ['ultra-wide-angle-camera'] // Prefer faster camera if available
    });

    // Load and prepare the click sound with absolute project path
    useEffect(() => {
      async function loadSound() {
        try {
          const { sound: newSound } = await Audio.Sound.createAsync(
            require('@/assets/camera-shutter-click.mp3') // Use absolute project path
          );
          sound.current = newSound;
          logWithTimestamp(
            'components/UniversalScanner',
            'Sound loaded successfully v1.0'
          );
        } catch (error) {
          logWithTimestamp(
            'components/UniversalScanner',
            'Error loading sound v1.0',
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
        } catch (error) {
          logWithTimestamp(
            'components/UniversalScanner',
            'Error playing sound v1.0',
            { error }
          );
        }
      } else {
        logWithTimestamp(
          'components/UniversalScanner',
          'Sound not loaded v1.0'
        );
      }
    };

    logWithTimestamp('components/UniversalScanner', 'Component mounted v1.0', {
      showScanner,
      isMounted
    });

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
      ], // Support all common barcode types inspired by Scandit
      onCodeScanned: (codes: Code[]) => {
        logWithTimestamp(
          'components/UniversalScanner',
          'onCodeScanned triggered v1.0',
          { codesLength: codes.length, scanned }
        );
        if (codes.length > 0 && !scanned) {
          const barcode = codes[0];
          const barcodeText = barcode.value;
          if (barcodeText) {
            logWithTimestamp(
              'components/UniversalScanner',
              'Scan detected v1.0',
              { type: barcode.type, value: barcodeText }
            );
            setScannedData(barcodeText); // Set data immediately on first scan
            setScanned(true);
            playClickSound(); // Play sound on scan
            setTimeout(() => {
              logWithTimestamp(
                'components/UniversalScanner',
                'Scan re-enabled after timeout v1.0'
              );
              setScanned(false);
            }, 300); // Re-enable for next scan
          }
        }
      }
    });

    useEffect(() => {
      logWithTimestamp(
        'components/UniversalScanner',
        'Permissions effect triggered v1.0',
        { showScanner, isMounted }
      );
      const checkPermissions = async () => {
        if (Platform.OS !== 'web') {
          const status = await requestPermission();
          logWithTimestamp(
            'components/UniversalScanner',
            'Permission request result v1.0',
            { status }
          );
          setHasPermission(status);
          if (!status) {
            Alert.alert(
              'Camera Permission',
              'Camera permission is required to scan barcodes.',
              [{ text: 'OK', onPress: () => setScannedData('') }]
            );
          }
        } else {
          const { status } = await Camera.requestCameraPermissionsAsync();
          logWithTimestamp(
            'components/UniversalScanner',
            'Web permission result v1.0',
            { status }
          );
          setHasPermission(status === PermissionStatus.GRANTED);
          if (status !== 'granted') {
            Alert.alert(
              'Camera Permission',
              'Camera permission is required to scan QR codes.',
              [{ text: 'OK', onPress: () => setScannedData('') }]
            );
          }
        }
      };
      checkPermissions();
    }, [requestPermission, setScannedData]);

    useEffect(() => {
      logWithTimestamp(
        'components/UniversalScanner',
        'Mount effect triggered v1.0',
        { showScanner, isMounted }
      );
      logWithTimestamp(
        'components/UniversalScanner',
        'ShowScanner state v1.0',
        { showScanner }
      ); // Debug log
      if (showScanner && !isMounted) {
        logWithTimestamp('components/UniversalScanner', 'Mounting camera v1.0');
        setIsMounted(true);
        mountTimeRef.current = Date.now(); // Record mount time
        // Clear any existing timer
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
        }
        // Set dismiss button to appear after 4 seconds from launch
        dismissTimerRef.current = setTimeout(() => {
          logWithTimestamp(
            'components/UniversalScanner',
            'Showing dismiss button after 4s from launch v1.0'
          );
          setShowDismiss(true);
        }, 4000);
      } else if (!showScanner && isMounted) {
        logWithTimestamp(
          'components/UniversalScanner',
          'Unmounting camera v1.0'
        );
        setIsMounted(false);
        mountTimeRef.current = null; // Reset on unmount
        setShowDismiss(false); // Hide dismiss button on unmount
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current); // Clear timer on unmount
          dismissTimerRef.current = null;
        }
      }
    }, [showScanner, isMounted]);

    useEffect(() => {
      return () => {
        logWithTimestamp(
          'components/UniversalScanner',
          'Component unmounted v1.0'
        );
      };
    }, []); // Logs on unmount

    useEffect(() => {
      logWithTimestamp('components/UniversalScanner', 'State updated v1.0', {
        torchOn,
        scanned,
        firstUrl,
        showDismiss
      });
    }, [torchOn, scanned, firstUrl, showDismiss]);

    // Expose dismiss method via ref
    useImperativeHandle(
      ref,
      () => ({
        dismiss: () => {
          logWithTimestamp(
            'components/UniversalScanner',
            'Dismissing via ref v1.0'
          );
          try {
            setScannedData(''); // Return empty string on dismissal
            onDismiss(); // Trigger parent unmount
          } catch (error) {
            logWithTimestamp(
              'components/UniversalScanner',
              'Error during dismiss v1.0',
              { error }
            );
          }
        }
      }),
      [onDismiss, setScannedData]
    );

    if (Platform.OS !== 'web' && !device) {
      logWithTimestamp(
        'components/UniversalScanner',
        'No camera device available v1.0'
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
    if (Platform.OS !== 'web' && !visionPermission) {
      logWithTimestamp(
        'components/UniversalScanner',
        'Permission not granted v1.0'
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
    if (Platform.OS === 'web' && !hasPermission) {
      logWithTimestamp(
        'components/UniversalScanner',
        'Web permission not granted v1.0'
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

    // Select a lower resolution format with the highest maxFps
    const format = device?.formats
      .filter(f => f.videoWidth <= 640 && f.videoHeight <= 480)
      .reduce(
        (prev, current) => (prev.maxFps > current.maxFps ? prev : current),
        device?.formats[0]
      );

    return (
      <View style={styles.container}>
        {Platform.OS === 'web' ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={({ data }: BarcodeScanningResult) => {
              logWithTimestamp(
                'components/UniversalScanner',
                'Web barcode scanned v1.0',
                { data, scanned }
              );
              if (!scanned && data) {
                setScannedData(data);
                setScanned(true);
              }
            }}
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
              ] // Match native support
            }}
          />
        ) : (
          <View style={styles.cameraContainer}>
            <VisionCamera
              style={StyleSheet.absoluteFill}
              device={device!}
              isActive={isMounted || showScanner}
              codeScanner={codeScanner}
              torch={torchOn ? 'on' : 'off'}
              fps={format?.maxFps || 30} // Use maxFps from selected format or fallback to 30
              videoStabilizationMode="off" // Disable stabilization
              format={format} // Use selected format
              onError={error =>
                logWithTimestamp(
                  'components/UniversalScanner',
                  'Camera error v1.0',
                  { error }
                )
              }
            />
          </View>
        )}
        <View style={styles.overlay}>
          <View style={styles.scanArea} />
        </View>
        {showDismiss && (
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              logWithTimestamp(
                'components/UniversalScanner',
                'Dismiss button pressed v1.0'
              );
              playClickSound(); // Play click sound on button press
              setScannedData(''); // Return empty string on dismissal
              if (ref && 'current' in ref && ref.current) {
                logWithTimestamp(
                  'components/UniversalScanner',
                  'Attempting dismiss via ref v1.0'
                );
                ref.current.dismiss(); // Force unmount via ref
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
              'Torch button pressed v1.0',
              { torchOn }
            );
            setTorchOn(!torchOn);
          }}
          disabled={Platform.OS === 'web'}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.torchText}>
            {torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cameraContainer: {
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

export default UniversalScanner;
