/**
 * useDirectLLM Hook
 * Replaces server SSE communication with direct client-to-LLM API calls
 */

import { useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { useSetRecoilState } from 'recoil';
import {
  Constants,
  LocalStorageKeys,
  EModelEndpoint,
  ContentTypes,
  isAssistantsEndpoint,
  isAgentsEndpoint,
} from 'librechat-data-provider';
import type { TMessage, TSubmission, EventSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { ChatMessage } from '~/data-provider/llm-direct';
import { callLLM, createStreamingCompletion } from '~/data-provider/llm-direct';
import { handleCORSError } from '~/utils/corsHelper';
import { useGenTitleMutation, useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { storeMessage, updateConversation } from '~/data-provider/clientDataService';
import { useAuthContext } from '~/hooks/AuthContext';
import useEventHandlers from './useEventHandlers';
import store from '~/store';

const clearDraft = (conversationId?: string | null) => {
  if (conversationId) {
    localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`);
    localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${conversationId}`);
  } else {
    localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.NEW_CONVO}`);
    localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.NEW_CONVO}`);
  }
};

type ChatHelpers = Pick<
  EventHandlerParams,
  | 'setMessages'
  | 'getMessages'
  | 'setConversation'
  | 'setIsSubmitting'
  | 'newConversation'
  | 'resetLatestMessage'
>;

/**
 * Convert TMessage array to ChatMessage format for LLM APIs
 */
function convertMessagesToLLMFormat(messages: TMessage[]): ChatMessage[] {
  return messages
    .filter(msg => msg.text && msg.text.trim()) // Filter out empty messages
    .map(msg => ({
      role: msg.isCreatedByUser ? 'user' as const : 'assistant' as const,
      content: getMessageContent(msg)
    }));
}

/**
 * Extract content from TMessage (handles both text and content array formats)
 */
function getMessageContent(message: TMessage): string {
  if (message.text) {
    return message.text;
  }
  
  if (message.content && Array.isArray(message.content)) {
    const textContent = message.content
      .filter(part => part.type === ContentTypes.TEXT)
      .map(part => part[ContentTypes.TEXT]?.value || '')
      .join('');
    return textContent;
  }
  
  return '';
}

/**
 * Check if endpoint/provider supports direct client calls
 */
function supportsDirectCalls(endpoint: string): boolean {
  const supportedEndpoints = [
    EModelEndpoint.openAI,
    EModelEndpoint.anthropic,
    EModelEndpoint.google,
    EModelEndpoint.azureOpenAI,
    // Note: Assistants and Agents may need special handling
  ];
  
  return supportedEndpoints.includes(endpoint as EModelEndpoint);
}

export default function useDirectLLM(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  isAddedRequest = false,
  runIndex = 0,
) {
  const genTitle = useGenTitleMutation();
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(runIndex));

  const { isAuthenticated } = useAuthContext();
  const [completed, setCompleted] = useState(new Set());
  const setAbortScroll = useSetRecoilState(store.abortScrollFamily(runIndex));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const {
    setMessages,
    getMessages,
    setConversation,
    setIsSubmitting,
    newConversation,
    resetLatestMessage,
  } = chatHelpers;

  const {
    clearStepMaps,
    finalHandler,
    errorHandler,
    messageHandler,
    createdHandler,
    abortConversation,
  } = useEventHandlers({
    genTitle,
    setMessages,
    getMessages,
    setCompleted,
    isAddedRequest,
    setConversation,
    setIsSubmitting,
    newConversation,
    setShowStopButton,
    resetLatestMessage,
  });

  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });

  useEffect(() => {
    if (!submission || Object.keys(submission).length === 0) {
      return;
    }

    const { userMessage, endpointOption, conversation, initialResponse } = submission;
    const endpoint = endpointOption.endpoint;

    // Check if this endpoint supports direct calls
    if (!supportsDirectCalls(endpoint)) {
      console.warn(`Direct calls not supported for endpoint: ${endpoint}. Falling back to server.`);
      // TODO: Could fallback to useSSE here if needed
      return;
    }

    // Handle special cases (assistants, agents) that might need server processing
    if (isAssistantsEndpoint(endpoint) || isAgentsEndpoint(endpoint)) {
      console.warn(`${endpoint} may require server processing. Consider using server proxy.`);
      // TODO: Implement direct assistants/agents calls or fallback
      return;
    }

    const handleDirectLLMCall = async () => {
      try {
        clearStepMaps();
        setIsSubmitting(true);
        setAbortScroll(false);

        // Create abort controller for cancellation
        const controller = new AbortController();
        setAbortController(controller);

        // Prepare messages for LLM call
        const allMessages = getMessages() || [];
        const llmMessages = convertMessagesToLLMFormat(allMessages);
        
        // Add current user message
        llmMessages.push({
          role: 'user',
          content: userMessage.text || ''
        });

        // Add system message if conversation has promptPrefix
        if (conversation?.promptPrefix) {
          llmMessages.unshift({
            role: 'system',
            content: conversation.promptPrefix
          });
        }

        const runId = v4();
        setActiveRunId(runId);

        // Simulate created event for UI consistency
        const createdData = {
          created: true,
          message: userMessage,
          conversationId: conversation?.conversationId || v4(),
        };
        createdHandler(createdData, submission as EventSubmission);

        // Create initial response message
        let updatedResponse = { ...initialResponse };
        let accumulatedText = '';

        const model = conversation?.model || 'gpt-3.5-turbo';

        // Check if we should stream the response
        const shouldStream = true; // Could be configurable

        if (shouldStream) {
          // Streaming response
          await createStreamingCompletion(
            endpoint,
            llmMessages,
            model,
            (chunk: string) => {
              if (controller.signal.aborted) {
                return;
              }

              accumulatedText += chunk;
              updatedResponse = {
                ...updatedResponse,
                text: accumulatedText,
                messageId: updatedResponse.messageId,
              };

              // Update content array format for consistency
              if (updatedResponse.content && Array.isArray(updatedResponse.content)) {
                updatedResponse.content[0] = {
                  type: ContentTypes.TEXT,
                  [ContentTypes.TEXT]: {
                    value: accumulatedText,
                  },
                };
              }

              // Simulate message event for real-time updates
              messageHandler(chunk, {
                ...submission,
                userMessage,
                initialResponse: updatedResponse,
              } as EventSubmission);
            },
            {
              temperature: endpointOption.temperature,
              max_tokens: endpointOption.max_tokens,
              // Add other options as needed
            }
          );
        } else {
          // Non-streaming response
          const response = await callLLM(endpoint, llmMessages, model, {
            temperature: endpointOption.temperature,
            max_tokens: endpointOption.max_tokens,
          });

          if (controller.signal.aborted) {
            return;
          }

          // Extract response text based on provider format
          let responseText = '';
          if (response.choices && response.choices[0]) {
            responseText = response.choices[0].message?.content || '';
          } else if (response.content && response.content[0]) {
            responseText = response.content[0].text || '';
          } else if (response.candidates && response.candidates[0]) {
            responseText = response.candidates[0].content?.parts?.[0]?.text || '';
          }

          updatedResponse = {
            ...updatedResponse,
            text: responseText,
            messageId: updatedResponse.messageId,
          };

          // Update content array format
          if (updatedResponse.content && Array.isArray(updatedResponse.content)) {
            updatedResponse.content[0] = {
              type: ContentTypes.TEXT,
              [ContentTypes.TEXT]: {
                value: responseText,
              },
            };
          }

          messageHandler(responseText, {
            ...submission,
            userMessage,
            initialResponse: updatedResponse,
          } as EventSubmission);
        }

        if (!controller.signal.aborted) {
          // Store messages locally
          try {
            // Store user message
            if (userMessage) {
              await storeMessage(userMessage);
            }
            
            // Store assistant response
            if (updatedResponse) {
              await storeMessage(updatedResponse);
            }
            
            // Update conversation with latest timestamp
            if (conversation) {
              await updateConversation({
                ...conversation,
                updatedAt: new Date().toISOString(),
                // Optionally update title based on content if this is the first message
                ...((!conversation.title || conversation.title === 'New Chat') && userMessage?.text && {
                  title: userMessage.text.slice(0, 50) + (userMessage.text.length > 50 ? '...' : '')
                })
              });
            }
          } catch (storageError) {
            console.error('Failed to store messages locally:', storageError);
            // Continue with the flow even if storage fails
          }
          
          // Clear draft and handle completion
          clearDraft(conversation?.conversationId);
          
          // Simulate final event
          const finalData = {
            final: true,
            conversation: conversation,
            responseMessage: updatedResponse,
            requestMessage: userMessage,
          };

          finalHandler(finalData, submission as EventSubmission);
          (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();

          console.log('Direct LLM call completed', finalData);
        }

      } catch (error) {
        console.error('Direct LLM call failed:', error);
        
        // Handle CORS-specific errors with helpful messages
        const corsError = handleCORSError(error as Error, endpoint);
        
        const errorMessage = corsError.isCORSError 
          ? corsError.userMessage 
          : (error instanceof Error ? error.message : 'Unknown error occurred');
        
        const errorData = {
          message: errorMessage,
          conversationId: conversation?.conversationId,
          corsError: corsError.isCORSError,
          technicalDetails: corsError.isCORSError ? corsError.technicalDetails : undefined,
        };

        console.error('Error details:', errorData);

        errorHandler({ 
          data: errorData, 
          submission: { ...submission, userMessage } as EventSubmission 
        });
      } finally {
        setIsSubmitting(false);
        setAbortController(null);
      }
    };

    handleDirectLLMCall();

    // Cleanup function
    return () => {
      if (abortController) {
        abortController.abort();
        setAbortController(null);
      }
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);

  // Handle abort/cancel
  useEffect(() => {
    const handleAbort = async () => {
      if (abortController) {
        abortController.abort();
        
        const latestMessages = getMessages();
        const conversationId = latestMessages?.[latestMessages.length - 1]?.conversationId;
        
        if (conversationId && submission) {
          await abortConversation(
            conversationId,
            submission as EventSubmission,
            latestMessages,
          );
        }
      }
    };

    // Listen for cancel events (could be triggered by stop button)
    const handleCancel = () => {
      handleAbort();
    };

    // You might want to expose this through a context or callback
    // For now, store it in a way the stop button can access it
    if (submission) {
      (window as any).cancelDirectLLM = handleCancel;
    }

    return () => {
      delete (window as any).cancelDirectLLM;
    };
  }, [abortController, getMessages, submission]);
}

export { useDirectLLM };