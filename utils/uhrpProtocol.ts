import { StorageDownloader, StorageUtils } from '@bsv/sdk';

export interface UHRPResolvedContent {
  url: string;
  content: Uint8Array;
  mimeType: string;
  size: number;
  metadata?: Record<string, any>;
  resolvedUrl?: string; // The actual HTTP URL after resolution
}

export interface UHRPError {
  code: string;
  message: string;
  originalUrl: string;
}

export class UHRPProtocolHandler {
  private static instance: UHRPProtocolHandler;
  private downloader: StorageDownloader;
  private resolvedUrls: Record<string, string> = {}; // Cache resolved URLs

  private constructor() {
    this.downloader = new StorageDownloader();
  }

  public static getInstance(): UHRPProtocolHandler {
    if (!UHRPProtocolHandler.instance) {
      UHRPProtocolHandler.instance = new UHRPProtocolHandler();
    }
    return UHRPProtocolHandler.instance;
  }

  public isUHRPUrl(url: string): boolean {
    let hashToCheck = url;
    if (url.toLowerCase().startsWith('uhrp://')) {
      const match = url.match(/^uhrp:\/\/(.+)$/i);
      if (!match) return false;
      hashToCheck = match[1];
    }
    
    return StorageUtils.isValidURL(hashToCheck);
  }

  private extractHashFromUHRPUrl(url: string): string {
    if (url.toLowerCase().startsWith('uhrp://')) {
      const match = url.match(/^uhrp:\/\/(.+)$/i);
      if (!match) {
        throw new Error('Invalid UHRP URL format');
      }
      return match[1];
    }
    return url;
  }

  private async resolveToHttpUrl(uhrpUrl: string): Promise<string> {
    if (this.resolvedUrls[uhrpUrl]) {
      return this.resolvedUrls[uhrpUrl];
    }

    if (!this.isUHRPUrl(uhrpUrl)) {
      this.resolvedUrls[uhrpUrl] = uhrpUrl;
      return uhrpUrl;
    }

    const hash = this.extractHashFromUHRPUrl(uhrpUrl);

    try {
      const resolved = await this.downloader.resolve(hash);
      if (!resolved || resolved.length === 0) {
        throw new Error(`UHRP content not found for hash: ${hash}`);
      }
      
      const [resolvedUrl] = resolved;
      this.resolvedUrls[uhrpUrl] = resolvedUrl;
      return resolvedUrl;
    } catch (error) {
      console.error('UHRP resolution failed:', error);
      throw error;
    }
  }

  public async resolveUHRPUrl(url: string): Promise<UHRPResolvedContent> {
    try {
      console.log('Resolving UHRP URL:', url);

      const resolvedHttpUrl = await this.resolveToHttpUrl(url);
      
      console.log('Resolved UHRP URL to:', resolvedHttpUrl);

      const response = await fetch(resolvedHttpUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const content = new Uint8Array(arrayBuffer);
      
      let mimeType = response.headers.get('content-type') || 'application/octet-stream';
      mimeType = mimeType.split(';')[0].trim();
      
      if (mimeType === 'application/octet-stream') {
        mimeType = this.detectMimeTypeFromContent(content);
      }

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
      };
    } catch (error) {
      console.error('Error resolving UHRP URL:', error);
      throw {
        code: 'UHRP_RESOLUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        originalUrl: url
      } as UHRPError;
    }
  }

  private detectMimeTypeFromContent(content: Uint8Array): string {
    const bytes = content.slice(0, 12);
    
    // PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'application/pdf';
    }
    
    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'image/png';
    }
    
    // JPEG
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'image/jpeg';
    }
    
    // GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'image/gif';
    }
    
    // WebP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'image/webp';
    }
    
    // HTML
    const textContent = new TextDecoder().decode(bytes.slice(0, 100));
    if (textContent.toLowerCase().includes('<html') || textContent.toLowerCase().includes('<!doctype html')) {
      return 'text/html';
    }
    
    // JSON
    if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
      return 'application/json';
    }
    
    // Plain text (fallback for many text formats)
    if (this.isProbablyText(bytes)) {
      return 'text/plain';
    }
    
    return 'application/octet-stream';
  }

  private isProbablyText(bytes: Uint8Array): boolean {
    const sample = bytes.slice(0, 100);
    let textChars = 0;
    
    for (const byte of sample) {
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        textChars++;
      }
    }
    
    return textChars / sample.length > 0.7;
  }

  public contentToDataUrl(content: Uint8Array, mimeType: string): string {
    const base64 = btoa(String.fromCharCode(...content));
    return `data:${mimeType};base64,${base64}`;
  }

  public canDisplayInline(mimeType: string): boolean {
    const inlineTypes = [
      'text/html',
      'text/plain',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf'
    ];
    
    return inlineTypes.includes(mimeType) || mimeType.startsWith('image/') || mimeType.startsWith('text/');
  }
}

export const uhrpHandler = UHRPProtocolHandler.getInstance();

// Utility function to handle UHRP navigation
export function handleUHRPNavigation(url: string): boolean {
  if (!uhrpHandler.isUHRPUrl(url)) {
    return false;
  }
  
  console.log('🔗 [UHRP] Handling UHRP navigation:', url);
  
  // For now, we'll let the browser handle UHRP URLs
  // This function returns true to indicate that UHRP handling is available
  return true;
}
