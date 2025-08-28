/**
 * Direct LLM API Client
 * Handles client-side LLM API calls using provisioned keys from the server
 */

import * as endpoints from './api-endpoints';
import request from './request';
import { EModelEndpoint } from 'librechat-data-provider';
import { corsAwareFetch, getRequestHeaders, handleCORSError } from '~/utils/corsHelper';
import type { ProcessedFile } from '~/utils/clientFileProcessing';
import { ClientFileProcessor } from '~/utils/clientFileProcessing';

interface ProvisionedKey {
  provider: string;
  purpose: string;
  provisioned: boolean;
  expiresAt: number;
  apiKey: string;
  baseUrl: string;
  apiVersion?: string;
  deployment?: string;
  instanceName?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url' | 'image';
    text?: string;
    image_url?: { url: string };
    source?: { type: string; media_type: string; data: string };
    inlineData?: { mimeType: string; data: string };
  }>;
  attachments?: ProcessedFile[];
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: any;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Cache for provisioned keys (with expiration)
const keyCache = new Map<string, { key: ProvisionedKey; expiresAt: number }>();

/**
 * Process messages with file attachments for specific providers
 */
function processMessagesWithAttachments(
  messages: ChatMessage[],
  provider: string
): ChatMessage[] {
  return messages.map(message => {
    if (!message.attachments || message.attachments.length === 0) {
      return message;
    }

    // Convert attachments to provider-specific format
    const attachmentContent = message.attachments.map(file =>
      ClientFileProcessor.convertToLLMFormat(file, provider)
    );

    // Combine text and attachments based on provider
    let content: any;
    
    switch (provider) {
      case EModelEndpoint.openAI:
      case EModelEndpoint.azureOpenAI:
        content = [
          { type: 'text', text: typeof message.content === 'string' ? message.content : '' },
          ...attachmentContent
        ];
        break;

      case EModelEndpoint.anthropic:
        content = [
          { type: 'text', text: typeof message.content === 'string' ? message.content : '' },
          ...attachmentContent
        ];
        break;

      case EModelEndpoint.google:
        // Google handles attachments differently in the parts array
        content = [
          { text: typeof message.content === 'string' ? message.content : '' },
          ...attachmentContent
        ];
        break;

      default:
        content = message.content;
        break;
    }

    return {
      ...message,
      content,
      attachments: undefined, // Remove original attachments after processing
    };
  });
}

/**
 * Request a fresh API key from the server for the given provider
 */
async function provisionApiKey(provider: string, purpose = 'chat'): Promise<ProvisionedKey> {
  const cacheKey = `${provider}-${purpose}`;
  
  // Check if we have a valid cached key
  const cached = keyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  // Request new key from server
  const provisionedKey = await request.post(endpoints.provisionApiKey(), {
    provider,
    purpose
  });

  // Cache the key with expiration
  keyCache.set(cacheKey, {
    key: provisionedKey,
    expiresAt: provisionedKey.expiresAt
  });

  return provisionedKey;
}

/**
 * Make a direct API call to OpenAI
 */
async function callOpenAI(
  messages: ChatMessage[],
  model: string,
  options: Partial<ChatCompletionRequest> = {}
): Promise<ChatCompletionResponse> {
  const key = await provisionApiKey(EModelEndpoint.openAI);
  
  // Process messages with attachments
  const processedMessages = processMessagesWithAttachments(messages, EModelEndpoint.openAI);
  
  const requestBody: ChatCompletionRequest = {
    model,
    messages: processedMessages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1000,
    ...options
  };

  const headers = getRequestHeaders(EModelEndpoint.openAI, key.apiKey);
  
  const response = await corsAwareFetch(
    `${key.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    },
    EModelEndpoint.openAI
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Make a direct API call to Anthropic Claude
 */
async function callAnthropic(
  messages: ChatMessage[],
  model: string,
  options: any = {}
): Promise<any> {
  const key = await provisionApiKey(EModelEndpoint.anthropic);
  
  // Process messages with attachments
  const processedMessages = processMessagesWithAttachments(messages, EModelEndpoint.anthropic);
  
  // Convert messages to Anthropic format
  const anthropicMessages = processedMessages.filter(m => m.role !== 'system');
  const systemMessage = processedMessages.find(m => m.role === 'system');
  
  const requestBody = {
    model,
    max_tokens: options.max_tokens || 1000,
    messages: anthropicMessages,
    ...(systemMessage && { system: systemMessage.content }),
    ...options
  };

  const headers = getRequestHeaders(EModelEndpoint.anthropic, key.apiKey);
  
  const response = await corsAwareFetch(
    `${key.baseUrl}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    },
    EModelEndpoint.anthropic
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API Error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Make a direct API call to Google Gemini
 */
async function callGoogle(
  messages: ChatMessage[],
  model: string,
  options: any = {}
): Promise<any> {
  const key = await provisionApiKey(EModelEndpoint.google);
  
  // Process messages with attachments
  const processedMessages = processMessagesWithAttachments(messages, EModelEndpoint.google);
  
  // Convert messages to Google format
  const contents = processedMessages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(msg.content) ? msg.content : [{ text: msg.content as string }]
  }));

  const requestBody = {
    contents,
    generationConfig: {
      temperature: options.temperature || 0.7,
      maxOutputTokens: options.max_tokens || 1000,
    }
  };

  const headers = getRequestHeaders(EModelEndpoint.google, key.apiKey);
  
  const response = await corsAwareFetch(
    `${key.baseUrl}/models/${model}:generateContent?key=${key.apiKey}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    },
    EModelEndpoint.google
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google API Error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Make a direct API call to Azure OpenAI
 */
async function callAzureOpenAI(
  messages: ChatMessage[],
  model: string,
  options: Partial<ChatCompletionRequest> = {}
): Promise<ChatCompletionResponse> {
  const key = await provisionApiKey(EModelEndpoint.azureOpenAI);
  
  // Process messages with attachments
  const processedMessages = processMessagesWithAttachments(messages, EModelEndpoint.azureOpenAI);
  
  const requestBody: ChatCompletionRequest = {
    model,
    messages: processedMessages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1000,
    ...options
  };

  const url = `${key.baseUrl}?api-version=${key.apiVersion}`;
  
  const headers = getRequestHeaders(EModelEndpoint.azureOpenAI, key.apiKey);
  
  const response = await corsAwareFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  }, EModelEndpoint.azureOpenAI);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Azure OpenAI API Error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Generic LLM call dispatcher
 */
export async function callLLM(
  provider: string,
  messages: ChatMessage[],
  model: string,
  options: any = {}
): Promise<any> {
  switch (provider) {
    case EModelEndpoint.openAI:
    case EModelEndpoint.assistants:
      return callOpenAI(messages, model, options);
    
    case EModelEndpoint.anthropic:
      return callAnthropic(messages, model, options);
    
    case EModelEndpoint.google:
      return callGoogle(messages, model, options);
    
    case EModelEndpoint.azureOpenAI:
    case EModelEndpoint.azureAssistants:
      return callAzureOpenAI(messages, model, options);
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Create a streaming chat completion
 */
export async function createStreamingCompletion(
  provider: string,
  messages: ChatMessage[],
  model: string,
  onChunk: (chunk: string) => void,
  options: any = {}
): Promise<void> {
  const key = await provisionApiKey(provider);
  
  // For now, implement streaming for OpenAI as example
  if (provider === EModelEndpoint.openAI || provider === EModelEndpoint.assistants) {
    const requestBody = {
      model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1000,
      stream: true,
      ...options
    };

    const headers = getRequestHeaders(provider, key.apiKey);
    
    const response = await corsAwareFetch(
      `${key.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      },
      provider
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  } else {
    // For non-streaming providers, fall back to regular completion
    const response = await callLLM(provider, messages, model, options);
    
    // Simulate streaming by sending the response in chunks
    const content = response.choices?.[0]?.message?.content || 
                   response.content?.[0]?.text || 
                   response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Split content into words and send progressively
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      setTimeout(() => {
        onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
      }, i * 50); // 50ms delay between words
    }
  }
}

/**
 * Clear the key cache (useful for testing or after errors)
 */
export function clearKeyCache(): void {
  keyCache.clear();
}

export type { ChatMessage, ChatCompletionRequest, ChatCompletionResponse };