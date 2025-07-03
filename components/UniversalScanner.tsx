import React, { useEffect, useState } from 'react'
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  Code
} from 'react-native-vision-camera'
import {
  Camera,
  CameraView,
  PermissionStatus,
  BarcodeScanningResult
} from 'expo-camera'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

// Define navigation param list for your app
type RootStackParamList = {
  scanner: undefined
  payment: { address: string }
  browser: { url: string }
}

// Define navigation prop type
type ScannerScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'scanner'
>

interface ScannerScreenProps {
  navigation: ScannerScreenNavigationProp
}

export default function ScannerScreen({ navigation }: ScannerScreenProps) {
  const [torchOn, setTorchOn] = useState(false)
  const [enableOnCodeScanned, setEnableOnCodeScanned] = useState(true)
  const [expoCameraPermission, setExpoCameraPermission] =
    useState<PermissionStatus | null>(null)

  // Camera permission for VisionCamera
  const { hasPermission, requestPermission } = useCameraPermission()
  const device = useCameraDevice('back')

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
      'upc-a',
      'upc-e',
      'data-matrix',
      'aztec'
    ],
    onCodeScanned: (codes: Code[]) => {
      if (codes.length > 0 && enableOnCodeScanned) {
        const barcode = codes[0]
        const barcodeText = barcode.value
        const barcodeFormat = barcode.type
        if (barcodeText) {
          console.log(`Scanned ${barcodeFormat}: ${barcodeText}`)
          if (barcodeText.startsWith('bitcoincash:')) {
            navigation.navigate('payment', { address: barcodeText })
          } else if (barcodeText.startsWith('metanet:')) {
            navigation.navigate('browser', { url: barcodeText })
          } else {
            Alert.alert(
              'Scan Result',
              `Type: ${barcodeFormat}\nData: ${barcodeText}`,
              [
                { text: 'OK', onPress: () => setEnableOnCodeScanned(true) },
                {
                  text: 'Open Link',
                  onPress: () => {
                    Linking.openURL(barcodeText).catch(() =>
                      Alert.alert('Error', 'Invalid URL')
                    )
                  }
                }
              ]
            )
          }
          setEnableOnCodeScanned(false)
          setTimeout(() => setEnableOnCodeScanned(true), 2000)
        }
      }
    }
  })

  // Handle permissions
  useEffect(() => {
    const handlePermissions = async () => {
      if (Platform.OS !== 'web') {
        const status = await requestPermission()
        if (!status) {
          Alert.alert(
            'Camera Permission',
            'Camera permission is required to scan barcodes.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          )
        }
      } else {
        const { status } = await Camera.requestCameraPermissionsAsync()
        setExpoCameraPermission(status)
        if (status !== 'granted') {
          Alert.alert(
            'Camera Permission',
            'Camera permission is required to scan QR codes.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          )
        }
      }
    }
    handlePermissions()
  }, [navigation])

  // Handle missing device or permission
  if (Platform.OS !== 'web' && !device) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>No camera available</Text>
      </SafeAreaView>
    )
  }
  if (Platform.OS !== 'web' && !hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </SafeAreaView>
    )
  }
  if (Platform.OS === 'web' && expoCameraPermission !== 'granted') {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS === 'web' ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={({ type, data }: BarcodeScanningResult) => {
            if (enableOnCodeScanned && data) {
              console.log(`Scanned ${type}: ${data}`)
              if (data.startsWith('bitcoincash:')) {
                navigation.navigate('payment', { address: data })
              } else if (data.startsWith('metanet:')) {
                navigation.navigate('browser', { url: data })
              } else {
                Alert.alert('Scan Result', `Type: ${type}\nData: ${data}`, [
                  { text: 'OK', onPress: () => setEnableOnCodeScanned(true) },
                  {
                    text: 'Open Link',
                    onPress: () => {
                      Linking.openURL(data).catch(() =>
                        Alert.alert('Error', 'Invalid URL')
                      )
                    }
                  }
                ])
              }
              setEnableOnCodeScanned(false)
              setTimeout(() => setEnableOnCodeScanned(true), 2000)
            }
          }}
          barcodeScannerSettings={{
            barcodeTypes: ['qr']
          }}
          enableTorch={torchOn}
        />
      ) : (
        <VisionCamera
          style={StyleSheet.absoluteFill}
          device={device!}
          isActive={true}
          codeScanner={codeScanner}
          torch={torchOn ? 'on' : 'off'}
          onError={error => console.error('Camera error:', error)}
        />
      )}
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
      </View>
      <TouchableOpacity
        style={styles.torchButton}
        onPress={() => setTorchOn(!torchOn)}
        disabled={Platform.OS === 'web'}
      >
        <Text style={styles.torchText}>
          {torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000'
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
  torchButton: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5
  },
  torchText: {
    fontSize: 16,
    color: '#000'
  }
})
