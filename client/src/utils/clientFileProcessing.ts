/**
 * Client-Side File Processing
 * Handles file attachments for direct LLM API calls without server processing
 */

import { EModelEndpoint } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { logger } from '~/utils';

export interface ProcessedFile {
  originalFile: File;
  processedData: string | ArrayBuffer;
  mimeType: string;
  size: number;
  name: string;
  isImage: boolean;
  isDocument: boolean;
  thumbnailUrl?: string;
  error?: string;
}

export interface FileProcessingOptions {
  maxSize?: number; // Maximum file size in bytes
  allowedTypes?: string[]; // Allowed MIME types
  resizeImages?: boolean; // Resize images for efficiency
  maxImageDimension?: number; // Maximum image width/height
  enableThumbnails?: boolean; // Generate thumbnails for images
}

const DEFAULT_OPTIONS: FileProcessingOptions = {
  maxSize: 20 * 1024 * 1024, // 20MB default
  allowedTypes: [
    // Images
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
    // Code files
    'text/javascript',
    'text/typescript',
    'text/html',
    'text/css',
    'text/python',
  ],
  resizeImages: true,
  maxImageDimension: 2048,
  enableThumbnails: true,
};

/**
 * Main file processing service
 */
export class ClientFileProcessor {
  private options: FileProcessingOptions;

  constructor(options: Partial<FileProcessingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process a file for LLM consumption
   */
  async processFile(file: File): Promise<ProcessedFile> {
    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const isImage = file.type.startsWith('image/');
      const isDocument = !isImage;

      let processedData: string | ArrayBuffer;
      let thumbnailUrl: string | undefined;

      if (isImage) {
        const result = await this.processImage(file);
        processedData = result.data;
        thumbnailUrl = result.thumbnail;
      } else {
        processedData = await this.processDocument(file);
      }

      const processedFile: ProcessedFile = {
        originalFile: file,
        processedData,
        mimeType: file.type,
        size: file.size,
        name: file.name,
        isImage,
        isDocument,
        thumbnailUrl,
      };

      logger.debug('File processed successfully:', {
        name: file.name,
        size: file.size,
        type: file.type,
        isImage,
        isDocument,
      });

      return processedFile;
    } catch (error) {
      logger.error('File processing failed:', error);
      return {
        originalFile: file,
        processedData: '',
        mimeType: file.type,
        size: file.size,
        name: file.name,
        isImage: file.type.startsWith('image/'),
        isDocument: !file.type.startsWith('image/'),
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  /**
   * Process multiple files
   */
  async processFiles(files: File[]): Promise<ProcessedFile[]> {
    const results = await Promise.allSettled(
      files.map((file) => this.processFile(file))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          originalFile: files[index],
          processedData: '',
          mimeType: files[index].type,
          size: files[index].size,
          name: files[index].name,
          isImage: files[index].type.startsWith('image/'),
          isDocument: !files[index].type.startsWith('image/'),
          error: result.reason?.message || 'Processing failed',
        };
      }
    });
  }

  /**
   * Process image files with optional resizing
   */
  private async processImage(file: File): Promise<{
    data: string;
    thumbnail?: string;
  }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          let dataUrl = e.target?.result as string;
          let thumbnailUrl: string | undefined;

          if (this.options.resizeImages || this.options.enableThumbnails) {
            const img = new Image();
            img.onload = () => {
              try {
                // Create canvas for processing
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                  resolve({ data: dataUrl });
                  return;
                }

                // Calculate new dimensions
                const maxDim = this.options.maxImageDimension || 2048;
                let { width, height } = img;
                
                if (width > maxDim || height > maxDim) {
                  const ratio = Math.min(maxDim / width, maxDim / height);
                  width = Math.floor(width * ratio);
                  height = Math.floor(height * ratio);
                }

                // Resize main image
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                const resizedDataUrl = canvas.toDataURL(file.type, 0.8);

                // Generate thumbnail if enabled
                if (this.options.enableThumbnails) {
                  const thumbSize = 150;
                  const thumbRatio = Math.min(thumbSize / img.width, thumbSize / img.height);
                  const thumbWidth = Math.floor(img.width * thumbRatio);
                  const thumbHeight = Math.floor(img.height * thumbRatio);
                  
                  canvas.width = thumbWidth;
                  canvas.height = thumbHeight;
                  ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
                  thumbnailUrl = canvas.toDataURL(file.type, 0.6);
                }

                resolve({
                  data: resizedDataUrl,
                  thumbnail: thumbnailUrl,
                });
              } catch (error) {
                reject(error);
              }
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = dataUrl;
          } else {
            resolve({ data: dataUrl });
          }
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Process document files (text extraction)
   */
  private async processDocument(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const result = e.target?.result as string;
          
          // For text files, return content directly
          if (file.type.startsWith('text/') || file.type === 'application/json') {
            resolve(result);
            return;
          }

          // For binary files (like PDFs), return as base64 data URL
          if (file.type === 'application/pdf') {
            const base64 = btoa(result);
            resolve(`data:${file.type};base64,${base64}`);
            return;
          }

          // Default: try to read as text
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      
      // Read as text for text files, as binary string for others
      if (file.type.startsWith('text/') || file.type === 'application/json') {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    });
  }

  /**
   * Validate file before processing
   */
  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > (this.options.maxSize || DEFAULT_OPTIONS.maxSize!)) {
      return {
        valid: false,
        error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum allowed size (${Math.round((this.options.maxSize || DEFAULT_OPTIONS.maxSize!) / 1024 / 1024)}MB)`,
      };
    }

    // Check file type
    const allowedTypes = this.options.allowedTypes || DEFAULT_OPTIONS.allowedTypes!;
    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type '${file.type}' is not supported. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Get supported file types for a specific provider
   */
  static getSupportedTypes(provider: string): string[] {
    const providerSupport: Record<string, string[]> = {
      [EModelEndpoint.openAI]: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/json',
        'text/csv',
      ],
      [EModelEndpoint.anthropic]: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/markdown',
      ],
      [EModelEndpoint.google]: [
        'image/jpeg',
        'image/png',
        'text/plain',
        'application/pdf',
      ],
      [EModelEndpoint.azureOpenAI]: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
      ],
    };

    return providerSupport[provider] || DEFAULT_OPTIONS.allowedTypes!;
  }

  /**
   * Convert processed file to LLM format
   */
  static convertToLLMFormat(
    processedFile: ProcessedFile,
    provider: string
  ): any {
    if (processedFile.error) {
      throw new Error(`File processing error: ${processedFile.error}`);
    }

    const baseContent = {
      type: processedFile.isImage ? 'image_url' : 'text',
      name: processedFile.name,
      size: processedFile.size,
    };

    switch (provider) {
      case EModelEndpoint.openAI:
      case EModelEndpoint.azureOpenAI:
        if (processedFile.isImage) {
          return {
            ...baseContent,
            image_url: {
              url: processedFile.processedData as string,
            },
          };
        } else {
          return {
            ...baseContent,
            text: processedFile.processedData as string,
          };
        }

      case EModelEndpoint.anthropic:
        if (processedFile.isImage) {
          const base64Data = (processedFile.processedData as string).split(',')[1];
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: processedFile.mimeType,
              data: base64Data,
            },
          };
        } else {
          return {
            type: 'text',
            text: processedFile.processedData as string,
          };
        }

      case EModelEndpoint.google:
        if (processedFile.isImage) {
          const base64Data = (processedFile.processedData as string).split(',')[1];
          return {
            inlineData: {
              mimeType: processedFile.mimeType,
              data: base64Data,
            },
          };
        } else {
          return {
            text: processedFile.processedData as string,
          };
        }

      default:
        // Generic format
        return {
          type: processedFile.isImage ? 'image' : 'text',
          content: processedFile.processedData,
          mimeType: processedFile.mimeType,
          name: processedFile.name,
        };
    }
  }
}

// Create default instance
export const defaultFileProcessor = new ClientFileProcessor();

// Utility functions
export const processFile = (file: File) => defaultFileProcessor.processFile(file);
export const processFiles = (files: File[]) => defaultFileProcessor.processFiles(files);

export default ClientFileProcessor;