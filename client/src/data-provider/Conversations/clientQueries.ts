/**
 * Client-Side Conversation Queries
 * Replaces server-side conversation queries with local storage queries
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { 
  UseQueryOptions, 
  QueryObserverResult,
  UseInfiniteQueryOptions,
  UseMutationResult
} from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { 
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  createConversation,
  searchConversations
} from '~/data-provider/clientDataService';
import { logger } from '~/utils';

export const useGetConversationsClient = (
  config?: UseInfiniteQueryOptions<
    { conversations: TConversation[]; nextCursor?: string },
    unknown,
    { conversations: TConversation[]; nextCursor?: string }
  >
) => {
  return useInfiniteQuery(
    [QueryKeys.allConversations, 'client'],
    async ({ pageParam: cursor }) => {
      logger.debug('Fetching conversations from client storage, cursor:', cursor);
      const result = await getConversations(cursor);
      logger.debug('Retrieved conversations from client storage:', result.conversations.length);
      return result;
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      ...config,
    }
  );
};

export const useGetConversationByIdClient = <TData = TConversation | null>(
  id: string,
  config?: UseQueryOptions<TConversation | null, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<TConversation | null, unknown, TData>(
    [QueryKeys.conversation, id, 'client'],
    async () => {
      logger.debug('Fetching conversation from client storage:', id);
      const result = await getConversationById(id);
      logger.debug('Retrieved conversation from client storage:', result?.title);
      return result;
    },
    {
      enabled: !!id && id !== 'new',
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      ...config,
    },
  );
};

export const useCreateConversationClient = (): UseMutationResult<
  TConversation,
  unknown,
  Partial<TConversation>
> => {
  const queryClient = useQueryClient();
  
  return useMutation(
    async (conversationData: Partial<TConversation>) => {
      logger.debug('Creating conversation in client storage:', conversationData);
      const result = await createConversation(conversationData);
      logger.debug('Created conversation in client storage:', result.conversationId);
      return result;
    },
    {
      onSuccess: (newConversation) => {
        // Invalidate and refetch conversations list
        queryClient.invalidateQueries([QueryKeys.allConversations, 'client']);
        
        // Set the new conversation in the cache
        queryClient.setQueryData(
          [QueryKeys.conversation, newConversation.conversationId, 'client'],
          newConversation
        );
      },
      onError: (error) => {
        logger.error('Failed to create conversation:', error);
      }
    }
  );
};

export const useUpdateConversationClient = (): UseMutationResult<
  TConversation,
  unknown,
  TConversation
> => {
  const queryClient = useQueryClient();
  
  return useMutation(
    async (conversation: TConversation) => {
      logger.debug('Updating conversation in client storage:', conversation.conversationId);
      const result = await updateConversation(conversation);
      logger.debug('Updated conversation in client storage');
      return result;
    },
    {
      onSuccess: (updatedConversation) => {
        // Update the conversation in cache
        queryClient.setQueryData(
          [QueryKeys.conversation, updatedConversation.conversationId, 'client'],
          updatedConversation
        );
        
        // Invalidate conversations list to reflect changes
        queryClient.invalidateQueries([QueryKeys.allConversations, 'client']);
      },
      onError: (error) => {
        logger.error('Failed to update conversation:', error);
      }
    }
  );
};

export const useDeleteConversationClient = (): UseMutationResult<
  void,
  unknown,
  string
> => {
  const queryClient = useQueryClient();
  
  return useMutation(
    async (conversationId: string) => {
      logger.debug('Deleting conversation from client storage:', conversationId);
      await deleteConversation(conversationId);
      logger.debug('Deleted conversation from client storage');
    },
    {
      onSuccess: (_, conversationId) => {
        // Remove conversation from cache
        queryClient.removeQueries([QueryKeys.conversation, conversationId, 'client']);
        queryClient.removeQueries([QueryKeys.messages, conversationId, 'client']);
        
        // Invalidate conversations list
        queryClient.invalidateQueries([QueryKeys.allConversations, 'client']);
      },
      onError: (error) => {
        logger.error('Failed to delete conversation:', error);
      }
    }
  );
};

export const useSearchConversationsClient = (query: string) => {
  return useQuery(
    [QueryKeys.searchConversations, query, 'client'],
    async () => {
      if (!query.trim()) return [];
      logger.debug('Searching conversations in client storage:', query);
      const results = await searchConversations(query);
      logger.debug('Found conversations in search:', results.length);
      return results;
    },
    {
      enabled: query.trim().length > 0,
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000, // 2 minutes for search results
      cacheTime: 10 * 60 * 1000, // 10 minutes
    }
  );
};

export default {
  useGetConversationsClient,
  useGetConversationByIdClient,
  useCreateConversationClient,
  useUpdateConversationClient,
  useDeleteConversationClient,
  useSearchConversationsClient,
};