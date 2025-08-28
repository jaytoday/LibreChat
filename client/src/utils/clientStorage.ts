/**
 * Client-Side Storage System for LibreChat
 * Handles local storage of conversations and messages with encryption
 * Uses IndexedDB for better performance with large datasets
 */

import { openDB, IDBPDatabase, IDBPTransaction } from 'idb';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import type { TMessage, TConversation } from 'librechat-data-provider';

const DB_NAME = 'LibreChat';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const MESSAGES_STORE = 'messages';
const SETTINGS_STORE = 'settings';

interface StoredConversation extends TConversation {
  encryptedAt?: number;
  lastAccessed?: number;
  syncStatus?: 'local' | 'synced' | 'conflict';
}

interface StoredMessage extends TMessage {
  encryptedAt?: number;
  syncStatus?: 'local' | 'synced' | 'conflict';
}

interface EncryptedData {
  data: string;
  iv: string;
  timestamp: number;
}

interface StorageSettings {
  encryptionEnabled: boolean;
  backupEnabled: boolean;
  masterKeyHash?: string;
  lastBackup?: number;
  maxStorageSize?: number;
}

class ClientStorage {
  private db: IDBPDatabase | null = null;
  private encryptionKey: string | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeStorage();
  }

  /**
   * Initialize the IndexedDB database
   */
  private async initializeStorage(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Conversations store
          if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
            const convosStore = db.createObjectStore(CONVERSATIONS_STORE, {
              keyPath: 'conversationId'
            });
            convosStore.createIndex('createdAt', 'createdAt');
            convosStore.createIndex('updatedAt', 'updatedAt');
            convosStore.createIndex('title', 'title');
            convosStore.createIndex('endpoint', 'endpoint');
            convosStore.createIndex('lastAccessed', 'lastAccessed');
          }

          // Messages store
          if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
            const messagesStore = db.createObjectStore(MESSAGES_STORE, {
              keyPath: 'messageId'
            });
            messagesStore.createIndex('conversationId', 'conversationId');
            messagesStore.createIndex('createdAt', 'createdAt');
            messagesStore.createIndex('parentMessageId', 'parentMessageId');
            messagesStore.createIndex('isCreatedByUser', 'isCreatedByUser');
          }

          // Settings store
          if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
          }
        }
      });

      await this.initializeEncryption();
      this.isInitialized = true;
      console.log('Client storage initialized successfully');
    } catch (error) {
      console.error('Failed to initialize client storage:', error);
      throw error;
    }
  }

  /**
   * Initialize encryption settings
   */
  private async initializeEncryption(): Promise<void> {
    try {
      const settings = await this.getSettings();
      
      if (!settings.encryptionEnabled) {
        // Set up encryption by default
        const masterKey = CryptoJS.lib.WordArray.random(256/8).toString();
        this.encryptionKey = masterKey;
        
        await this.updateSettings({
          ...settings,
          encryptionEnabled: true,
          masterKeyHash: CryptoJS.SHA256(masterKey).toString(),
        });
      } else if (settings.masterKeyHash) {
        // Try to retrieve the master key (in a real implementation, this would be derived from a user password)
        const storedKey = localStorage.getItem('librechat_master_key');
        if (storedKey && CryptoJS.SHA256(storedKey).toString() === settings.masterKeyHash) {
          this.encryptionKey = storedKey;
        } else {
          // Generate a new key if the stored one is invalid
          const masterKey = CryptoJS.lib.WordArray.random(256/8).toString();
          this.encryptionKey = masterKey;
          localStorage.setItem('librechat_master_key', masterKey);
          
          await this.updateSettings({
            ...settings,
            masterKeyHash: CryptoJS.SHA256(masterKey).toString(),
          });
        }
      }
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      // Continue without encryption if it fails
      this.encryptionKey = null;
    }
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(data: any): EncryptedData {
    if (!this.encryptionKey) {
      throw new Error('Encryption not available');
    }

    const dataString = JSON.stringify(data);
    const iv = CryptoJS.lib.WordArray.random(16).toString();
    const encrypted = CryptoJS.AES.encrypt(dataString, this.encryptionKey, {
      iv: CryptoJS.enc.Hex.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    return {
      data: encrypted.toString(),
      iv,
      timestamp: Date.now()
    };
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedData: EncryptedData): any {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const decrypted = CryptoJS.AES.decrypt(encryptedData.data, this.encryptionKey, {
      iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const dataString = decrypted.toString(CryptoJS.enc.Utf8);
    return JSON.parse(dataString);
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initializeStorage();
    }
  }

  /**
   * Get storage settings
   */
  async getSettings(): Promise<StorageSettings> {
    await this.ensureInitialized();
    
    try {
      const settings = await this.db!.get(SETTINGS_STORE, 'global');
      return settings?.value || {
        encryptionEnabled: false,
        backupEnabled: true,
        maxStorageSize: 100 * 1024 * 1024, // 100MB default
      };
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {
        encryptionEnabled: false,
        backupEnabled: true,
        maxStorageSize: 100 * 1024 * 1024,
      };
    }
  }

  /**
   * Update storage settings
   */
  async updateSettings(settings: StorageSettings): Promise<void> {
    await this.ensureInitialized();
    
    await this.db!.put(SETTINGS_STORE, {
      key: 'global',
      value: settings,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Store a conversation
   */
  async storeConversation(conversation: TConversation): Promise<void> {
    await this.ensureInitialized();
    
    const now = Date.now();
    const storedConversation: StoredConversation = {
      ...conversation,
      lastAccessed: now,
      syncStatus: 'local',
      updatedAt: conversation.updatedAt || new Date().toISOString(),
    };

    // Encrypt sensitive content if encryption is enabled
    const settings = await this.getSettings();
    if (settings.encryptionEnabled && this.encryptionKey) {
      try {
        const sensitiveData = {
          promptPrefix: conversation.promptPrefix,
          title: conversation.title,
        };
        const encrypted = this.encrypt(sensitiveData);
        storedConversation.encryptedData = encrypted;
        storedConversation.encryptedAt = now;
        
        // Remove sensitive data from the main object
        delete storedConversation.promptPrefix;
        delete storedConversation.title;
      } catch (error) {
        console.warn('Failed to encrypt conversation, storing without encryption:', error);
      }
    }

    await this.db!.put(CONVERSATIONS_STORE, storedConversation);
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<TConversation | null> {
    await this.ensureInitialized();
    
    try {
      const stored = await this.db!.get(CONVERSATIONS_STORE, conversationId) as StoredConversation;
      if (!stored) {
        return null;
      }

      // Update last accessed time
      stored.lastAccessed = Date.now();
      await this.db!.put(CONVERSATIONS_STORE, stored);

      // Decrypt sensitive data if it exists
      if (stored.encryptedData && this.encryptionKey) {
        try {
          const decrypted = this.decrypt(stored.encryptedData);
          return {
            ...stored,
            ...decrypted,
            encryptedData: undefined,
            encryptedAt: undefined,
          };
        } catch (error) {
          console.warn('Failed to decrypt conversation data:', error);
        }
      }

      return stored as TConversation;
    } catch (error) {
      console.error('Failed to get conversation:', error);
      return null;
    }
  }

  /**
   * Get all conversations with pagination
   */
  async getConversations(options: {
    cursor?: string;
    limit?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'lastAccessed';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ conversations: TConversation[]; nextCursor?: string }> {
    await this.ensureInitialized();
    
    const { limit = 25, sortBy = 'updatedAt', sortOrder = 'desc' } = options;
    
    try {
      const transaction = this.db!.transaction(CONVERSATIONS_STORE, 'readonly');
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      const index = store.index(sortBy);
      
      const conversations: TConversation[] = [];
      let cursor = await index.openCursor(null, sortOrder === 'desc' ? 'prev' : 'next');
      let count = 0;
      let shouldStart = !options.cursor;
      
      while (cursor && count < limit) {
        const stored = cursor.value as StoredConversation;
        
        // Handle cursor-based pagination
        if (!shouldStart && stored.conversationId === options.cursor) {
          shouldStart = true;
          cursor = await cursor.continue();
          continue;
        }
        
        if (shouldStart) {
          // Decrypt if needed
          let conversation: TConversation = stored;
          if (stored.encryptedData && this.encryptionKey) {
            try {
              const decrypted = this.decrypt(stored.encryptedData);
              conversation = {
                ...stored,
                ...decrypted,
                encryptedData: undefined,
                encryptedAt: undefined,
              };
            } catch (error) {
              console.warn('Failed to decrypt conversation in list:', error);
            }
          }
          
          conversations.push(conversation);
          count++;
        }
        
        cursor = await cursor.continue();
      }
      
      return {
        conversations,
        nextCursor: cursor ? cursor.value.conversationId : undefined,
      };
    } catch (error) {
      console.error('Failed to get conversations:', error);
      return { conversations: [] };
    }
  }

  /**
   * Store a message
   */
  async storeMessage(message: TMessage): Promise<void> {
    await this.ensureInitialized();
    
    const storedMessage: StoredMessage = {
      ...message,
      syncStatus: 'local',
      createdAt: message.createdAt || new Date().toISOString(),
    };

    // Encrypt sensitive content if encryption is enabled
    const settings = await this.getSettings();
    if (settings.encryptionEnabled && this.encryptionKey) {
      try {
        const sensitiveData = {
          text: message.text,
          content: message.content,
        };
        const encrypted = this.encrypt(sensitiveData);
        storedMessage.encryptedData = encrypted;
        storedMessage.encryptedAt = Date.now();
        
        // Remove sensitive data from the main object
        delete storedMessage.text;
        delete storedMessage.content;
      } catch (error) {
        console.warn('Failed to encrypt message, storing without encryption:', error);
      }
    }

    await this.db!.put(MESSAGES_STORE, storedMessage);
  }

  /**
   * Get messages by conversation ID
   */
  async getMessagesByConversationId(conversationId: string): Promise<TMessage[]> {
    await this.ensureInitialized();
    
    try {
      const transaction = this.db!.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const index = store.index('conversationId');
      
      const messages: TMessage[] = [];
      let cursor = await index.openCursor(IDBKeyRange.only(conversationId));
      
      while (cursor) {
        const stored = cursor.value as StoredMessage;
        
        // Decrypt if needed
        let message: TMessage = stored;
        if (stored.encryptedData && this.encryptionKey) {
          try {
            const decrypted = this.decrypt(stored.encryptedData);
            message = {
              ...stored,
              ...decrypted,
              encryptedData: undefined,
              encryptedAt: undefined,
            };
          } catch (error) {
            console.warn('Failed to decrypt message:', error);
          }
        }
        
        messages.push(message);
        cursor = await cursor.continue();
      }
      
      // Sort messages by creation time
      return messages.sort((a, b) => 
        new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime()
      );
    } catch (error) {
      console.error('Failed to get messages:', error);
      return [];
    }
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    
    try {
      // Delete conversation
      await transaction.objectStore(CONVERSATIONS_STORE).delete(conversationId);
      
      // Delete all messages in the conversation
      const messagesStore = transaction.objectStore(MESSAGES_STORE);
      const messagesIndex = messagesStore.index('conversationId');
      let cursor = await messagesIndex.openCursor(IDBKeyRange.only(conversationId));
      
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      
      await transaction.complete;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }

  /**
   * Clear all stored data
   */
  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    
    try {
      await transaction.objectStore(CONVERSATIONS_STORE).clear();
      await transaction.objectStore(MESSAGES_STORE).clear();
      await transaction.complete;
      
      // Also clear localStorage keys
      localStorage.removeItem('librechat_master_key');
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    conversationCount: number;
    messageCount: number;
    estimatedSizeBytes: number;
  }> {
    await this.ensureInitialized();
    
    try {
      const [conversationCount, messageCount] = await Promise.all([
        this.db!.count(CONVERSATIONS_STORE),
        this.db!.count(MESSAGES_STORE),
      ]);
      
      // Rough estimate of storage size (not exact)
      const estimatedSizeBytes = (conversationCount * 1000) + (messageCount * 500);
      
      return {
        conversationCount,
        messageCount,
        estimatedSizeBytes,
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        conversationCount: 0,
        messageCount: 0,
        estimatedSizeBytes: 0,
      };
    }
  }

  /**
   * Export data for backup
   */
  async exportData(): Promise<{
    conversations: TConversation[];
    messages: TMessage[];
    settings: StorageSettings;
    exportDate: string;
  }> {
    await this.ensureInitialized();
    
    const [conversationsData, settings] = await Promise.all([
      this.getConversations({ limit: 10000 }), // Get all conversations
      this.getSettings(),
    ]);
    
    // Get all messages for all conversations
    const allMessages: TMessage[] = [];
    for (const conversation of conversationsData.conversations) {
      const messages = await this.getMessagesByConversationId(conversation.conversationId!);
      allMessages.push(...messages);
    }
    
    return {
      conversations: conversationsData.conversations,
      messages: allMessages,
      settings,
      exportDate: new Date().toISOString(),
    };
  }

  /**
   * Import data from backup
   */
  async importData(data: {
    conversations: TConversation[];
    messages: TMessage[];
    settings?: StorageSettings;
  }): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    
    try {
      // Import conversations
      for (const conversation of data.conversations) {
        await this.storeConversation(conversation);
      }
      
      // Import messages
      for (const message of data.messages) {
        await this.storeMessage(message);
      }
      
      // Import settings if provided
      if (data.settings) {
        await this.updateSettings(data.settings);
      }
      
      await transaction.complete;
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }
}

// Singleton instance
export const clientStorage = new ClientStorage();

export default clientStorage;