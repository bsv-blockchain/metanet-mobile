// Default logging state for all files
const defaultLogging = false;

// Specific file logging overrides
const loggingConfig: { [file: string]: boolean } = {
  default: defaultLogging,
  'app/index': true,
  'app/browser': true,
  'components/UniversalScanner': true
};

export default loggingConfig;
