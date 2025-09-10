import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useWallet } from '@/context/WalletWebViewContext'
import { useTheme } from '@/context/theme/ThemeContext'
import { useThemeStyles } from '@/context/theme/useThemeStyles'

// Type definition for any focus-related functions we need
type FocusHandler = {
  isFocused: () => Promise<boolean>
  onFocusRequested: () => void
  onFocusRelinquished: () => void
}

const PasswordHandler: React.FC = () => {
  // For now we'll use dummy focus handlers - you can replace with your real implementation
  const focusHandler: FocusHandler = {
    isFocused: async () => true,
    onFocusRequested: () => {},
    onFocusRelinquished: () => {}
  }

  // Get theme colors
  const { colors, isDark } = useTheme()
  const themeStyles = useThemeStyles()

  const [wasOriginallyFocused, setWasOriginallyFocused] = useState<boolean>(false)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { webviewComingEvent, sendWebViewEvent } = useWallet()

  const manageFocus = useCallback(() => {
    focusHandler.isFocused().then(focused => {
      setWasOriginallyFocused(focused)
      if (!focused) {
        focusHandler.onFocusRequested()
      }
    })
  }, [focusHandler])

  useEffect(() => {
    // Handle incoming events from the webview
    if (webviewComingEvent) {
      const { name, results } = webviewComingEvent;

      switch (name) {
        case 'passwordRetriever.completed':
          // setPasswordRetriver webview callback
          setReason(results)
          setOpen(true)
          manageFocus()
          break;
        case 'testPassword.completed':
        // Check password test success
          if (results) {
            sendWebViewEvent('testPasswordResolve')
            handleClose()
          } else {
            Alert.alert('Error', 'Password validation failed')
          }
          break;
      }
    }
  }, [webviewComingEvent])

  const handleClose = useCallback(() => {
    setOpen(false)
    setPassword('')
    setShowPassword(false)

    if (!wasOriginallyFocused) {
      focusHandler.onFocusRelinquished()
    }
  }, [focusHandler, wasOriginallyFocused])

  const handleCancel = useCallback(() => {
    // Send the password rejected event
    sendWebViewEvent('testPasswordReject', 'User cancelled')
    handleClose()
  }, [handleClose])

  const handleSubmit = useCallback(async () => {
    // Send the password to the webview
    sendWebViewEvent('testPassword', password)
  }, [handleClose, password])

  const toggleShowPassword = () => {
    setShowPassword(!showPassword)
  }

  return (
    <Modal visible={open} transparent={true} animationType="fade" onRequestClose={handleCancel}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.modalContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoid}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <View style={styles.contentContainer}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Enter Password</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  {reason || 'Please enter your password to continue'}
                </Text>

                <View style={styles.inputContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                        color: colors.textPrimary
                      }
                    ]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Enter password"
                    placeholderTextColor={colors.textSecondary}
                    autoFocus
                    onSubmitEditing={handleSubmit}
                  />
                  <TouchableOpacity style={styles.eyeIcon} onPress={toggleShowPassword}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.inputBorder }]}
                  onPress={handleCancel}
                >
                  <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
                  <Text style={[styles.buttonText, { color: colors.buttonText }]}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  keyboardAvoid: {
    width: '90%',
    maxWidth: 400
  },
  modalContent: {
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  },
  contentContainer: {
    marginBottom: 20
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12
  },
  description: {
    fontSize: 16,
    marginBottom: 20
  },
  inputContainer: {
    position: 'relative'
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    fontSize: 16,
    paddingRight: 50
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: 13
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    marginLeft: 10
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500'
  }
})

export default PasswordHandler
