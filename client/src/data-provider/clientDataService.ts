/**
 * Client-Side Data Service
 * Replaces server-side data calls with local storage operations
 */

import type { TMessage, TConversation } from 'librechat-data-provider';
import { Constants } from 'librechat-data-provider';
import { clientStorage } from '~/utils/clientStorage';

/**
 * Client-side implementation of getMessagesByConvoId
 * Replaces the server call with local storage retrieval
 */
export async function getMessagesByConvoId(conversationId: string): Promise<TMessage[]> {
  if (
    conversationId === Constants.NEW_CONVO ||
    conversationId === Constants.PENDING_CONVO
  ) {
    return Promise.resolve([]);
  }

  try {
    const messages = await clientStorage.getMessagesByConversationId(conversationId);
    return messages;
  } catch (error) {
    console.error('Failed to get messages from local storage:', error);
    return [];
  }
}

/**
 * Client-side implementation of getConversations
 */
export async function getConversations(cursor?: string): Promise<{
  conversations: TConversation[];
  nextCursor?: string;
}> {
  try {
    return await clientStorage.getConversations({ 
      cursor,
      limit: 25,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });
  } catch (error) {
    console.error('Failed to get conversations from local storage:', error);
    return { conversations: [] };
  }
}

/**
 * Client-side implementation of getConversationById
 */
export async function getConversationById(id: string): Promise<TConversation | null> {
  try {
    return await clientStorage.getConversation(id);
  } catch (error) {
    console.error('Failed to get conversation by ID from local storage:', error);
    return null;
  }
}

/**
 * Client-side implementation of updateConversation
 */
export async function updateConversation(
  conversation: TConversation
): Promise<TConversation> {
  try {
    const updatedConversation = {
      ...conversation,
      updatedAt: new Date().toISOString()
    };
    
    await clientStorage.storeConversation(updatedConversation);
    return updatedConversation;
  } catch (error) {
    console.error('Failed to update conversation in local storage:', error);
    throw error;
  }
}

/**
 * Client-side implementation of storeMessage
 * This would be called when messages are created/updated
 */
export async function storeMessage(message: TMessage): Promise<TMessage> {
  try {
    const messageToStore = {
      ...message,
      createdAt: message.createdAt || new Date().toISOString()
    };
    
    await clientStorage.storeMessage(messageToStore);
    return messageToStore;
  } catch (error) {
    console.error('Failed to store message in local storage:', error);
    throw error;
  }
}

/**
 * Client-side implementation of deleteConversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  try {
    await clientStorage.deleteConversation(conversationId);
  } catch (error) {
    console.error('Failed to delete conversation from local storage:', error);
    throw error;
  }
}

/**
 * Create a new conversation locally
 */
export async function createConversation(
  conversation: Partial<TConversation>
): Promise<TConversation> {
  try {
    const newConversation: TConversation = {
      conversationId: conversation.conversationId || crypto.randomUUID(),
      title: conversation.title || 'New Chat',
      endpoint: conversation.endpoint || 'openAI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...conversation
    };
    
    await clientStorage.storeConversation(newConversation);
    return newConversation;
  } catch (error) {
    console.error('Failed to create conversation in local storage:', error);
    throw error;
  }
}

/**
 * Search conversations locally (basic text search)
 */
export async function searchConversations(query: string): Promise<TConversation[]> {
  try {
    const { conversations } = await clientStorage.getConversations({ 
      limit: 1000 // Get more for searching
    });
    
    const lowerQuery = query.toLowerCase();
    return conversations.filter(conv => 
      conv.title?.toLowerCase().includes(lowerQuery) ||
      conv.model?.toLowerCase().includes(lowerQuery) ||
      conv.endpoint?.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    console.error('Failed to search conversations:', error);
    return [];
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  try {
    return await clientStorage.getStorageStats();
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return {
      conversationCount: 0,
      messageCount: 0,
      estimatedSizeBytes: 0
    };
  }
}

/**
 * Export all data for backup
 */
export async function exportAllData() {
  try {
    return await clientStorage.exportData();
  } catch (error) {
    console.error('Failed to export data:', error);
    throw error;
  }
}

/**
 * Import data from backup
 */
export async function importAllData(data: {
  conversations: TConversation[];
  messages: TMessage[];
  settings?: any;
}) {
  try {
    await clientStorage.importData(data);
  } catch (error) {
    console.error('Failed to import data:', error);
    throw error;
  }
}

/**
 * Clear all local data
 */
export async function clearAllLocalData(): Promise<void> {
  try {
    await clientStorage.clearAllData();
  } catch (error) {
    console.error('Failed to clear local data:', error);
    throw error;
  }
}

/**
 * Get storage settings
 */
export async function getStorageSettings() {
  try {
    return await clientStorage.getSettings();
  } catch (error) {
    console.error('Failed to get storage settings:', error);
    return {
      encryptionEnabled: false,
      backupEnabled: true,
      maxStorageSize: 100 * 1024 * 1024
    };
  }
}

/**
 * Update storage settings
 */
export async function updateStorageSettings(settings: any) {
  try {
    return await clientStorage.updateSettings(settings);
  } catch (error) {
    console.error('Failed to update storage settings:', error);
    throw error;
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
  clearAllLocalData,
  getStorageSettings,
  updateStorageSettings,
};