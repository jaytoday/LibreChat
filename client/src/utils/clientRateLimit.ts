/**
 * Client-Side Rate Limiting System
 * Prevents abuse and manages API usage limits
 */

import { logger } from '~/utils';

export interface RateLimitConfig {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  tokensPerHour?: number;
  tokensPerDay?: number;
  maxConcurrentRequests?: number;
}

export interface RateLimitInfo {
  provider: string;
  type: 'requests' | 'tokens';
  limit: number;
  used: number;
  remaining: number;
  resetTime: number;
  isBlocked: boolean;
}

export interface UsageWindow {
  timestamp: number;
  count: number;
  tokens?: number;
}

interface ProviderLimits {
  requests: {
    minute: UsageWindow[];
    hour: UsageWindow[];
    day: UsageWindow[];
  };
  tokens: {
    minute: UsageWindow[];
    hour: UsageWindow[];
    day: UsageWindow[];
  };
  concurrent: number;
}

const STORAGE_KEY = 'librechat_rate_limits';

/**
 * Client-side rate limiter
 */
export class ClientRateLimiter {
  private limits: Record<string, ProviderLimits> = {};
  private config: Record<string, RateLimitConfig> = {};

  constructor() {
    this.loadFromStorage();
    this.initializeCleanup();
  }

  /**
   * Set rate limits for a provider
   */
  setLimits(provider: string, config: RateLimitConfig): void {
    this.config[provider] = config;
    
    if (!this.limits[provider]) {
      this.limits[provider] = {
        requests: { minute: [], hour: [], day: [] },
        tokens: { minute: [], hour: [], day: [] },
        concurrent: 0,
      };
    }

    this.saveToStorage();
    logger.debug(`Rate limits set for ${provider}:`, config);
  }

  /**
   * Check if a request can be made
   */
  canMakeRequest(provider: string, estimatedTokens?: number): {
    allowed: boolean;
    blockedBy?: string;
    resetTime?: number;
    info: RateLimitInfo[];
  } {
    const providerConfig = this.config[provider];
    if (!providerConfig) {
      return { allowed: true, info: [] };
    }

    const now = Date.now();
    const info: RateLimitInfo[] = [];
    let blocked = false;
    let blockedBy: string | undefined;
    let resetTime: number | undefined;

    // Clean old entries
    this.cleanExpiredEntries(provider);

    const providerLimits = this.limits[provider];

    // Check concurrent requests
    if (providerConfig.maxConcurrentRequests && 
        providerLimits.concurrent >= providerConfig.maxConcurrentRequests) {
      blocked = true;
      blockedBy = `Concurrent requests limit (${providerConfig.maxConcurrentRequests})`;
    }

    // Check request limits
    const requestChecks = [
      { period: 'minute', limit: providerConfig.requestsPerMinute, window: providerLimits.requests.minute },
      { period: 'hour', limit: providerConfig.requestsPerHour, window: providerLimits.requests.hour },
      { period: 'day', limit: providerConfig.requestsPerDay, window: providerLimits.requests.day },
    ];

    for (const check of requestChecks) {
      if (check.limit) {
        const used = check.window.reduce((sum, w) => sum + w.count, 0);
        const remaining = Math.max(0, check.limit - used);
        
        info.push({
          provider,
          type: 'requests',
          limit: check.limit,
          used,
          remaining,
          resetTime: this.getResetTime(check.period),
          isBlocked: used >= check.limit,
        });

        if (used >= check.limit && !blocked) {
          blocked = true;
          blockedBy = `${check.period} request limit (${check.limit})`;
          resetTime = this.getResetTime(check.period);
        }
      }
    }

    // Check token limits
    if (estimatedTokens) {
      const tokenChecks = [
        { period: 'minute', limit: providerConfig.tokensPerMinute, window: providerLimits.tokens.minute },
        { period: 'hour', limit: providerConfig.tokensPerHour, window: providerLimits.tokens.hour },
        { period: 'day', limit: providerConfig.tokensPerDay, window: providerLimits.tokens.day },
      ];

      for (const check of tokenChecks) {
        if (check.limit) {
          const used = check.window.reduce((sum, w) => sum + (w.tokens || 0), 0);
          const remaining = Math.max(0, check.limit - used);
          
          info.push({
            provider,
            type: 'tokens',
            limit: check.limit,
            used,
            remaining,
            resetTime: this.getResetTime(check.period),
            isBlocked: used + estimatedTokens > check.limit,
          });

          if (used + estimatedTokens > check.limit && !blocked) {
            blocked = true;
            blockedBy = `${check.period} token limit (${check.limit})`;
            resetTime = this.getResetTime(check.period);
          }
        }
      }
    }

    return {
      allowed: !blocked,
      blockedBy,
      resetTime,
      info,
    };
  }

  /**
   * Record a request (call before making the request)
   */
  recordRequestStart(provider: string, estimatedTokens?: number): void {
    if (!this.limits[provider]) return;

    const now = Date.now();
    const providerLimits = this.limits[provider];

    // Increment concurrent requests
    providerLimits.concurrent++;

    // Record request
    const requestEntry: UsageWindow = {
      timestamp: now,
      count: 1,
      tokens: estimatedTokens,
    };

    providerLimits.requests.minute.push(requestEntry);
    providerLimits.requests.hour.push(requestEntry);
    providerLimits.requests.day.push(requestEntry);

    // Record estimated tokens if provided
    if (estimatedTokens) {
      const tokenEntry: UsageWindow = {
        timestamp: now,
        count: 1,
        tokens: estimatedTokens,
      };

      providerLimits.tokens.minute.push(tokenEntry);
      providerLimits.tokens.hour.push(tokenEntry);
      providerLimits.tokens.day.push(tokenEntry);
    }

    this.saveToStorage();
    logger.debug(`Recorded request for ${provider}, concurrent: ${providerLimits.concurrent}`);
  }

  /**
   * Record a request completion (call after request finishes)
   */
  recordRequestEnd(provider: string, actualTokens?: number): void {
    if (!this.limits[provider]) return;

    const providerLimits = this.limits[provider];

    // Decrement concurrent requests
    providerLimits.concurrent = Math.max(0, providerLimits.concurrent - 1);

    // Update token usage if we have actual token count
    if (actualTokens !== undefined) {
      const now = Date.now();
      
      // Find recent token entries and update them
      const updateWindow = (window: UsageWindow[]) => {
        // Update the most recent entry within the last 5 minutes
        const recentEntry = window
          .filter(entry => now - entry.timestamp < 5 * 60 * 1000)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
          
        if (recentEntry) {
          recentEntry.tokens = actualTokens;
        }
      };

      updateWindow(providerLimits.tokens.minute);
      updateWindow(providerLimits.tokens.hour);
      updateWindow(providerLimits.tokens.day);
    }

    this.saveToStorage();
    logger.debug(`Completed request for ${provider}, concurrent: ${providerLimits.concurrent}`);
  }

  /**
   * Get current usage information
   */
  getUsageInfo(provider: string): RateLimitInfo[] {
    const providerConfig = this.config[provider];
    const providerLimits = this.limits[provider];
    
    if (!providerConfig || !providerLimits) {
      return [];
    }

    this.cleanExpiredEntries(provider);

    const info: RateLimitInfo[] = [];

    // Request limits
    const requestChecks = [
      { period: 'minute', limit: providerConfig.requestsPerMinute, window: providerLimits.requests.minute },
      { period: 'hour', limit: providerConfig.requestsPerHour, window: providerLimits.requests.hour },
      { period: 'day', limit: providerConfig.requestsPerDay, window: providerLimits.requests.day },
    ];

    for (const check of requestChecks) {
      if (check.limit) {
        const used = check.window.reduce((sum, w) => sum + w.count, 0);
        info.push({
          provider,
          type: 'requests',
          limit: check.limit,
          used,
          remaining: Math.max(0, check.limit - used),
          resetTime: this.getResetTime(check.period),
          isBlocked: used >= check.limit,
        });
      }
    }

    // Token limits
    const tokenChecks = [
      { period: 'minute', limit: providerConfig.tokensPerMinute, window: providerLimits.tokens.minute },
      { period: 'hour', limit: providerConfig.tokensPerHour, window: providerLimits.tokens.hour },
      { period: 'day', limit: providerConfig.tokensPerDay, window: providerLimits.tokens.day },
    ];

    for (const check of tokenChecks) {
      if (check.limit) {
        const used = check.window.reduce((sum, w) => sum + (w.tokens || 0), 0);
        info.push({
          provider,
          type: 'tokens',
          limit: check.limit,
          used,
          remaining: Math.max(0, check.limit - used),
          resetTime: this.getResetTime(check.period),
          isBlocked: used >= check.limit,
        });
      }
    }

    return info;
  }

  /**
   * Get time until rate limit resets
   */
  private getResetTime(period: string): number {
    const now = new Date();
    
    switch (period) {
      case 'minute':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                       now.getHours(), now.getMinutes() + 1, 0, 0).getTime();
      
      case 'hour':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                       now.getHours() + 1, 0, 0, 0).getTime();
      
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 
                       0, 0, 0, 0).getTime();
      
      default:
        return now.getTime() + 60000; // 1 minute fallback
    }
  }

  /**
   * Clean expired entries from tracking windows
   */
  private cleanExpiredEntries(provider: string): void {
    if (!this.limits[provider]) return;

    const now = Date.now();
    const providerLimits = this.limits[provider];

    // Time windows in milliseconds
    const windows = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
    };

    // Clean request entries
    for (const [period, timeWindow] of Object.entries(windows)) {
      const requestWindow = providerLimits.requests[period as keyof typeof providerLimits.requests];
      providerLimits.requests[period as keyof typeof providerLimits.requests] = 
        requestWindow.filter(entry => now - entry.timestamp < timeWindow);

      const tokenWindow = providerLimits.tokens[period as keyof typeof providerLimits.tokens];
      providerLimits.tokens[period as keyof typeof providerLimits.tokens] = 
        tokenWindow.filter(entry => now - entry.timestamp < timeWindow);
    }
  }

  /**
   * Reset all limits for a provider
   */
  resetLimits(provider: string): void {
    if (this.limits[provider]) {
      this.limits[provider] = {
        requests: { minute: [], hour: [], day: [] },
        tokens: { minute: [], hour: [], day: [] },
        concurrent: 0,
      };
      this.saveToStorage();
      logger.info(`Reset rate limits for ${provider}`);
    }
  }

  /**
   * Get estimated wait time until request can be made
   */
  getWaitTime(provider: string, estimatedTokens?: number): number {
    const result = this.canMakeRequest(provider, estimatedTokens);
    
    if (result.allowed) {
      return 0;
    }

    return result.resetTime ? Math.max(0, result.resetTime - Date.now()) : 60000;
  }

  /**
   * Save limits to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        limits: this.limits,
        config: this.config,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save rate limits to storage:', error);
    }
  }

  /**
   * Load limits from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Only load recent data (within last day)
        if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          this.limits = data.limits || {};
          this.config = data.config || {};
          logger.debug('Loaded rate limits from storage');
        }
      }
    } catch (error) {
      logger.warn('Failed to load rate limits from storage:', error);
    }
  }

  /**
   * Initialize cleanup timer
   */
  private initializeCleanup(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      for (const provider of Object.keys(this.limits)) {
        this.cleanExpiredEntries(provider);
      }
      this.saveToStorage();
    }, 5 * 60 * 1000);
  }

  /**
   * Get all provider usage summaries
   */
  getAllUsage(): Record<string, RateLimitInfo[]> {
    const usage: Record<string, RateLimitInfo[]> = {};
    
    for (const provider of Object.keys(this.config)) {
      usage[provider] = this.getUsageInfo(provider);
    }
    
    return usage;
  }

  /**
   * Export usage data for analysis
   */
  exportUsageData(): any {
    return {
      config: this.config,
      limits: this.limits,
      timestamp: Date.now(),
    };
  }
}

// Default rate limit configurations for known providers
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  openAI: {
    requestsPerMinute: 3500,
    tokensPerMinute: 200000,
    requestsPerDay: 10000,
    maxConcurrentRequests: 10,
  },
  anthropic: {
    requestsPerMinute: 1000,
    tokensPerMinute: 40000,
    requestsPerDay: 5000,
    maxConcurrentRequests: 5,
  },
  google: {
    requestsPerMinute: 360,
    requestsPerDay: 1000,
    maxConcurrentRequests: 3,
  },
  azureOpenAI: {
    requestsPerMinute: 240,
    tokensPerMinute: 40000,
    maxConcurrentRequests: 8,
  },
};

// Global rate limiter instance
export const clientRateLimiter = new ClientRateLimiter();

// Initialize default limits
for (const [provider, limits] of Object.entries(DEFAULT_RATE_LIMITS)) {
  clientRateLimiter.setLimits(provider, limits);
}

export default clientRateLimiter;