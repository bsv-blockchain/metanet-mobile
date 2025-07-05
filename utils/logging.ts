let lastLogTime = performance.now()

// Detect truecolor support
const supportsTruecolor = process.env.COLORTERM === 'truecolor'

// Import logging configuration with error handling
let loggingConfig: { [file: string]: boolean } = { default: true }
try {
  loggingConfig = require('./logging.config').default || { default: true }
} catch (e) {
  console.warn('Failed to load logging.config.ts, using default settings:', e)
}

const colorize = (elapsed: number) => {
  if (elapsed > 1.0) {
    return supportsTruecolor
      ? `\x1b[38;2;255;0;0m` // red
      : `\x1b[31m` // ANSI red
  } else if (elapsed > 0.5) {
    return supportsTruecolor
      ? `\x1b[38;2;255;165;0m` // orange
      : `\x1b[33;1m` // bright yellow as orange
  } else if (elapsed > 0.3) {
    return supportsTruecolor
      ? `\x1b[38;2;255;255;0m` // yellow
      : `\x1b[33m` // ANSI yellow
  } else {
    return `\x1b[0m` // default
  }
}

export const logWithTimestamp = (file: string = 'unknown', message: string = 'No message', ...args: any[]) => {
  // Check if logging is enabled for this file (fall back to default if not set)
  const isEnabled = loggingConfig[file] !== undefined ? loggingConfig[file] : loggingConfig['default']
  if (!isEnabled) return

  const now = performance.now()
  const elapsedSec = (now - lastLogTime) / 1000
  lastLogTime = now

  const timestamp = new Date().toISOString()
  const elapsed = elapsedSec.toFixed(3)
  const color = colorize(elapsedSec)

  console.log(`[${timestamp}] ${color}[${elapsed}s]\x1b[0m [${file}] ${message}`, ...args)
}
