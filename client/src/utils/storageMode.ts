/**
 * Storage Mode Configuration
 * Allows switching between client-side and server-side storage
 */

export enum StorageMode {
  CLIENT_ONLY = 'client_only',
  SERVER_ONLY = 'server_only',
  HYBRID = 'hybrid', // Use client-side with optional server backup
}

const STORAGE_MODE_KEY = 'librechat_storage_mode';
const DEFAULT_STORAGE_MODE = StorageMode.CLIENT_ONLY;

/**
 * Get current storage mode from localStorage
 */
export function getStorageMode(): StorageMode {
  try {
    const stored = localStorage.getItem(STORAGE_MODE_KEY);
    return (stored as StorageMode) || DEFAULT_STORAGE_MODE;
  } catch (error) {
    console.warn('Failed to get storage mode from localStorage:', error);
    return DEFAULT_STORAGE_MODE;
  }
}

/**
 * Set storage mode in localStorage
 */
export function setStorageMode(mode: StorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    console.log('Storage mode set to:', mode);
  } catch (error) {
    console.error('Failed to set storage mode:', error);
  }
}

/**
 * Check if current mode uses client-side storage
 */
export function useClientStorage(): boolean {
  const mode = getStorageMode();
  return mode === StorageMode.CLIENT_ONLY || mode === StorageMode.HYBRID;
}

/**
 * Check if current mode uses server-side storage
 */
export function useServerStorage(): boolean {
  const mode = getStorageMode();
  return mode === StorageMode.SERVER_ONLY || mode === StorageMode.HYBRID;
}

/**
 * Check if current mode supports server backup
 */
export function supportsServerBackup(): boolean {
  const mode = getStorageMode();
  return mode === StorageMode.HYBRID;
}

/**
 * Get user preference for storage mode with fallback
 */
export function getPreferredStorageMode(): {
  mode: StorageMode;
  description: string;
  features: string[];
} {
  const mode = getStorageMode();
  
  switch (mode) {
    case StorageMode.CLIENT_ONLY:
      return {
        mode,
        description: 'All data stored locally in your browser with encryption',
        features: [
          'Complete privacy - server never sees your messages',
          'Offline access to conversations',
          'Fast loading with no network requests',
          'Client-side encryption for sensitive data'
        ]
      };
      
    case StorageMode.SERVER_ONLY:
      return {
        mode,
        description: 'Traditional server-side storage with cloud sync',
        features: [
          'Cross-device synchronization',
          'Server-side backup and restore',
          'Team collaboration features',
          'Admin management capabilities'
        ]
      };
      
    case StorageMode.HYBRID:
      return {
        mode,
        description: 'Local storage with optional encrypted server backup',
        features: [
          'Fast local access with privacy',
          'Optional encrypted cloud backup',
          'Cross-device sync when enabled',
          'User controls backup frequency'
        ]
      };
      
    default:
      return {
        mode: DEFAULT_STORAGE_MODE,
        description: 'Default client-side storage',
        features: ['Privacy-focused local storage']
      };
  }
}

/**
 * Switch storage mode with user confirmation
 */
export async function switchStorageMode(
  newMode: StorageMode,
  options?: {
    migrateData?: boolean;
    backupCurrent?: boolean;
  }
): Promise<boolean> {
  const currentMode = getStorageMode();
  
  if (currentMode === newMode) {
    return true;
  }
  
  try {
    // TODO: Implement data migration logic here
    if (options?.migrateData) {
      console.log('Data migration would be implemented here');
      // This would involve:
      // 1. Export data from current storage
      // 2. Import data to new storage
      // 3. Verify migration success
    }
    
    if (options?.backupCurrent) {
      console.log('Data backup would be implemented here');
      // Create backup of current data before switching
    }
    
    setStorageMode(newMode);
    
    // Optionally reload the page to apply changes
    if (window.confirm('Storage mode changed. Reload the page to apply changes?')) {
      window.location.reload();
    }
    
    return true;
  } catch (error) {
    console.error('Failed to switch storage mode:', error);
    return false;
  }
}

export default {
  StorageMode,
  getStorageMode,
  setStorageMode,
  useClientStorage,
  useServerStorage,
  supportsServerBackup,
  getPreferredStorageMode,
  switchStorageMode
};