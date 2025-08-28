/**
 * Simplified Authentication Routes
 * Focuses only on user account management without API key handling
 */

const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const {
  resetPasswordRequestController,
  resetPasswordController,
  registrationController,
  graphTokenController,
  refreshController,
} = require('~/server/controllers/AuthController');
const {
  regenerateBackupCodes,
  disable2FA,
  confirm2FA,
  enable2FA,
  verify2FA,
} = require('~/server/controllers/TwoFactorController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { getBalanceConfig } = require('~/server/services/Config');
const {
  updateUserPreferences,
  getUserPreferences,
  updateUserProfile,
  updateUserSettings,
  getUserSettings,
  initializeUserDefaults,
  cleanupUserApiKeyReferences,
} = require('~/server/services/SimplifiedUserService');
const middleware = require('~/server/middleware');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getBalanceConfig,
  Balance,
});

const router = express.Router();

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;

// Core Authentication Routes (unchanged)
router.post('/logout', middleware.requireJwtAuth, logoutController);
router.post(
  '/login',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', refreshController);
router.post(
  '/register',
  middleware.registerLimiter,
  middleware.checkBan,
  middleware.checkInviteUser,
  middleware.validateRegistration,
  registrationController,
);

// Password Reset Routes (unchanged)
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

// Two-Factor Authentication Routes (unchanged)
router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);
router.post('/2fa/enable', middleware.requireJwtAuth, enable2FA);
router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);
router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);
router.post('/2fa/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);
router.post('/2fa/verify-temp', verify2FAWithTempToken);

// Graph Token (if needed for integrations)
router.post('/gen-token', middleware.requireJwtAuth, graphTokenController);

// NEW: Simplified User Management Routes

// User Preferences Routes
router.get('/preferences', middleware.requireJwtAuth, async (req, res) => {
  try {
    const preferences = getUserPreferences({ user: req.user });
    res.status(200).json({ preferences });
  } catch (error) {
    console.error('[GET /auth/preferences]', error);
    res.status(500).json({ 
      error: 'Failed to get user preferences',
      message: error.message 
    });
  }
});

router.put('/preferences', middleware.requireJwtAuth, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Invalid preferences data' });
    }
    
    const updatedUser = await updateUserPreferences({
      userId: req.user.id,
      preferences
    });
    
    res.status(200).json({ 
      success: true, 
      preferences: getUserPreferences({ user: updatedUser })
    });
  } catch (error) {
    console.error('[PUT /auth/preferences]', error);
    res.status(500).json({ 
      error: 'Failed to update user preferences',
      message: error.message 
    });
  }
});

// User Settings Routes
router.get('/settings', middleware.requireJwtAuth, async (req, res) => {
  try {
    const settings = getUserSettings({ user: req.user });
    res.status(200).json({ settings });
  } catch (error) {
    console.error('[GET /auth/settings]', error);
    res.status(500).json({ 
      error: 'Failed to get user settings',
      message: error.message 
    });
  }
});

router.put('/settings', middleware.requireJwtAuth, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }
    
    const updatedUser = await updateUserSettings({
      userId: req.user.id,
      settings
    });
    
    res.status(200).json({ 
      success: true, 
      settings: getUserSettings({ user: updatedUser })
    });
  } catch (error) {
    console.error('[PUT /auth/settings]', error);
    res.status(500).json({ 
      error: 'Failed to update user settings',
      message: error.message 
    });
  }
});

// User Profile Routes
router.put('/profile', middleware.requireJwtAuth, async (req, res) => {
  try {
    const profileData = req.body;
    
    const updatedUser = await updateUserProfile({
      userId: req.user.id,
      profileData
    });
    
    res.status(200).json({ 
      success: true, 
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
        location: updatedUser.location,
        website: updatedUser.website,
      }
    });
  } catch (error) {
    console.error('[PUT /auth/profile]', error);
    res.status(500).json({ 
      error: 'Failed to update user profile',
      message: error.message 
    });
  }
});

// Initialize user defaults (for existing users migrating to simplified auth)
router.post('/initialize-defaults', middleware.requireJwtAuth, async (req, res) => {
  try {
    const result = await initializeUserDefaults({ userId: req.user.id });
    
    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: 'User defaults initialized successfully'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to initialize user defaults',
        message: result.error
      });
    }
  } catch (error) {
    console.error('[POST /auth/initialize-defaults]', error);
    res.status(500).json({ 
      error: 'Failed to initialize user defaults',
      message: error.message 
    });
  }
});

// Cleanup API key references (migration helper)
router.post('/cleanup-api-keys', middleware.requireJwtAuth, async (req, res) => {
  try {
    const result = await cleanupUserApiKeyReferences({ userId: req.user.id });
    
    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: 'API key references cleaned up successfully'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to cleanup API key references',
        message: result.error
      });
    }
  } catch (error) {
    console.error('[POST /auth/cleanup-api-keys]', error);
    res.status(500).json({ 
      error: 'Failed to cleanup API key references',
      message: error.message 
    });
  }
});

// User session info (sanitized data for client)
router.get('/session', middleware.requireJwtAuth, async (req, res) => {
  try {
    const { getUserSessionData } = require('~/server/services/SimplifiedUserService');
    const sessionData = getUserSessionData({ user: req.user });
    
    res.status(200).json({ 
      success: true,
      user: sessionData
    });
  } catch (error) {
    console.error('[GET /auth/session]', error);
    res.status(500).json({ 
      error: 'Failed to get session data',
      message: error.message 
    });
  }
});

// Health check for simplified auth system
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    authType: 'simplified',
    features: {
      userAccounts: true,
      preferences: true,
      settings: true,
      profile: true,
      twoFactor: true,
      apiKeyManagement: false // Explicitly disabled
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;