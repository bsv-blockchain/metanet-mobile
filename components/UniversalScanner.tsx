import {
  BarcodeScanningResult,
  Camera,
  CameraView,
  PermissionStatus
} from 'expo-camera';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform
} from 'react-native';
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  Code
} from 'react-native-vision-camera';

interface ScannerProps {
  setScannedData: (data: string | null) => void;
}

const UniversalScanner: React.FC<ScannerProps> = ({ setScannedData }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  // Camera permission for VisionCamera
  const { hasPermission: visionPermission, requestPermission } =
    useCameraPermission();
  const device = useCameraDevice('back');

  // Barcode scanning with useCodeScanner
  const codeScanner = useCodeScanner({
    codeTypes: [
      'qr',
      'code-128',
      'pdf-417',
      'code-39',
      'code-93',
      'codabar',
      'ean-13',
      'ean-8',
      'upc-e',
      'data-matrix',
      'aztec',
      'itf',
      //'code-39-mod-43',
      //'ean-5',
      //'ean-2',
      //'code-11',
      'gs1-data-bar',
      'gs1-data-bar-expanded',
      'gs1-data-bar-limited'
    ], // Updated to match CodeType enum with hyphens
    onCodeScanned: (codes: Code[]) => {
      if (codes.length > 0 && !scanned) {
        const barcode = codes[0];
        const barcodeText = barcode.value;
        if (barcodeText) {
          console.log(`Scanned ${barcode.type}: ${barcodeText}`);
          setScannedData(barcodeText);
          setScanned(true); // Prevent multiple scans
        }
      }
    }
  });

  useEffect(() => {
    const checkPermissions = async () => {
      if (Platform.OS !== 'web') {
        const status = await requestPermission();
        setHasPermission(status);
        if (!status) {
          Alert.alert(
            'Camera Permission',
            'Camera permission is required to scan barcodes.',
            [{ text: 'OK', onPress: () => setScannedData(null) }]
          );
        }
      } else {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === PermissionStatus.GRANTED);
        if (status !== 'granted') {
          Alert.alert(
            'Camera Permission',
            'Camera permission is required to scan QR codes.',
            [{ text: 'OK', onPress: () => setScannedData(null) }]
          );
        }
      }
    };
    checkPermissions();
  }, [requestPermission, setScannedData]);

  // Handle missing device or permission
  if (Platform.OS !== 'web' && !device) {
    return (
      <View style={styles.container}>
        <Text>No camera available</Text>
        <TouchableOpacity onPress={() => setScannedData(null)}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (Platform.OS !== 'web' && !visionPermission) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
        <TouchableOpacity onPress={() => setScannedData(null)}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (Platform.OS === 'web' && !hasPermission) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
        <TouchableOpacity onPress={() => setScannedData(null)}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={({ data }: BarcodeScanningResult) => {
            if (!scanned && data) {
              console.log(`Scanned (Web): ${data}`);
              setScannedData(data);
              setScanned(true);
            }
          }}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'pdf417', 'code128'] // Updated to match web-supported types
          }}
        />
      ) : (
        <VisionCamera
          style={StyleSheet.absoluteFill}
          device={device!}
          isActive={true}
          codeScanner={codeScanner}
          onError={error => console.error('Camera error:', error)}
        />
      )}
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
      </View>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => setScannedData(null)}
      >
        <Text style={styles.closeText}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent overlay
    justifyContent: 'center',
    alignItems: 'center'
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  }
});

export default UniversalScanner;
