/**
 * Simplified User Service
 * Handles only user account management and preferences (no API key management)
 */

const { logger } = require('@librechat/data-schemas');
const { updateUser } = require('~/models');

/**
 * Updates the plugins for a user based on the action specified (install/uninstall).
 * @async
 * @param {Object} user - The user whose plugins are to be updated.
 * @param {string} pluginKey - The key of the plugin to install or uninstall.
 * @param {'install' | 'uninstall'} action - The action to perform, 'install' or 'uninstall'.
 * @returns {Promise<Object>} The result of the update operation.
 */
const updateUserPluginsService = async (user, pluginKey, action) => {
  try {
    const userPlugins = user.plugins || [];
    if (action === 'install') {
      return await updateUser(user._id, { plugins: [...userPlugins, pluginKey] });
    } else if (action === 'uninstall') {
      return await updateUser(user._id, {
        plugins: userPlugins.filter((plugin) => plugin !== pluginKey),
      });
    }
  } catch (err) {
    logger.error('[updateUserPluginsService]', err);
    return err;
  }
};

/**
 * Update user preferences (storage mode, UI settings, etc.)
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The user ID
 * @param {Object} params.preferences - The user preferences to update
 * @returns {Promise<Object>} The updated user object
 */
const updateUserPreferences = async ({ userId, preferences }) => {
  try {
    const updatedUser = await updateUser(userId, { 
      preferences: {
        ...preferences,
        updatedAt: new Date().toISOString()
      }
    });
    
    logger.debug('[updateUserPreferences] Updated preferences for user:', userId);
    return updatedUser;
  } catch (error) {
    logger.error('[updateUserPreferences]', error);
    throw error;
  }
};

/**
 * Get user preferences
 * @param {Object} params - The parameters object
 * @param {Object} params.user - The user object
 * @returns {Object} The user preferences
 */
const getUserPreferences = ({ user }) => {
  return user?.preferences || {
    storageMode: 'client_only',
    theme: 'dark',
    language: 'en',
    autoBackup: false,
    backupFrequency: 'daily',
    encryptionEnabled: true,
    createdAt: new Date().toISOString()
  };
};

/**
 * Update user profile information
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The user ID
 * @param {Object} params.profileData - The profile data to update
 * @returns {Promise<Object>} The updated user object
 */
const updateUserProfile = async ({ userId, profileData }) => {
  try {
    const allowedFields = ['name', 'email', 'avatar', 'bio', 'location', 'website'];
    const filteredData = {};
    
    // Only allow updating specific profile fields
    allowedFields.forEach(field => {
      if (profileData[field] !== undefined) {
        filteredData[field] = profileData[field];
      }
    });
    
    const updatedUser = await updateUser(userId, {
      ...filteredData,
      updatedAt: new Date().toISOString()
    });
    
    logger.debug('[updateUserProfile] Updated profile for user:', userId);
    return updatedUser;
  } catch (error) {
    logger.error('[updateUserProfile]', error);
    throw error;
  }
};

/**
 * Update user settings (non-sensitive configuration)
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The user ID
 * @param {Object} params.settings - The settings to update
 * @returns {Promise<Object>} The updated user object
 */
const updateUserSettings = async ({ userId, settings }) => {
  try {
    const allowedSettings = [
      'theme',
      'language',
      'timezone',
      'dateFormat',
      'notifications',
      'accessibility',
      'privacy',
      'performance'
    ];
    
    const filteredSettings = {};
    allowedSettings.forEach(setting => {
      if (settings[setting] !== undefined) {
        filteredSettings[setting] = settings[setting];
      }
    });
    
    const updatedUser = await updateUser(userId, {
      settings: {
        ...filteredSettings,
        updatedAt: new Date().toISOString()
      }
    });
    
    logger.debug('[updateUserSettings] Updated settings for user:', userId);
    return updatedUser;
  } catch (error) {
    logger.error('[updateUserSettings]', error);
    throw error;
  }
};

/**
 * Get user settings with defaults
 * @param {Object} params - The parameters object
 * @param {Object} params.user - The user object
 * @returns {Object} The user settings
 */
const getUserSettings = ({ user }) => {
  return user?.settings || {
    theme: 'auto',
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    notifications: {
      email: true,
      desktop: false,
      sounds: true
    },
    accessibility: {
      highContrast: false,
      largeText: false,
      reduceMotion: false
    },
    privacy: {
      shareAnalytics: false,
      shareErrors: true
    },
    performance: {
      animationsEnabled: true,
      preloadContent: true
    },
    createdAt: new Date().toISOString()
  };
};

/**
 * Get user session data (sanitized for JWT)
 * @param {Object} params - The parameters object
 * @param {Object} params.user - The user object
 * @returns {Object} Sanitized user session data
 */
const getUserSessionData = ({ user }) => {
  return {
    id: user._id || user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    isVerified: user.isVerified,
    preferences: getUserPreferences({ user }),
    settings: getUserSettings({ user }),
    createdAt: user.createdAt,
    lastLogin: new Date().toISOString()
  };
};

/**
 * Clean up user data by removing any API key references
 * This is part of the migration away from server-side API key storage
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The user ID
 * @returns {Promise<Object>} Cleanup result
 */
const cleanupUserApiKeyReferences = async ({ userId }) => {
  try {
    // Remove any API key related fields from user document
    const updatedUser = await updateUser(userId, {
      $unset: {
        'apiKeys': 1,
        'keyPreferences': 1,
        'keyExpiry': 1,
      }
    });
    
    logger.info('[cleanupUserApiKeyReferences] Cleaned API key references for user:', userId);
    return { success: true, updatedUser };
  } catch (error) {
    logger.error('[cleanupUserApiKeyReferences]', error);
    return { success: false, error: error.message };
  }
};

/**
 * Initialize default user preferences for new users
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The user ID
 * @returns {Promise<Object>} Initialization result
 */
const initializeUserDefaults = async ({ userId }) => {
  try {
    const defaultPreferences = {
      storageMode: 'client_only',
      theme: 'auto',
      language: 'en',
      autoBackup: false,
      encryptionEnabled: true,
      createdAt: new Date().toISOString()
    };
    
    const defaultSettings = {
      theme: 'auto',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      notifications: { email: true, desktop: false, sounds: true },
      accessibility: { highContrast: false, largeText: false },
      privacy: { shareAnalytics: false, shareErrors: true },
      createdAt: new Date().toISOString()
    };
    
    const updatedUser = await updateUser(userId, {
      preferences: defaultPreferences,
      settings: defaultSettings
    });
    
    logger.info('[initializeUserDefaults] Initialized defaults for user:', userId);
    return { success: true, updatedUser };
  } catch (error) {
    logger.error('[initializeUserDefaults]', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  updateUserPluginsService,
  updateUserPreferences,
  getUserPreferences,
  updateUserProfile,
  updateUserSettings,
  getUserSettings,
  getUserSessionData,
  cleanupUserApiKeyReferences,
  initializeUserDefaults,
};