/**
 * Client-Side Message Queries
 * Replaces server-side message queries with local storage queries
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { getMessagesByConvoId } from '~/data-provider/clientDataService';
import { logger } from '~/utils';

export const useGetMessagesByConvoIdClient = <TData = TMessage[]>(
  id: string,
  config?: UseQueryOptions<TMessage[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  
  return useQuery<TMessage[], unknown, TData>(
    [QueryKeys.messages, id, 'client'], // Add 'client' to differentiate from server queries
    async () => {
      logger.debug('Fetching messages from client storage for conversation:', id);
      const result = await getMessagesByConvoId(id);
      logger.debug('Retrieved messages from client storage:', result.length, 'messages');
      return result;
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, 
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      ...config,
    },
  );
};

export default {
  useGetMessagesByConvoIdClient,
};