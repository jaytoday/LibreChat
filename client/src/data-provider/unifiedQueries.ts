/**
 * Unified Query Hooks
 * Automatically routes to client or server queries based on storage mode
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useLocation } from 'react-router-dom';

import { useClientStorage } from '~/utils/storageMode';
import { useGetMessagesByConvoIdClient } from './Messages/clientQueries';
import { useGetMessagesByConvoId } from './Messages/queries';
import * as unifiedDataService from './unifiedDataService';
import { logger } from '~/utils';

/**
 * Unified messages query that routes to client or server based on storage mode
 */
export const useGetMessagesByConvoIdUnified = <TData = TMessage[]>(
  id: string,
  config?: UseQueryOptions<TMessage[], unknown, TData>,
): QueryObserverResult<TData> => {
  const isClientMode = useClientStorage();
  
  // Use appropriate hook based on storage mode
  const clientQuery = useGetMessagesByConvoIdClient(id, {
    ...config,
    enabled: isClientMode && (config?.enabled !== false),
  });
  
  const serverQuery = useGetMessagesByConvoId(id, {
    ...config,
    enabled: !isClientMode && (config?.enabled !== false),
  });
  
  // Return the appropriate query result
  return isClientMode ? clientQuery : serverQuery;
};

/**
 * Unified conversations query with fallback behavior
 */
export const useGetConversationsUnified = () => {
  const isClientMode = useClientStorage();
  
  return useQuery(
    [QueryKeys.allConversations, isClientMode ? 'client' : 'server'],
    async () => {
      logger.debug('Fetching conversations in unified mode, client:', isClientMode);
      const result = await unifiedDataService.getConversations();
      logger.debug('Retrieved conversations:', result.conversations.length);
      return result;
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    }
  );
};

/**
 * Hook to detect storage mode changes and invalidate queries
 */
export const useStorageModeSync = () => {
  const queryClient = useQueryClient();
  const isClientMode = useClientStorage();
  
  // This could be enhanced to listen for storage mode changes
  // and automatically invalidate/migrate data
  const syncStorageMode = () => {
    // Invalidate all queries when storage mode might have changed
    queryClient.invalidateQueries([QueryKeys.allConversations]);
    queryClient.invalidateQueries([QueryKeys.messages]);
    
    logger.debug('Storage mode synced, client mode:', isClientMode);
  };
  
  return { syncStorageMode, isClientMode };
};

/**
 * Unified query for getting a single conversation
 */
export const useGetConversationByIdUnified = (id: string) => {
  const isClientMode = useClientStorage();
  
  return useQuery(
    [QueryKeys.conversation, id, isClientMode ? 'client' : 'server'],
    async () => {
      if (!id || id === 'new') return null;
      
      logger.debug('Fetching conversation by ID in unified mode:', id);
      const result = await unifiedDataService.getConversationById(id);
      logger.debug('Retrieved conversation:', result?.title);
      return result;
    },
    {
      enabled: !!id && id !== 'new',
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );
};

export default {
  useGetMessagesByConvoIdUnified,
  useGetConversationsUnified,
  useGetConversationByIdUnified,
  useStorageModeSync,
};