/**
 * React Hooks for Rate Limiting
 */

import { useState, useEffect, useCallback } from 'react';
import { clientRateLimiter } from '~/utils/clientRateLimit';
import type { RateLimitInfo, RateLimitConfig } from '~/utils/clientRateLimit';
import { logger } from '~/utils';

/**
 * Hook for checking and managing rate limits
 */
export const useRateLimit = (provider: string) => {
  const [usageInfo, setUsageInfo] = useState<RateLimitInfo[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [waitTime, setWaitTime] = useState(0);

  const updateInfo = useCallback(() => {
    const info = clientRateLimiter.getUsageInfo(provider);
    setUsageInfo(info);
    setIsBlocked(info.some(i => i.isBlocked));
  }, [provider]);

  useEffect(() => {
    updateInfo();
    
    // Update info every 30 seconds
    const interval = setInterval(updateInfo, 30000);
    return () => clearInterval(interval);
  }, [updateInfo]);

  const canMakeRequest = useCallback((estimatedTokens?: number) => {
    const result = clientRateLimiter.canMakeRequest(provider, estimatedTokens);
    setIsBlocked(!result.allowed);
    
    if (!result.allowed && result.resetTime) {
      setWaitTime(result.resetTime - Date.now());
    } else {
      setWaitTime(0);
    }
    
    return result;
  }, [provider]);

  const recordRequest = useCallback((estimatedTokens?: number) => {
    clientRateLimiter.recordRequestStart(provider, estimatedTokens);
    updateInfo();
  }, [provider, updateInfo]);

  const recordCompletion = useCallback((actualTokens?: number) => {
    clientRateLimiter.recordRequestEnd(provider, actualTokens);
    updateInfo();
  }, [provider, updateInfo]);

  const resetLimits = useCallback(() => {
    clientRateLimiter.resetLimits(provider);
    updateInfo();
  }, [provider, updateInfo]);

  const getWaitTime = useCallback((estimatedTokens?: number) => {
    return clientRateLimiter.getWaitTime(provider, estimatedTokens);
  }, [provider]);

  return {
    usageInfo,
    isBlocked,
    waitTime,
    canMakeRequest,
    recordRequest,
    recordCompletion,
    resetLimits,
    getWaitTime,
    refresh: updateInfo,
  };
};

/**
 * Hook for managing rate limit configurations
 */
export const useRateLimitConfig = () => {
  const setLimits = useCallback((provider: string, config: RateLimitConfig) => {
    clientRateLimiter.setLimits(provider, config);
  }, []);

  const getAllUsage = useCallback(() => {
    return clientRateLimiter.getAllUsage();
  }, []);

  const exportData = useCallback(() => {
    return clientRateLimiter.exportUsageData();
  }, []);

  return {
    setLimits,
    getAllUsage,
    exportData,
  };
};

/**
 * Hook for automatically handling rate-limited requests
 */
export const useRateLimitedRequest = <T>(
  provider: string,
  requestFn: () => Promise<T>,
  options: {
    estimatedTokens?: number;
    maxRetries?: number;
    retryDelay?: number;
    onRateLimited?: (waitTime: number) => void;
    onRetry?: (attempt: number, waitTime: number) => void;
  } = {}
) => {
  const { canMakeRequest, recordRequest, recordCompletion, getWaitTime } = useRateLimit(provider);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const {
    estimatedTokens,
    maxRetries = 3,
    retryDelay = 1000,
    onRateLimited,
    onRetry,
  } = options;

  const execute = useCallback(async (): Promise<T> => {
    setIsLoading(true);
    setError(null);

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Check rate limits
        const rateLimitCheck = canMakeRequest(estimatedTokens);
        
        if (!rateLimitCheck.allowed) {
          const waitTime = getWaitTime(estimatedTokens);
          
          if (attempt === 0) {
            onRateLimited?.(waitTime);
          }

          if (attempt < maxRetries - 1) {
            const delayTime = Math.min(waitTime, 60000); // Max 1 minute wait
            onRetry?.(attempt + 1, delayTime);
            
            await new Promise(resolve => setTimeout(resolve, delayTime));
            attempt++;
            continue;
          } else {
            throw new Error(
              `Rate limit exceeded for ${provider}. ${rateLimitCheck.blockedBy}. Wait ${Math.ceil(waitTime / 1000)} seconds.`
            );
          }
        }

        // Record request start
        recordRequest(estimatedTokens);

        // Make the actual request
        const result = await requestFn();

        // Record completion (you may want to extract actual token count from result)
        recordCompletion();

        setIsLoading(false);
        return result;

      } catch (error) {
        // Record completion even on error
        recordCompletion();

        if (attempt < maxRetries - 1 && (
          (error as any).status === 429 || // Rate limited by server
          (error as Error).message.includes('rate limit')
        )) {
          const delayTime = retryDelay * Math.pow(2, attempt); // Exponential backoff
          onRetry?.(attempt + 1, delayTime);
          
          await new Promise(resolve => setTimeout(resolve, delayTime));
          attempt++;
          continue;
        }

        setError(error as Error);
        setIsLoading(false);
        throw error;
      }
    }

    throw new Error(`Request failed after ${maxRetries} attempts`);
  }, [
    canMakeRequest,
    recordRequest,
    recordCompletion,
    getWaitTime,
    requestFn,
    estimatedTokens,
    maxRetries,
    retryDelay,
    onRateLimited,
    onRetry,
    provider,
  ]);

  return {
    execute,
    isLoading,
    error,
  };
};

/**
 * Hook for displaying rate limit status
 */
export const useRateLimitStatus = (providers: string[]) => {
  const [allUsage, setAllUsage] = useState<Record<string, RateLimitInfo[]>>({});
  const [blockedProviders, setBlockedProviders] = useState<string[]>([]);

  const updateStatus = useCallback(() => {
    const usage: Record<string, RateLimitInfo[]> = {};
    const blocked: string[] = [];

    for (const provider of providers) {
      const info = clientRateLimiter.getUsageInfo(provider);
      usage[provider] = info;
      
      if (info.some(i => i.isBlocked)) {
        blocked.push(provider);
      }
    }

    setAllUsage(usage);
    setBlockedProviders(blocked);
  }, [providers]);

  useEffect(() => {
    updateStatus();
    
    // Update every minute
    const interval = setInterval(updateStatus, 60000);
    return () => clearInterval(interval);
  }, [updateStatus]);

  const getProviderStatus = useCallback((provider: string) => {
    const info = allUsage[provider] || [];
    const isBlocked = info.some(i => i.isBlocked);
    const nextReset = Math.min(...info.map(i => i.resetTime).filter(Boolean));
    
    return {
      isBlocked,
      usage: info,
      nextResetTime: nextReset || 0,
      timeUntilReset: nextReset ? Math.max(0, nextReset - Date.now()) : 0,
    };
  }, [allUsage]);

  return {
    allUsage,
    blockedProviders,
    getProviderStatus,
    refresh: updateStatus,
  };
};

export default {
  useRateLimit,
  useRateLimitConfig,
  useRateLimitedRequest,
  useRateLimitStatus,
};