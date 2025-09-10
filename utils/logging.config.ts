// Default logging state for all files
const defaultLogging = false

// Specific file logging overrides
const loggingConfig: { [file: string]: boolean } = {
  default: defaultLogging,
  'context/WalletWebViewContext': true
}

export default loggingConfig
