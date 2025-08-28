/**
 * Simplified Authentication Middleware
 * Replaces API key-based authentication with user-only authentication
 */

const { requireSimplifiedAuth } = require('~/server/services/SimplifiedTokenService');
const { getUserPreferences, getUserSettings } = require('~/server/services/SimplifiedUserService');

/**
 * Enhanced authentication middleware that includes user preferences
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireJwtAuth = async (req, res, next) => {
  try {
    // Use the simplified auth first
    await new Promise((resolve, reject) => {
      requireSimplifiedAuth(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    
    // If we have a user, enhance with full user data
    if (req.user) {
      try {
        // Get full user document (you'd need to implement getUserById)
        // For now, we'll work with the token data
        const preferences = {
          storageMode: req.user.storageMode || 'client_only',
          theme: req.user.theme || 'auto'
        };
        
        // Enhance user object with preferences
        req.user = {
          ...req.user,
          preferences,
          // Add other fields as needed
        };
      } catch (error) {
        console.warn('Failed to enhance user data:', error.message);
        // Continue with basic user data from token
      }
    }
    
    next();
  } catch (error) {
    // Let the simplified auth handle the error response
    requireSimplifiedAuth(req, res, next);
  }
};

/**
 * Optional authentication middleware
 * Sets user if token is valid, but doesn't require it
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalJwtAuth = async (req, res, next) => {
  try {
    await new Promise((resolve) => {
      requireJwtAuth(req, res, (error) => {
        // Don't propagate errors for optional auth
        resolve();
      });
    });
  } catch (error) {
    // Ignore errors for optional auth
  }
  
  next();
};

/**
 * Check user role/permissions
 * Simplified version without API key permissions
 * @param {Array} allowedRoles - Array of allowed roles
 * @returns {Function} Middleware function
 */
const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }
    
    const userRole = req.user.role || 'user';
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Check if user account is verified
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated'
    });
  }
  
  if (!req.user.isVerified) {
    return res.status(403).json({
      error: 'Account verification required',
      message: 'Please verify your email address to access this feature',
      code: 'ACCOUNT_NOT_VERIFIED'
    });
  }
  
  next();
};

/**
 * Check storage mode permissions
 * Ensures user has appropriate storage mode for certain operations
 * @param {Array} allowedModes - Array of allowed storage modes
 * @returns {Function} Middleware function
 */
const requireStorageMode = (allowedModes = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }
    
    const userStorageMode = req.user.storageMode || 'client_only';
    
    if (allowedModes.length > 0 && !allowedModes.includes(userStorageMode)) {
      return res.status(403).json({
        error: 'Storage mode not supported',
        message: `This operation requires one of the following storage modes: ${allowedModes.join(', ')}`,
        currentMode: userStorageMode
      });
    }
    
    next();
  };
};

/**
 * Add user context to request for logging/debugging
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const addUserContext = (req, res, next) => {
  if (req.user) {
    // Add user context to request for logging
    req.userContext = {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      storageMode: req.user.storageMode,
      isVerified: req.user.isVerified,
      requestId: req.headers['x-request-id'] || `req-${Date.now()}`
    };
    
    // Set response headers for debugging (in development)
    if (process.env.NODE_ENV === 'development') {
      res.set('X-User-ID', req.user.id);
      res.set('X-Storage-Mode', req.user.storageMode);
    }
  }
  
  next();
};

/**
 * Rate limiting per user (simplified version)
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @returns {Function} Middleware function
 */
const createUserRateLimit = ({ windowMs = 15 * 60 * 1000, max = 100 } = {}) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(); // Skip rate limiting for unauthenticated requests
    }
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    const userHistory = userRequests.get(userId) || [];
    const recentRequests = userHistory.filter(time => time > windowStart);
    
    if (recentRequests.length >= max) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${max} requests per ${windowMs / 1000} seconds`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    // Add current request
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': max - recentRequests.length,
      'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000)
    });
    
    next();
  };
};

module.exports = {
  requireJwtAuth,
  optionalJwtAuth,
  requireRole,
  requireVerified,
  requireStorageMode,
  addUserContext,
  createUserRateLimit,
  
  // Convenience middleware combinations
  requireAdmin: requireRole(['admin']),
  requireModerator: requireRole(['admin', 'moderator']),
  requireVerifiedUser: [requireJwtAuth, requireVerified],
  requireClientStorage: requireStorageMode(['client_only', 'hybrid']),
  requireServerStorage: requireStorageMode(['server_only', 'hybrid']),
};