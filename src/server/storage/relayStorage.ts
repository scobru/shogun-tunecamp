/**
 * Shogun Relay Storage Layer
 * Handles file uploads to shogun-relay (IPFS/S3 backend)
 */

import { ShogunRelaySDK } from 'shogun-relay-sdk';

export interface RelayStorageOptions {
  relayUrl: string;
  apiKey: string;
}

export interface UploadResult {
  success: boolean;
  cid?: string;
  hash?: string;
  url?: string;
  error?: string;
}

export class RelayStorage {
  private sdk: any;
  private relayUrl: string;
  private apiKey: string;

  constructor(options: RelayStorageOptions) {
    this.relayUrl = options.relayUrl;
    this.apiKey = options.apiKey;

    // Initialize SDK - use 'token' instead of 'apiKey' for ApiClientConfig
    this.sdk = new ShogunRelaySDK({
      baseURL: this.relayUrl,
      token: this.apiKey, // ApiClientConfig uses 'token', not 'apiKey'
    });

    console.log(`🔗 Relay Storage initialized: ${this.relayUrl}`);
  }

  /**
   * Upload file to relay (IPFS)
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    contentType: string,
    userAddress?: string
  ): Promise<UploadResult> {
    try {
      const result = await this.sdk.ipfs.uploadFile(fileBuffer, filename, contentType, {
        userAddress,
        // For admin/API key auth, we use the API key
        // The SDK will handle authentication via Authorization header
      });

      if (result.success && result.cid) {
        return {
          success: true,
          cid: result.cid,
          hash: result.hash || result.cid,
          url: `${this.relayUrl}/api/v1/ipfs/cat/${result.cid}`,
        };
      }

      return {
        success: false,
        error: result.error || 'Upload failed',
      };
    } catch (error: any) {
      console.error('Relay upload error:', error);
      return {
        success: false,
        error: error.message || 'Upload failed',
      };
    }
  }

  /**
   * Get file URL from CID
   */
  getFileUrl(cid: string): string {
    return `${this.relayUrl}/api/v1/ipfs/cat/${cid}`;
  }

  /**
   * Download file from relay
   */
  async downloadFile(cid: string): Promise<Buffer | null> {
    try {
      const buffer = await this.sdk.ipfs.cat(cid);
      return buffer;
    } catch (error: any) {
      console.error('Relay download error:', error);
      return null;
    }
  }

  /**
   * Save file metadata to system hash map
   */
  async saveFileMetadata(metadata: {
    hash: string;
    userAddress?: string;
    fileName?: string;
    displayName?: string;
    originalName?: string;
    fileSize?: number;
    contentType?: string;
    isEncrypted?: boolean;
    relayUrl?: string;
    uploadedAt?: number;
  }): Promise<boolean> {
    try {
      const result = await this.sdk.uploads.saveSystemHash({
        ...metadata,
        relayUrl: metadata.relayUrl || this.relayUrl,
      });

      return result.success === true;
    } catch (error: any) {
      console.error('Relay metadata save error:', error);
      return false;
    }
  }
}
