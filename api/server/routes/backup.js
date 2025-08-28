/**
 * Backup Routes
 * Handles encrypted backup storage for hybrid mode clients
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware/simplifiedAuth');
const { Backup } = require('~/db/models');
const mongoose = require('mongoose');

const router = express.Router();

// Backup model for storing encrypted client data
const BackupSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  backupId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  encryptedData: {
    data: String,
    iv: String,
    checksum: String,
    timestamp: Number
  },
  metadata: {
    conversationCount: Number,
    messageCount: Number,
    clientVersion: String,
    storageMode: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    index: true
  }
});

// Create model if it doesn't exist
let BackupModel;
try {
  BackupModel = mongoose.model('Backup');
} catch (error) {
  BackupModel = mongoose.model('Backup', BackupSchema);
}

// Check if backup service is enabled
const isBackupEnabled = () => {
  return process.env.ENABLE_BACKUP_SERVICE === 'true';
};

// Middleware to check if backup is enabled
const requireBackupEnabled = (req, res, next) => {
  if (!isBackupEnabled()) {
    return res.status(503).json({
      error: 'Backup service disabled',
      message: 'Server backup functionality is not enabled'
    });
  }
  next();
};

// Check backup service status
router.get('/status', requireJwtAuth, (req, res) => {
  const enabled = isBackupEnabled();
  const config = {
    enabled,
    maxBackupsPerUser: process.env.MAX_BACKUPS_PER_USER || 10,
    backupRetentionDays: process.env.BACKUP_RETENTION_DAYS || 30,
    maxBackupSize: process.env.MAX_BACKUP_SIZE || 10 * 1024 * 1024, // 10MB
  };
  
  res.status(200).json({
    status: enabled ? 'available' : 'disabled',
    config: enabled ? config : null
  });
});

// Create encrypted backup
router.post('/', requireJwtAuth, requireBackupEnabled, async (req, res) => {
  try {
    const { backup, metadata } = req.body;
    const userId = req.user.id;
    
    if (!backup || !backup.data || !backup.iv || !backup.checksum) {
      return res.status(400).json({
        error: 'Invalid backup data',
        message: 'Backup must include encrypted data, IV, and checksum'
      });
    }
    
    // Check backup size
    const backupSize = JSON.stringify(backup).length;
    const maxSize = parseInt(process.env.MAX_BACKUP_SIZE || 10 * 1024 * 1024);
    
    if (backupSize > maxSize) {
      return res.status(413).json({
        error: 'Backup too large',
        message: `Backup size (${backupSize} bytes) exceeds limit (${maxSize} bytes)`
      });
    }
    
    // Check user backup limit
    const maxBackups = parseInt(process.env.MAX_BACKUPS_PER_USER || 10);
    const userBackupCount = await BackupModel.countDocuments({ userId });
    
    if (userBackupCount >= maxBackups) {
      // Remove oldest backup to make space
      const oldestBackup = await BackupModel.findOne({ userId }).sort({ createdAt: 1 });
      if (oldestBackup) {
        await BackupModel.deleteOne({ _id: oldestBackup._id });
        logger.info(`[Backup] Removed oldest backup for user ${userId}`);
      }
    }
    
    // Generate backup ID
    const backupId = `backup-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate expiration date
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || 30);
    const expiresAt = new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000));
    
    // Create backup document
    const backupDoc = new BackupModel({
      userId,
      backupId,
      encryptedData: {
        data: backup.data,
        iv: backup.iv,
        checksum: backup.checksum,
        timestamp: backup.timestamp || Date.now()
      },
      metadata: {
        conversationCount: metadata?.conversationCount || 0,
        messageCount: metadata?.messageCount || 0,
        clientVersion: metadata?.clientVersion || '1.0.0',
        storageMode: 'hybrid'
      },
      expiresAt
    });
    
    await backupDoc.save();
    
    logger.info(`[Backup] Created backup ${backupId} for user ${userId}`);
    
    res.status(201).json({
      success: true,
      backupId,
      expiresAt: expiresAt.toISOString(),
      metadata: backupDoc.metadata
    });
    
  } catch (error) {
    logger.error('[Backup] Failed to create backup:', error);
    res.status(500).json({
      error: 'Failed to create backup',
      message: error.message
    });
  }
});

// Get backup by ID
router.get('/:backupId', requireJwtAuth, requireBackupEnabled, async (req, res) => {
  try {
    const { backupId } = req.params;
    const userId = req.user.id;
    
    const backup = await BackupModel.findOne({
      backupId,
      userId
    }).lean();
    
    if (!backup) {
      return res.status(404).json({
        error: 'Backup not found',
        message: 'The requested backup does not exist or you do not have access to it'
      });
    }
    
    // Check if backup has expired
    if (backup.expiresAt && backup.expiresAt < new Date()) {
      // Delete expired backup
      await BackupModel.deleteOne({ _id: backup._id });
      
      return res.status(410).json({
        error: 'Backup expired',
        message: 'The requested backup has expired and been removed'
      });
    }
    
    res.status(200).json({
      data: backup.encryptedData.data,
      iv: backup.encryptedData.iv,
      checksum: backup.encryptedData.checksum,
      timestamp: backup.encryptedData.timestamp,
      metadata: backup.metadata
    });
    
  } catch (error) {
    logger.error('[Backup] Failed to get backup:', error);
    res.status(500).json({
      error: 'Failed to retrieve backup',
      message: error.message
    });
  }
});

// Get latest backup
router.get('/latest', requireJwtAuth, requireBackupEnabled, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const backup = await BackupModel.findOne({
      userId,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).lean();
    
    if (!backup) {
      return res.status(404).json({
        error: 'No backup found',
        message: 'No valid backups found for this user'
      });
    }
    
    res.status(200).json({
      data: backup.encryptedData.data,
      iv: backup.encryptedData.iv,
      checksum: backup.encryptedData.checksum,
      timestamp: backup.encryptedData.timestamp,
      metadata: backup.metadata
    });
    
  } catch (error) {
    logger.error('[Backup] Failed to get latest backup:', error);
    res.status(500).json({
      error: 'Failed to retrieve latest backup',
      message: error.message
    });
  }
});

// List user backups
router.get('/', requireJwtAuth, requireBackupEnabled, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;
    
    const backups = await BackupModel.find({
      userId,
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset))
    .select('backupId createdAt expiresAt metadata')
    .lean();
    
    const total = await BackupModel.countDocuments({
      userId,
      expiresAt: { $gt: new Date() }
    });
    
    res.status(200).json({
      backups: backups.map(backup => ({
        id: backup.backupId,
        date: backup.createdAt.toISOString(),
        expiresAt: backup.expiresAt.toISOString(),
        conversationCount: backup.metadata?.conversationCount || 0,
        messageCount: backup.metadata?.messageCount || 0,
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
    
  } catch (error) {
    logger.error('[Backup] Failed to list backups:', error);
    res.status(500).json({
      error: 'Failed to list backups',
      message: error.message
    });
  }
});

// Delete backup
router.delete('/:backupId', requireJwtAuth, requireBackupEnabled, async (req, res) => {
  try {
    const { backupId } = req.params;
    const userId = req.user.id;
    
    const result = await BackupModel.deleteOne({
      backupId,
      userId
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: 'Backup not found',
        message: 'The requested backup does not exist or you do not have access to it'
      });
    }
    
    logger.info(`[Backup] Deleted backup ${backupId} for user ${userId}`);
    
    res.status(204).send();
    
  } catch (error) {
    logger.error('[Backup] Failed to delete backup:', error);
    res.status(500).json({
      error: 'Failed to delete backup',
      message: error.message
    });
  }
});

// Cleanup expired backups (maintenance endpoint)
router.post('/cleanup', requireJwtAuth, async (req, res) => {
  try {
    // Only allow admin users to run cleanup
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'Only administrators can run backup cleanup'
      });
    }
    
    const result = await BackupModel.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    logger.info(`[Backup] Cleanup: Removed ${result.deletedCount} expired backups`);
    
    res.status(200).json({
      success: true,
      removedCount: result.deletedCount,
      message: `Removed ${result.deletedCount} expired backups`
    });
    
  } catch (error) {
    logger.error('[Backup] Failed to cleanup expired backups:', error);
    res.status(500).json({
      error: 'Failed to cleanup backups',
      message: error.message
    });
  }
});

module.exports = router;