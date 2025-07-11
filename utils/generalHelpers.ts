import { kNEW_TAB_URL } from '@/shared/constants'

// Helper function to validate URL
export function isValidUrl(url: string): boolean {
  if (!url) return false
  
  // Handle UHRP protocol
  if (url.startsWith('uhrp://')) {
    return true
  }
  
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`)
    return (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url === kNEW_TAB_URL
    )
  } catch {
    return false
  }
}
