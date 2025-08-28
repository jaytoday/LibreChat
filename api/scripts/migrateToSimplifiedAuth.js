/**
 * Migration Script: Remove API Key Dependencies
 * Migrates the system from API key-based authentication to simplified user-only authentication
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { Key } = require('~/db/models');

/**
 * Migration configuration
 */
const MIGRATION_CONFIG = {
  removeApiKeys: true,
  initializeUserDefaults: true,
  backupApiKeys: true,
  cleanupUnusedCollections: true,
  updateUserProfiles: true,
};

/**
 * Backup existing API keys before removal (optional)
 */
async function backupApiKeys() {
  if (!MIGRATION_CONFIG.backupApiKeys) {
    logger.info('[Migration] Skipping API keys backup');
    return;
  }

  try {
    logger.info('[Migration] Creating backup of existing API keys...');
    
    const apiKeys = await Key.find({}).lean();
    const backupData = {
      timestamp: new Date().toISOString(),
      totalKeys: apiKeys.length,
      keys: apiKeys.map(key => ({
        userId: key.userId,
        name: key.name,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        // Note: We're not backing up the actual encrypted values for security
      }))
    };
    
    // Save backup to file (you might want to use a different storage method)
    const fs = require('fs');
    const path = require('path');
    const backupPath = path.join(__dirname, '..', 'backups', `api-keys-backup-${Date.now()}.json`);
    
    // Ensure backup directory exists
    const backupDir = path.dirname(backupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    
    logger.info(`[Migration] API keys backup created: ${backupPath}`);
    logger.info(`[Migration] Backed up ${apiKeys.length} API key records`);
    
  } catch (error) {
    logger.error('[Migration] Failed to backup API keys:', error);
    throw error;
  }
}

/**
 * Remove API key collection and references
 */
async function removeApiKeyDependencies() {
  if (!MIGRATION_CONFIG.removeApiKeys) {
    logger.info('[Migration] Skipping API key removal');
    return;
  }

  try {
    logger.info('[Migration] Removing API key dependencies...');
    
    // Count existing keys for logging
    const keyCount = await Key.countDocuments({});
    logger.info(`[Migration] Found ${keyCount} API keys to remove`);
    
    // Remove all API keys
    const deleteResult = await Key.deleteMany({});
    logger.info(`[Migration] Removed ${deleteResult.deletedCount} API keys`);
    
    // Drop the keys collection entirely
    try {
      await mongoose.connection.db.dropCollection('keys');
      logger.info('[Migration] Dropped keys collection');
    } catch (error) {
      if (error.message.includes('ns not found')) {
        logger.info('[Migration] Keys collection already removed or not found');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    logger.error('[Migration] Failed to remove API key dependencies:', error);
    throw error;
  }
}

/**
 * Update user documents to add default preferences and settings
 */
async function initializeUserDefaults() {
  if (!MIGRATION_CONFIG.initializeUserDefaults) {
    logger.info('[Migration] Skipping user defaults initialization');
    return;
  }

  try {
    logger.info('[Migration] Initializing user defaults...');
    
    const { User } = require('~/db/models');
    
    // Get all users without preferences or settings
    const usersToUpdate = await User.find({
      $or: [
        { preferences: { $exists: false } },
        { settings: { $exists: false } }
      ]
    });
    
    logger.info(`[Migration] Found ${usersToUpdate.length} users to update`);
    
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
      timezone: 'UTC',
      notifications: { email: true, desktop: false, sounds: true },
      accessibility: { highContrast: false, largeText: false },
      privacy: { shareAnalytics: false, shareErrors: true },
      createdAt: new Date().toISOString()
    };
    
    let updatedCount = 0;
    
    for (const user of usersToUpdate) {
      try {
        const updateData = {};
        
        if (!user.preferences) {
          updateData.preferences = defaultPreferences;
        }
        
        if (!user.settings) {
          updateData.settings = defaultSettings;
        }
        
        await User.findByIdAndUpdate(user._id, updateData);
        updatedCount++;
        
      } catch (error) {
        logger.warn(`[Migration] Failed to update user ${user._id}:`, error.message);
      }
    }
    
    logger.info(`[Migration] Successfully updated ${updatedCount} users with defaults`);
    
  } catch (error) {
    logger.error('[Migration] Failed to initialize user defaults:', error);
    throw error;
  }
}

/**
 * Clean up user documents by removing API key related fields
 */
async function cleanupUserProfiles() {
  if (!MIGRATION_CONFIG.updateUserProfiles) {
    logger.info('[Migration] Skipping user profile cleanup');
    return;
  }

  try {
    logger.info('[Migration] Cleaning up user profiles...');
    
    const { User } = require('~/db/models');
    
    // Remove API key related fields from user documents
    const updateResult = await User.updateMany(
      {},
      {
        $unset: {
          'apiKeys': 1,
          'keyPreferences': 1,
          'keyExpiry': 1,
          'userProvidedApiKey': 1,
          'keyConfiguration': 1,
        }
      }
    );
    
    logger.info(`[Migration] Cleaned up ${updateResult.modifiedCount} user profiles`);
    
  } catch (error) {
    logger.error('[Migration] Failed to cleanup user profiles:', error);
    throw error;
  }
}

/**
 * Update database indexes for the new simplified schema
 */
async function updateDatabaseIndexes() {
  try {
    logger.info('[Migration] Updating database indexes...');
    
    const { User } = require('~/db/models');
    
    // Add new indexes for preferences and settings
    await User.collection.createIndex({ 'preferences.storageMode': 1 });
    await User.collection.createIndex({ 'settings.theme': 1 });
    await User.collection.createIndex({ 'preferences.updatedAt': 1 });
    
    logger.info('[Migration] Database indexes updated');
    
  } catch (error) {
    logger.warn('[Migration] Failed to update indexes (non-critical):', error.message);
  }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  try {
    logger.info('[Migration] Verifying migration results...');
    
    const { User } = require('~/db/models');
    
    // Check that users have preferences and settings
    const usersWithDefaults = await User.countDocuments({
      preferences: { $exists: true },
      settings: { $exists: true }
    });
    
    const totalUsers = await User.countDocuments({});
    
    logger.info(`[Migration] Verification: ${usersWithDefaults}/${totalUsers} users have defaults`);
    
    // Check that API keys collection is removed
    try {
      const keyCount = await Key.countDocuments({});
      logger.warn(`[Migration] Warning: ${keyCount} API keys still exist`);
    } catch (error) {
      if (error.message.includes('Collection') || error.message.includes('does not exist')) {
        logger.info('[Migration] Verification: API keys collection successfully removed');
      }
    }
    
    logger.info('[Migration] Verification completed');
    
  } catch (error) {
    logger.error('[Migration] Verification failed:', error);
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    logger.info('[Migration] Starting migration to simplified authentication...');
    
    // Step 1: Backup existing API keys
    await backupApiKeys();
    
    // Step 2: Remove API key dependencies
    await removeApiKeyDependencies();
    
    // Step 3: Initialize user defaults
    await initializeUserDefaults();
    
    // Step 4: Clean up user profiles
    await cleanupUserProfiles();
    
    // Step 5: Update database indexes
    await updateDatabaseIndexes();
    
    // Step 6: Verify migration
    await verifyMigration();
    
    logger.info('[Migration] Migration to simplified authentication completed successfully!');
    
    return {
      success: true,
      message: 'Migration completed successfully',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('[Migration] Migration failed:', error);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Rollback migration (if needed)
 */
async function rollbackMigration() {
  try {
    logger.info('[Migration] Starting rollback...');
    
    // This would restore from backup if needed
    logger.warn('[Migration] Rollback not fully implemented - check backups manually');
    
    return {
      success: true,
      message: 'Rollback initiated - manual verification required'
    };
    
  } catch (error) {
    logger.error('[Migration] Rollback failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export functions for use in other scripts
module.exports = {
  runMigration,
  rollbackMigration,
  backupApiKeys,
  removeApiKeyDependencies,
  initializeUserDefaults,
  cleanupUserProfiles,
  updateDatabaseIndexes,
  verifyMigration,
  MIGRATION_CONFIG
};

// Run migration if script is called directly
if (require.main === module) {
  const mongoose = require('mongoose');
  const { connectDb } = require('~/lib/db');
  
  (async () => {
    try {
      await connectDb();
      
      const args = process.argv.slice(2);
      const command = args[0];
      
      if (command === 'rollback') {
        const result = await rollbackMigration();
        console.log(JSON.stringify(result, null, 2));
      } else {
        const result = await runMigration();
        console.log(JSON.stringify(result, null, 2));
      }
      
    } catch (error) {
      console.error('Migration script error:', error);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      process.exit(0);
    }
  })();
}