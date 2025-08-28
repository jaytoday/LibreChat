import { memo, useCallback, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import { useChatHelpers, useAddedResponse, useSSE } from '~/hooks';
import { useDirectLLM } from '~/hooks/SSE/useDirectLLM';
import ConversationStarters from './Input/ConversationStarters';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useGetMessagesByConvoIdUnified } from '~/data-provider/unifiedQueries';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import { buildTree, cn } from '~/utils';
import { globalOfflineManager } from '~/utils/clientErrorHandling';
import { useClientStorage } from '~/utils/storageMode';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import ErrorBoundary from './ErrorBoundary';
import OfflineIndicator from './OfflineIndicator';
import store from '~/store';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function OfflineMessage() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full flex-col items-center justify-center">
        <div className="mb-4 text-6xl">📱</div>
        <h3 className="mb-2 text-lg font-semibold text-text-primary">You're Offline</h3>
        <p className="text-text-secondary mb-4 text-center">
          You can still view your saved conversations, but you won't be able to send new messages until you're back online.
        </p>
        <div className="flex items-center text-sm text-text-tertiary">
          <div className="mr-2 h-2 w-2 rounded-full bg-red-500"></div>
          No internet connection
        </div>
      </div>
    </div>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const addedSubmission = useRecoilValue(store.submissionByIndex(index + 1));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isClientMode = useClientStorage();
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasError, setHasError] = useState(false);

  const fileMap = useFileMapContext();

  // Monitor online/offline status
  useEffect(() => {
    const unsubscribe = globalOfflineManager.onStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        setHasError(false); // Clear errors when back online
      }
    });

    return unsubscribe;
  }, []);

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoIdUnified(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const dataTree = buildTree({ messages: data, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [fileMap],
    ),
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse({ rootIndex: index });

  // Determine if we should use direct LLM calls or fallback to server SSE
  const useDirectCalls = (submission: any) => {
    if (!submission?.endpointOption?.endpoint) return false;
    
    const endpoint = submission.endpointOption.endpoint;
    const directSupportedEndpoints = [
      EModelEndpoint.openAI,
      EModelEndpoint.anthropic,
      EModelEndpoint.google,
      EModelEndpoint.azureOpenAI,
    ];
    
    return directSupportedEndpoints.includes(endpoint);
  };

  // Use direct LLM calls for supported providers, fallback to SSE for others
  const shouldUseDirectRoot = useDirectCalls(rootSubmission);
  const shouldUseDirectAdded = useDirectCalls(addedSubmission);

  // Root submission handling
  if (shouldUseDirectRoot) {
    useDirectLLM(rootSubmission, chatHelpers, false);
  } else {
    useSSE(rootSubmission, chatHelpers, false);
  }

  // Added submission handling  
  if (shouldUseDirectAdded) {
    useDirectLLM(addedSubmission, addedChatHelpers, true);
  } else {
    useSSE(addedSubmission, addedChatHelpers, true);
  }

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;

  // Handle offline state
  if (!isOnline && isClientMode && !isLandingPage) {
    content = <OfflineMessage />;
  } else if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  return (
    <ErrorBoundary onError={setHasError}>
      <ChatFormProvider {...methods}>
        <ChatContext.Provider value={chatHelpers}>
          <AddedChatContext.Provider value={addedChatHelpers}>
            <Presentation>
              <div className="flex h-full w-full flex-col">
                {!isLoading && (
                  <>
                    <Header />
                    {!isOnline && isClientMode && <OfflineIndicator />}
                  </>
                )}
                <>
                  <div
                    className={cn(
                      'flex flex-col',
                      isLandingPage
                        ? 'flex-1 items-center justify-end sm:justify-center'
                        : 'h-full overflow-y-auto',
                    )}
                  >
                    {content}
                    <div
                      className={cn(
                        'w-full',
                        isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                      )}
                    >
                      <ChatForm index={index} disabled={!isOnline && isClientMode} />
                      {isLandingPage ? <ConversationStarters /> : <Footer />}
                    </div>
                  </div>
                  {isLandingPage && <Footer />}
                </>
              </div>
            </Presentation>
          </AddedChatContext.Provider>
        </ChatContext.Provider>
      </ChatFormProvider>
    </ErrorBoundary>
  );
}

export default memo(ChatView);
