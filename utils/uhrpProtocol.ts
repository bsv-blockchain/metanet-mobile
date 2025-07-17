import { StorageDownloader, StorageUtils, Hash, Utils } from '@bsv/sdk'

export interface UHRPResolvedContent {
  url: string
  content: Uint8Array
  mimeType: string
  size: number
  metadata?: Record<string, any>
  resolvedUrl?: string // The actual HTTP URL after resolution
}

export interface UHRPError {
  code: string
  message: string
  originalUrl: string
}

export class UHRPProtocolHandler {
  private static instance: UHRPProtocolHandler
  private downloader: StorageDownloader
  private resolvedUrls: Record<string, string> = {} // Cache resolved URLs

  private constructor() {
    this.downloader = new StorageDownloader()
  }

  public static getInstance(): UHRPProtocolHandler {
    if (!UHRPProtocolHandler.instance) {
      UHRPProtocolHandler.instance = new UHRPProtocolHandler()
    }
    return UHRPProtocolHandler.instance
  }

  public isUHRPUrl(url: string): boolean {
    let hashToCheck = url
    if (url.toLowerCase().startsWith('uhrp://')) {
      const match = url.match(/^uhrp:\/\/(.+)$/i)
      if (!match) return false
      hashToCheck = match[1]
    }

    return StorageUtils.isValidURL(hashToCheck)
  }

  private extractHashFromUHRPUrl(url: string): string {
    if (url.toLowerCase().startsWith('uhrp://')) {
      const match = url.match(/^uhrp:\/\/(.+)$/i)
      if (!match) {
        throw new Error('Invalid UHRP URL format')
      }
      return match[1]
    }
    return url
  }

  private async resolveToHttpUrl(uhrpUrl: string): Promise<string> {
    if (this.resolvedUrls[uhrpUrl]) {
      return this.resolvedUrls[uhrpUrl]
    }

    if (!this.isUHRPUrl(uhrpUrl)) {
      this.resolvedUrls[uhrpUrl] = uhrpUrl
      return uhrpUrl
    }

    const hash = this.extractHashFromUHRPUrl(uhrpUrl)

    try {
      const resolved = await this.downloader.resolve(hash)
      if (!resolved || resolved.length === 0) {
        throw new Error(`UHRP content not found for hash: ${hash}`)
      }

      const [resolvedUrl] = resolved
      this.resolvedUrls[uhrpUrl] = resolvedUrl
      return resolvedUrl
    } catch (error) {
      console.error('UHRP resolution failed:', error)
      throw error
    }
  }

  public async findUHRPHOST(url: string): Promise<string | null> {
    if (!StorageUtils.isValidURL(url)) {
      throw new Error('Invalid parameter UHRP url')
    }
    const hash = StorageUtils.getHashFromURL(url)
    const downloadURLs = await this.downloader.resolve(url)

    if (!Array.isArray(downloadURLs) || downloadURLs.length === 0) {
      throw new Error('No one currently hosts this file!')
    }

    for (let i = 0; i < downloadURLs.length; i++) {
      try {
        // The url is fetched
        const result = await fetch(downloadURLs[i], { method: 'GET' })

        // If the request fails, continue to the next url
        if (!result.ok || result.status >= 400) {
          continue
        }
        const body = await result.arrayBuffer()

        // The body is loaded into a number array
        const content: number[] = Array.from(new Uint8Array(body))
        const contentHash = Hash.sha256(content)
        for (let j = 0; j < contentHash.length; ++j) {
          if (contentHash[j] !== hash[j]) {
            throw new Error('Value of content does not match hash of the url given')
          }
        }

        return downloadURLs[i]
      } catch (error) {
        continue
      }
    }
    throw new Error(`Unable to download content from ${url}`)
  }

  public async resolveUHRPUrl(url: string): Promise<UHRPResolvedContent> {
    try {
      console.log('Resolving UHRP URL:', url)

      const resolvedHttpUrl = await this.resolveToHttpUrl(url)

      console.log('Resolved UHRP URL to:', resolvedHttpUrl)

      const response = await fetch(resolvedHttpUrl)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const content = new Uint8Array(arrayBuffer)

      let mimeType = response.headers.get('content-type') || 'application/octet-stream'
      mimeType = mimeType.split(';')[0].trim()

      return {
        url,
        content,
        mimeType,
        size: content.length,
        resolvedUrl: resolvedHttpUrl,
        metadata: {
          originalMimeType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          lastModified: response.headers.get('last-modified')
        }
      }
    } catch (error) {
      console.error('Error resolving UHRP URL:', error)
      throw {
        code: 'UHRP_RESOLUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        originalUrl: url
      } as UHRPError
    }
  }
}

export const uhrpHandler = UHRPProtocolHandler.getInstance()
