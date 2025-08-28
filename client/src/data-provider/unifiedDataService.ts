/**
 * Unified Data Service
 * Routes data operations to client or server storage based on configuration
 */

import type { TMessage, TConversation } from 'librechat-data-provider';
import { useClientStorage } from '~/utils/storageMode';
import * as clientDataService from './clientDataService';
import { dataService } from 'librechat-data-provider';

/**
 * Get messages by conversation ID from appropriate storage
 */
export async function getMessagesByConvoId(conversationId: string): Promise<TMessage[]> {
  if (useClientStorage()) {
    return clientDataService.getMessagesByConvoId(conversationId);
  } else {
    return dataService.getMessagesByConvoId(conversationId);
  }
}

/**
 * Get conversations with pagination
 */
export async function getConversations(cursor?: string): Promise<{
  conversations: TConversation[];
  nextCursor?: string;
}> {
  if (useClientStorage()) {
    return clientDataService.getConversations(cursor);
  } else {
    // Convert server response format to match client format
    const serverResponse = await dataService.getConversations(cursor || '');
    return {
      conversations: serverResponse.conversations || [],
      nextCursor: serverResponse.pageNumber ? String(serverResponse.pageNumber + 1) : undefined
    };
  }
}

/**
 * Get conversation by ID
 */
export async function getConversationById(id: string): Promise<TConversation | null> {
  if (useClientStorage()) {
    return clientDataService.getConversationById(id);
  } else {
    try {
      return await dataService.getConversationById(id);
    } catch (error) {
      console.error('Failed to get conversation by ID from server:', error);
      return null;
    }
  }
}

/**
 * Update conversation
 */
export async function updateConversation(conversation: TConversation): Promise<TConversation> {
  if (useClientStorage()) {
    return clientDataService.updateConversation(conversation);
  } else {
    const updateRequest = {
      conversationId: conversation.conversationId!,
      title: conversation.title,
      model: conversation.model,
      promptPrefix: conversation.promptPrefix,
      // Add other updatable fields as needed
    };
    
    const response = await dataService.updateConversation(updateRequest);
    return response.conversation;
  }
}

/**
 * Store/create message
 */
export async function storeMessage(message: TMessage): Promise<TMessage> {
  if (useClientStorage()) {
    return clientDataService.storeMessage(message);
  } else {
    // For server mode, messages are typically stored through the chat endpoints
    // This might not be directly called, but we'll implement it for completeness
    console.warn('Direct message storage not typically used in server mode');
    return message;
  }
}

/**
 * Delete conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  if (useClientStorage()) {
    return clientDataService.deleteConversation(conversationId);
  } else {
    await dataService.deleteConversation({ conversationId, source: 'button' });
  }
}

/**
 * Create new conversation
 */
export async function createConversation(conversation: Partial<TConversation>): Promise<TConversation> {
  if (useClientStorage()) {
    return clientDataService.createConversation(conversation);
  } else {
    // Server-side conversation creation is typically handled during the first message
    // For now, we'll create a local representation
    const newConversation: TConversation = {
      conversationId: conversation.conversationId || crypto.randomUUID(),
      title: conversation.title || 'New Chat',
      endpoint: conversation.endpoint || 'openAI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...conversation
    };
    
    return newConversation;
  }
}

/**
 * Search conversations
 */
export async function searchConversations(query: string): Promise<TConversation[]> {
  if (useClientStorage()) {
    return clientDataService.searchConversations(query);
  } else {
    // Server-side search would need to be implemented
    // For now, return empty array
    console.warn('Server-side conversation search not implemented');
    return [];
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  conversationCount: number;
  messageCount: number;
  estimatedSizeBytes: number;
}> {
  if (useClientStorage()) {
    return clientDataService.getStorageStats();
  } else {
    // Server-side stats would need to be implemented
    return {
      conversationCount: 0,
      messageCount: 0,
      estimatedSizeBytes: 0
    };
  }
}

/**
 * Export data for backup
 */
export async function exportAllData(): Promise<{
  conversations: TConversation[];
  messages: TMessage[];
  settings?: any;
  exportDate: string;
  storageMode: string;
}> {
  if (useClientStorage()) {
    const data = await clientDataService.exportAllData();
    return {
      ...data,
      storageMode: 'client'
    };
  } else {
    // Server-side export would need to be implemented
    // For now, return empty data
    return {
      conversations: [],
      messages: [],
      exportDate: new Date().toISOString(),
      storageMode: 'server'
    };
  }
}

/**
 * Import data from backup
 */
export async function importAllData(data: {
  conversations: TConversation[];
  messages: TMessage[];
  settings?: any;
}): Promise<void> {
  if (useClientStorage()) {
    return clientDataService.importAllData(data);
  } else {
    // Server-side import would need to be implemented
    console.warn('Server-side data import not implemented');
  }
}

/**
 * Clear all data
 */
export async function clearAllData(): Promise<void> {
  if (useClientStorage()) {
    return clientDataService.clearAllLocalData();
  } else {
    // Server-side clear would need careful implementation
    console.warn('Server-side data clear not implemented for safety');
  }
}

export default {
  getMessagesByConvoId,
  getConversations,
  getConversationById,
  updateConversation,
  storeMessage,
  deleteConversation,
  createConversation,
  searchConversations,
  getStorageStats,
  exportAllData,
  importAllData,
  clearAllData,
};