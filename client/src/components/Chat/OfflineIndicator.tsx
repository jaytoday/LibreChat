/**
 * Offline Indicator Component
 * Shows when the user is offline and using client-side storage
 */

import { useState, useEffect } from 'react';
import { globalOfflineManager } from '~/utils/clientErrorHandling';
import { cn } from '~/utils';

interface OfflineIndicatorProps {
  className?: string;
  variant?: 'banner' | 'badge';
  showDetails?: boolean;
}

export default function OfflineIndicator({
  className,
  variant = 'banner',
  showDetails = false,
}: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isVisible, setIsVisible] = useState(!navigator.onLine);

  useEffect(() => {
    const unsubscribe = globalOfflineManager.onStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        // Delay hiding to show "back online" message briefly
        setTimeout(() => setIsVisible(false), 2000);
      } else {
        setIsVisible(true);
      }
    });

    return unsubscribe;
  }, []);

  if (!isVisible) return null;

  if (variant === 'badge') {
    return (
      <div className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs',
        isOnline 
          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        className
      )}>
        <div className={cn(
          'mr-1 h-1.5 w-1.5 rounded-full',
          isOnline ? 'bg-green-500' : 'bg-red-500'
        )} />
        {isOnline ? 'Online' : 'Offline'}
      </div>
    );
  }

  return (
    <div className={cn(
      'border-b border-border-light bg-surface-secondary px-4 py-2',
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className={cn(
            'mr-2 h-2 w-2 rounded-full',
            isOnline ? 'bg-green-500' : 'bg-red-500'
          )} />
          <span className="text-sm font-medium text-text-primary">
            {isOnline ? 'Connection restored' : 'You\'re offline'}
          </span>
          {showDetails && !isOnline && (
            <span className="ml-2 text-xs text-text-secondary">
              You can view saved conversations but can't send new messages
            </span>
          )}
        </div>
        
        {!isOnline && (
          <button
            onClick={() => setIsVisible(false)}
            className="text-text-tertiary hover:text-text-primary ml-2 text-xs underline"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}