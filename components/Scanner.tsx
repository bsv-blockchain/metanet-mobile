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

interface ScannerProps {
  setScannedData: (data: string | null) => void;
}

const Scanner: React.FC<ScannerProps> = ({ setScannedData }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === PermissionStatus.GRANTED);
      if (status !== PermissionStatus.GRANTED) {
        Alert.alert(
          'Camera Permission Denied',
          'Please enable camera access in Settings to use the scanner.'
        );
      }
    })();
  }, []);

  const handleBarCodeScanned = (data: string) => {
    if (!scanned) {
      console.log(`Scanned: ${data}`);
      setScannedData(data);
      setScanned(true); // Prevent multiple scans
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
        <TouchableOpacity onPress={() => setScannedData(null)}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text>No camera access granted.</Text>
        <TouchableOpacity onPress={() => setScannedData(null)}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={({ data }: BarcodeScanningResult) =>
          handleBarCodeScanned(data)
        }
        barcodeScannerSettings={{
          barcodeTypes: [
            'qr',
            'code128',
            'pdf417',
            'code39',
            'code93',
            'codabar',
            'ean13',
            'ean8',
            'upc_e',
            'datamatrix',
            'aztec'
            //'itf',
            //'code-39-mod-43',
            //'ean-5',
            //'ean-2',
            //'code-11',
            //'gs1-data-bar',
            //'gs1-data-bar-expanded',
            //'gs1-data-bar-limited'
          ] // Match UniversalScanner's supported types
        }}
      />
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
  camera: {
    flex: 1
  },
  preview: {
    flex: 1
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
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8
  }
});

export default Scanner;
