/**
 * Enhanced Client-Side Error Handling
 * Provides comprehensive error handling for direct LLM API calls
 */

import { logger } from '~/utils';
import type { TMessage } from 'librechat-data-provider';

export interface EnhancedError {
  type: 'network' | 'auth' | 'rate_limit' | 'cors' | 'api' | 'unknown';
  message: string;
  userMessage: string;
  isRetriable: boolean;
  retryAfter?: number;
  technicalDetails?: any;
  suggestions?: string[];
}

export interface ErrorContext {
  endpoint: string;
  provider: string;
  model?: string;
  conversationId?: string;
  messageCount?: number;
}

/**
 * Enhanced error classification and handling
 */
export function classifyAndHandleError(
  error: any, 
  context: ErrorContext
): EnhancedError {
  logger.error('Classifying error:', { error, context });

  // Network errors
  if (error.name === 'NetworkError' || error.code === 'NETWORK_ERROR') {
    return {
      type: 'network',
      message: 'Network connection failed',
      userMessage: 'Unable to connect to the internet. Please check your connection and try again.',
      isRetriable: true,
      suggestions: [
        'Check your internet connection',
        'Try again in a few moments',
        'Switch to offline mode if available'
      ]
    };
  }

  // CORS errors
  if (error.message?.includes('CORS') || error.message?.includes('Cross-Origin')) {
    return {
      type: 'cors',
      message: `CORS error for provider ${context.provider}`,
      userMessage: `${context.provider} doesn't allow direct browser access. Using server proxy is recommended.`,
      isRetriable: false,
      technicalDetails: {
        provider: context.provider,
        endpoint: context.endpoint,
        corsPolicy: 'blocked'
      },
      suggestions: [
        'Switch to server storage mode for full compatibility',
        'Contact administrator about CORS configuration',
        'Use a different provider that supports browser access'
      ]
    };
  }

  // API key errors
  if (error.status === 401 || error.message?.includes('Unauthorized') || error.message?.includes('API key')) {
    return {
      type: 'auth',
      message: 'API key authentication failed',
      userMessage: 'There was an authentication issue. Please refresh and try again.',
      isRetriable: true,
      suggestions: [
        'Refresh the page to get a new API key',
        'Check if your account has sufficient permissions',
        'Contact administrator if problem persists'
      ]
    };
  }

  // Rate limiting errors
  if (error.status === 429 || error.message?.includes('rate limit')) {
    const retryAfter = error.headers?.get('retry-after') || 
                      error.response?.headers?.['retry-after'] || 60;
    
    return {
      type: 'rate_limit',
      message: 'Rate limit exceeded',
      userMessage: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
      isRetriable: true,
      retryAfter: parseInt(retryAfter, 10),
      suggestions: [
        `Wait ${retryAfter} seconds before retrying`,
        'Reduce the frequency of your requests',
        'Consider upgrading your API plan'
      ]
    };
  }

  // API errors with status codes
  if (error.status) {
    const statusMessages: Record<number, string> = {
      400: 'Invalid request format',
      403: 'Access forbidden',
      404: 'Service not found',
      500: 'Server error',
      502: 'Service temporarily unavailable',
      503: 'Service overloaded',
      504: 'Request timeout'
    };

    const message = statusMessages[error.status] || `HTTP ${error.status} error`;
    
    return {
      type: 'api',
      message,
      userMessage: `${context.provider} API error: ${message}. Please try again.`,
      isRetriable: [429, 500, 502, 503, 504].includes(error.status),
      technicalDetails: {
        status: error.status,
        provider: context.provider,
        endpoint: context.endpoint
      },
      suggestions: [
        'Try again in a few moments',
        'Check if the service is operational',
        'Switch to a different model if available'
      ]
    };
  }

  // Provider-specific errors
  if (error.error?.type || error.type) {
    const errorType = error.error?.type || error.type;
    const providerErrors: Record<string, EnhancedError> = {
      'invalid_request_error': {
        type: 'api',
        message: 'Invalid request to API',
        userMessage: 'The request format was invalid. Please try rephrasing your message.',
        isRetriable: false,
        suggestions: ['Try rephrasing your message', 'Use fewer special characters']
      },
      'context_length_exceeded': {
        type: 'api',
        message: 'Message too long for model context',
        userMessage: 'Your conversation is too long for this model. Please start a new conversation.',
        isRetriable: false,
        suggestions: ['Start a new conversation', 'Use a model with larger context window']
      }
    };

    if (providerErrors[errorType]) {
      return { ...providerErrors[errorType], technicalDetails: error };
    }
  }

  // Generic fallback
  return {
    type: 'unknown',
    message: error.message || 'Unknown error occurred',
    userMessage: 'An unexpected error occurred. Please try again.',
    isRetriable: true,
    technicalDetails: error,
    suggestions: [
      'Try again in a few moments',
      'Refresh the page if problem persists',
      'Contact support if error continues'
    ]
  };
}

/**
 * Retry logic with exponential backoff
 */
export class RetryManager {
  private retryCount = 0;
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second

  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      const enhancedError = classifyAndHandleError(error, context);
      
      if (!enhancedError.isRetriable || this.retryCount >= this.maxRetries) {
        throw enhancedError;
      }

      const delay = enhancedError.retryAfter 
        ? enhancedError.retryAfter * 1000 
        : this.baseDelay * Math.pow(2, this.retryCount);

      logger.warn(`Retrying operation (attempt ${this.retryCount + 1}/${this.maxRetries}) after ${delay}ms`, {
        error: enhancedError,
        context
      });

      this.retryCount++;
      await this.sleep(delay);
      
      return this.executeWithRetry(operation, context);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private reset(): void {
    this.retryCount = 0;
  }

  get canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  get currentAttempt(): number {
    return this.retryCount + 1;
  }
}

/**
 * Offline capability detection and management
 */
export class OfflineManager {
  private isOnline = navigator.onLine;
  private callbacks: ((online: boolean) => void)[] = [];

  constructor() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline = () => {
    this.isOnline = true;
    this.notifyCallbacks(true);
    logger.info('Connection restored - back online');
  };

  private handleOffline = () => {
    this.isOnline = false;
    this.notifyCallbacks(false);
    logger.warn('Connection lost - gone offline');
  };

  private notifyCallbacks(online: boolean) {
    this.callbacks.forEach(callback => callback(online));
  }

  public onStatusChange(callback: (online: boolean) => void) {
    this.callbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  public get online(): boolean {
    return this.isOnline;
  }

  public get offline(): boolean {
    return !this.isOnline;
  }

  public async waitForConnection(timeout = 30000): Promise<boolean> {
    if (this.isOnline) return true;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), timeout);
      
      const unsubscribe = this.onStatusChange((online) => {
        if (online) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  public dispose() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.callbacks = [];
  }
}

/**
 * Enhanced error display utility
 */
export function createUserFriendlyErrorMessage(
  error: EnhancedError,
  context: ErrorContext
): {
  title: string;
  message: string;
  suggestions: string[];
  canRetry: boolean;
  technicalDetails?: any;
} {
  const titles: Record<EnhancedError['type'], string> = {
    network: 'Connection Error',
    auth: 'Authentication Error', 
    rate_limit: 'Rate Limit Exceeded',
    cors: 'Provider Access Error',
    api: 'Service Error',
    unknown: 'Unexpected Error'
  };

  return {
    title: titles[error.type],
    message: error.userMessage,
    suggestions: error.suggestions || [],
    canRetry: error.isRetriable,
    technicalDetails: process.env.NODE_ENV === 'development' ? error.technicalDetails : undefined
  };
}

// Global error manager instance
export const globalOfflineManager = new OfflineManager();