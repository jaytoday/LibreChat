/**
 * Server Backup Service
 * Handles optional encrypted backup to server for hybrid storage mode
 */

import CryptoJS from 'crypto-js';
import type { TMessage, TConversation } from 'librechat-data-provider';
import { clientStorage } from '~/utils/clientStorage';
import { supportsServerBackup } from '~/utils/storageMode';
import request from './request';

interface BackupData {
  conversations: TConversation[];
  messages: TMessage[];
  settings: any;
  backupDate: string;
  version: string;
}

interface EncryptedBackup {
  data: string;
  iv: string;
  timestamp: number;
  checksum: string;
}

class ServerBackupService {
  private backupKey: string | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeBackupKey();
  }

  /**
   * Initialize backup encryption key
   */
  private async initializeBackupKey(): Promise<void> {
    try {
      // Get or generate backup key
      let key = localStorage.getItem('librechat_backup_key');
      if (!key) {
        key = CryptoJS.lib.WordArray.random(256/8).toString();
        localStorage.setItem('librechat_backup_key', key);
      }
      this.backupKey = key;
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize backup key:', error);
    }
  }

  /**
   * Encrypt backup data
   */
  private encryptBackup(data: BackupData): EncryptedBackup {
    if (!this.backupKey) {
      throw new Error('Backup key not initialized');
    }

    const dataString = JSON.stringify(data);
    const iv = CryptoJS.lib.WordArray.random(16).toString();
    const encrypted = CryptoJS.AES.encrypt(dataString, this.backupKey, {
      iv: CryptoJS.enc.Hex.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const checksum = CryptoJS.SHA256(dataString).toString();

    return {
      data: encrypted.toString(),
      iv,
      timestamp: Date.now(),
      checksum
    };
  }

  /**
   * Decrypt backup data
   */
  private decryptBackup(encryptedBackup: EncryptedBackup): BackupData {
    if (!this.backupKey) {
      throw new Error('Backup key not initialized');
    }

    const decrypted = CryptoJS.AES.decrypt(encryptedBackup.data, this.backupKey, {
      iv: CryptoJS.enc.Hex.parse(encryptedBackup.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const dataString = decrypted.toString(CryptoJS.enc.Utf8);
    const data = JSON.parse(dataString);

    // Verify checksum
    const checksum = CryptoJS.SHA256(dataString).toString();
    if (checksum !== encryptedBackup.checksum) {
      throw new Error('Backup data integrity check failed');
    }

    return data;
  }

  /**
   * Check if server backup is enabled and available
   */
  async canBackup(): Promise<boolean> {
    if (!supportsServerBackup() || !this.isInitialized) {
      return false;
    }

    try {
      // Check if backup endpoint is available
      const response = await fetch('/api/backup/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        }
      });
      return response.ok;
    } catch (error) {
      console.warn('Server backup not available:', error);
      return false;
    }
  }

  /**
   * Create encrypted backup on server
   */
  async createBackup(): Promise<{ success: boolean; backupId?: string; error?: string }> {
    if (!(await this.canBackup())) {
      return { success: false, error: 'Server backup not available' };
    }

    try {
      // Get all local data
      const localData = await clientStorage.exportData();
      
      const backupData: BackupData = {
        ...localData,
        version: '1.0.0'
      };

      // Encrypt the backup
      const encryptedBackup = this.encryptBackup(backupData);

      // Send to server
      const response = await request.post('/api/backup', {
        backup: encryptedBackup,
        metadata: {
          conversationCount: localData.conversations.length,
          messageCount: localData.messages.length,
          clientVersion: '1.0.0'
        }
      });

      return {
        success: true,
        backupId: response.backupId
      };

    } catch (error) {
      console.error('Failed to create server backup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Restore data from encrypted server backup
   */
  async restoreBackup(backupId?: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.canBackup())) {
      return { success: false, error: 'Server backup not available' };
    }

    try {
      // Get backup from server
      const url = backupId ? `/api/backup/${backupId}` : '/api/backup/latest';
      const encryptedBackup = await request.get(url);

      // Decrypt backup
      const backupData = this.decryptBackup(encryptedBackup);

      // Import data to local storage
      await clientStorage.importData(backupData);

      return { success: true };

    } catch (error) {
      console.error('Failed to restore server backup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{
    id: string;
    date: string;
    conversationCount: number;
    messageCount: number;
  }>> {
    if (!(await this.canBackup())) {
      return [];
    }

    try {
      const backups = await request.get('/api/backup/list');
      return backups || [];
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Delete server backup
   */
  async deleteBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.canBackup())) {
      return { success: false, error: 'Server backup not available' };
    }

    try {
      await request.delete(`/api/backup/${backupId}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete backup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Auto-backup with configurable intervals
   */
  async scheduleAutoBackup(intervalMinutes = 60): Promise<void> {
    if (!(await this.canBackup())) {
      return;
    }

    const backupInterval = intervalMinutes * 60 * 1000;
    
    setInterval(async () => {
      try {
        const result = await this.createBackup();
        if (result.success) {
          console.log('Auto-backup completed:', result.backupId);
        } else {
          console.warn('Auto-backup failed:', result.error);
        }
      } catch (error) {
        console.error('Auto-backup error:', error);
      }
    }, backupInterval);

    console.log(`Auto-backup scheduled every ${intervalMinutes} minutes`);
  }

  /**
   * Sync local changes to server backup
   */
  async syncChanges(): Promise<{ success: boolean; error?: string }> {
    if (!(await this.canBackup())) {
      return { success: false, error: 'Server backup not available' };
    }

    try {
      // Check if local data has changed since last backup
      const settings = await clientStorage.getSettings();
      const lastBackup = settings.lastBackup || 0;
      
      // Simple check - you could implement more sophisticated change detection
      const stats = await clientStorage.getStorageStats();
      if (Date.now() - lastBackup < 5 * 60 * 1000) { // 5 minutes
        return { success: true }; // No sync needed
      }

      // Create new backup
      const result = await this.createBackup();
      
      if (result.success) {
        // Update last backup timestamp
        await clientStorage.updateSettings({
          ...settings,
          lastBackup: Date.now()
        });
      }

      return result;

    } catch (error) {
      console.error('Failed to sync changes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const serverBackupService = new ServerBackupService();

export default serverBackupService;