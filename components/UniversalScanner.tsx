const F = 'components/UniversalScanner'; // Defined at the top for consistent logging

import React, {
  ForwardedRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Platform
} from 'react-native';
import {
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  Camera,
  CameraDeviceFormat
} from 'react-native-vision-camera';
import { Audio } from 'expo-av';

import type { Code } from 'react-native-vision-camera';
import { logWithTimestamp } from '@/utils/logging';

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

// Type declaration for deprecated Sound class
declare module 'expo-av' {
  export class Sound {
    static createAsync(
      uri: any,
      onPlaybackStatusUpdate?: any,
      onError?: any
    ): Promise<{ sound: Sound; status: any }>;
    unloadAsync(): Promise<void>;
    replayAsync(): Promise<void>;
  }
}

export interface ScannerHandle {
  dismiss: () => void;
}

export interface ScannerProps {
  scannedData: string | null;
  setScannedData: (data: string | null) => void;
  showScanner: boolean;
  onDismiss: () => void;
  fullscreen?: boolean;
}

let scanAlreadyHandled = false;

const UniversalScanner = React.forwardRef<ScannerHandle, ScannerProps>(
  (
    {
      scannedData,
      setScannedData,
      showScanner,
      onDismiss,
      fullscreen
    }: ScannerProps,
    ref: ForwardedRef<ScannerHandle>
  ) => {
    logWithTimestamp(F, `fullscreen=${fullscreen}`);

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [showDismiss, setShowDismiss] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);
    const mountTimeRef = useRef<number | null>(null);
    const dismissTimerRef = useRef<number | null>(null);
    const cameraRef = useRef<Camera | null>(null);
    const sound = useRef<Audio.Sound | null>(null);

    const { hasPermission: visionPermission, requestPermission } =
      useCameraPermission();
    const device = useCameraDevice('back', {
      physicalDevices: ['wide-angle-camera']
    });

    useEffect(() => {
      const checkPermissionsAndSetup = async () => {
        if (scanAlreadyHandled || !showScanner) {
          logWithTimestamp(
            F,
            'Skipping scanner setup: already handled or scanner not visible'
          );
          return;
        }

        logWithTimestamp(
          F,
          `Checking camera permission and mounting (fullscreen=${fullscreen})`
        );

        if (isWebPlatform(Platform.OS)) {
          logWithTimestamp(F, 'Web not supported, permission check skipped');
          setHasPermission(false);
          return;
        }

        try {
          const status = await requestPermission();
          logWithTimestamp(F, 'Permission request result', { status });
          setHasPermission(status);

          if (status) {
            setIsMounted(true); // Only mount after permission
          } else {
            Alert.alert(
              'Camera Permission Required',
              'Please grant camera permission to scan codes.',
              [
                { text: 'Cancel', onPress: () => setScannedData('') },
                { text: 'OK', onPress: () => checkPermissionsAndSetup() }
              ]
            );
          }
        } catch (error) {
          logWithTimestamp(F, 'Error during scanner setup', { error });
        }
      };

      checkPermissionsAndSetup();

      return () => {
        scanAlreadyHandled = false;
        logWithTimestamp(F, 'scanAlreadyHandled reset on unmount');
      };
    }, [showScanner]);

    // Load and unload sound for reliable click audio
    useEffect(() => {
      const loadSound = async () => {
        try {
          const { sound: newSound } = await Audio.Sound.createAsync(
            require('@/assets/camera-shutter-click.mp3')
          );
          sound.current = newSound;
          logWithTimestamp(F, 'Sound loaded successfully');
        } catch (error) {
          logWithTimestamp(F, 'Error loading sound', { error });
        }
      };

      loadSound();

      return () => {
        if (sound.current) {
          sound.current.unloadAsync();
          sound.current = null;
        }
      };
    }, []);

    // Problem of intermittent audio overcome
    let isClickPlaying = false;

    const playClickSound = async () => {
      if (isClickPlaying) return;
      isClickPlaying = true;

      try {
        const { sound } = await Audio.Sound.createAsync(
          require('@/assets/camera-shutter-click.mp3'),
          { shouldPlay: true }
        );

        sound.setOnPlaybackStatusUpdate(status => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
            isClickPlaying = false;
          }
        });

        logWithTimestamp(F, 'Click sound played');
      } catch (error) {
        isClickPlaying = false;
        logWithTimestamp(F, 'Error playing sound', { error });
      }
    };

    const isWebPlatform = (os: string) => os === 'web';

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
      ],
      onCodeScanned: (codes: Code[]) => {
        logWithTimestamp(F, 'onCodeScanned triggered', {
          codesLength: codes.length,
          scanned,
          isMounted,
          isDismissing
        });
        if (isDismissing) {
          logWithTimestamp(F, 'Scanning disabled due to dismissal');
          return;
        }
        if (scanAlreadyHandled) {
          logWithTimestamp(F, 'Duplicate scan ignored');
          return;
        }

        if (codes.length > 0 && !scanned && isMounted) {
          const barcode = codes[0];
          const barcodeText = barcode.value;
          if (barcodeText) {
            scanAlreadyHandled = true;
            logWithTimestamp(F, 'Scan detected', {
              type: barcode.type,
              value: barcodeText
            });
            setScannedData(barcodeText);
            setScanned(true);
            playClickSound();
            logWithTimestamp(F, 'Scan data set to:', barcodeText);
            if (ref && 'current' in ref && ref.current) {
              ref.current.dismiss();
            }
          }
        }
      }
    });

    // Auto-show dismiss button after 10 seconds if not scanned
    useEffect(() => {
      if (showScanner && !scanned && !showDismiss && !isDismissing) {
        mountTimeRef.current = Date.now();
        dismissTimerRef.current = setTimeout(() => {
          logWithTimestamp(F, 'Showing dismiss button after 30s');
          setShowDismiss(true);
        }, 10000) as any;
      }
      return () => {
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
      };
    }, [showScanner, scanned, showDismiss, isDismissing]);

    // Select a lower resolution format with the highest maxFps
    const format: CameraDeviceFormat | undefined = device?.formats
      .filter(f => f.videoWidth <= 640 && f.videoHeight <= 480)
      .reduce(
        (prev, current) => (prev.maxFps > current.maxFps ? prev : current),
        device?.formats[0]
      );

    return (
      <Modal
        visible={showScanner && !isDismissing}
        transparent
        animationType="slide"
      >
        <View style={styles.container}>
          {!fullscreen && (
            <TouchableWithoutFeedback
              onPress={() => {
                logWithTimestamp(F, 'Top half (webview) tap detected');
                onDismiss();
              }}
            >
              <View style={styles.topDismissOverlay} />
            </TouchableWithoutFeedback>
          )}

          {isMounted && hasPermission ? (
            <View
              style={fullscreen ? styles.fullScreenCamera : styles.bottomHalf}
            >
              <View
                style={
                  fullscreen
                    ? styles.cameraFullContainer
                    : styles.cameraContainer
                }
              >
                <Camera
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  device={device!}
                  isActive={isMounted && !isDismissing}
                  codeScanner={codeScanner}
                  torch={torchOn ? 'on' : 'off'}
                  fps={format?.maxFps || 30}
                  videoStabilizationMode="off"
                  format={format}
                  onError={error =>
                    logWithTimestamp(F, 'Camera error', { error })
                  }
                />

                {/* Overlay with tap shield */}
                <View style={fullscreen ? styles.fullOverlay : styles.overlay}>
                  {/* Allow dismissal via tap outside scan area */}
                  <TouchableWithoutFeedback onPress={onDismiss}>
                    <View style={StyleSheet.absoluteFill} />
                  </TouchableWithoutFeedback>

                  {/* Protect scan area from dismiss taps */}
                  <View
                    pointerEvents="box-only"
                    style={styles.scanAreaTouchBlock}
                  >
                    <View style={styles.scanArea} />
                  </View>

                  {/* Controls */}
                  <View style={styles.buttonRow}>
                    {showDismiss && (
                      <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={() => {
                          logWithTimestamp(F, 'Dismiss button pressed');
                          onDismiss();
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.dismissText}>Dismiss</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.torchButton}
                      onPress={() => {
                        logWithTimestamp(F, 'Torch toggle');
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
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.permissionContainer}>
              <Text>Waiting for camera permission...</Text>
              <TouchableOpacity onPress={() => setScannedData('')}>
                <Text>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  cameraFullContainer: {
    flex: 1,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  fullOverlay: {
    flex: 1,
    width: '100%',
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cameraContainer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    zIndex: 1
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  topDismissOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'transparent',
    zIndex: 10
  },
  fullScreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '50%',
    backgroundColor: 'transparent'
  },
  fullScreenCamera: {
    height: '100%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  },
  bottomHalf: {
    height: '50%',
    width: '100%',
    position: 'absolute',
    bottom: 0
  },
  scanAreaTouchBlock: {
    position: 'absolute',
    width: 250,
    height: 250,
    top: '50%',
    left: '50%',
    marginTop: -125,
    marginLeft: -125,
    zIndex: 2
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent'
  },
  buttonRow: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
  },
  dismissButton: {
    position: 'absolute',
    left: 30,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5
  },
  torchButton: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5
  },
  dismissText: {
    fontSize: 16,
    color: '#000'
  },
  torchText: {
    fontSize: 16,
    color: '#000'
  },
  permissionContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100001
  }
});

export default UniversalScanner;
