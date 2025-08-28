/**
 * Simplified JWT Token Service
 * Handles JWT tokens for user authentication without API key permissions
 */

const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const { getUserSessionData } = require('./SimplifiedUserService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';

// Token expiration times
const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * Generate access token for authenticated user
 * Contains only user identity and basic permissions, no API key data
 * @param {Object} user - User object
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  try {
    const sessionData = getUserSessionData({ user });
    
    const payload = {
      id: sessionData.id,
      username: sessionData.username,
      email: sessionData.email,
      role: sessionData.role,
      isVerified: sessionData.isVerified,
      // Include basic preferences for client-side decisions
      storageMode: sessionData.preferences?.storageMode || 'client_only',
      theme: sessionData.settings?.theme || 'auto',
      iat: Math.floor(Date.now() / 1000),
      type: 'access'
    };
    
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'librechat-simplified',
      audience: 'librechat-client'
    });
    
    logger.debug('[generateAccessToken] Generated access token for user:', sessionData.id);
    return token;
  } catch (error) {
    logger.error('[generateAccessToken] Error generating access token:', error);
    throw new Error('Failed to generate access token');
  }
};

/**
 * Generate refresh token for user
 * @param {Object} user - User object
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  try {
    const payload = {
      id: user._id || user.id,
      username: user.username,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      type: 'refresh'
    };
    
    const token = jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: 'librechat-simplified',
      audience: 'librechat-client'
    });
    
    logger.debug('[generateRefreshToken] Generated refresh token for user:', payload.id);
    return token;
  } catch (error) {
    logger.error('[generateRefreshToken] Error generating refresh token:', error);
    throw new Error('Failed to generate refresh token');
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} Object containing both tokens and expiry info
 */
const generateTokenPair = (user) => {
  try {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      tokenType: 'Bearer',
      issuedAt: new Date().toISOString(),
      refreshExpiresIn: REFRESH_TOKEN_EXPIRY
    };
  } catch (error) {
    logger.error('[generateTokenPair] Error generating token pair:', error);
    throw new Error('Failed to generate authentication tokens');
  }
};

/**
 * Verify and decode access token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded token payload
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'librechat-simplified',
      audience: 'librechat-client'
    });
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    }
    throw error;
  }
};

/**
 * Verify and decode refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'librechat-simplified',
      audience: 'librechat-client'
    });
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

/**
 * Middleware to require valid JWT authentication
 * Simplified version that doesn't check API key permissions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireSimplifiedAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No access token provided'
      });
    }
    
    const decoded = verifyAccessToken(token);
    
    // Attach user info to request (without API key data)
    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
      isVerified: decoded.isVerified,
      storageMode: decoded.storageMode,
      theme: decoded.theme,
      tokenIssuedAt: decoded.iat
    };
    
    next();
  } catch (error) {
    logger.warn('[requireSimplifiedAuth] Authentication failed:', error.message);
    
    if (error.message.includes('expired')) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Access token has expired, please refresh',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(401).json({
      error: 'Authentication failed',
      message: error.message,
      code: 'INVALID_TOKEN'
    });
  }
};

/**
 * Generate a temporary token for password reset or email verification
 * @param {Object} params - Parameters object
 * @param {string} params.userId - User ID
 * @param {string} params.purpose - Token purpose ('reset' or 'verify')
 * @param {string} params.expiry - Token expiry (default: 1h)
 * @returns {string} Temporary token
 */
const generateTempToken = ({ userId, purpose, expiry = '1h' }) => {
  try {
    const payload = {
      id: userId,
      purpose,
      iat: Math.floor(Date.now() / 1000),
      type: 'temp'
    };
    
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: expiry,
      issuer: 'librechat-simplified',
      audience: 'librechat-temp'
    });
    
    logger.debug('[generateTempToken] Generated temp token for purpose:', purpose);
    return token;
  } catch (error) {
    logger.error('[generateTempToken] Error generating temp token:', error);
    throw new Error('Failed to generate temporary token');
  }
};

/**
 * Verify temporary token
 * @param {string} token - Temporary token
 * @param {string} expectedPurpose - Expected token purpose
 * @returns {Object} Decoded token payload
 */
const verifyTempToken = (token, expectedPurpose) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'librechat-simplified',
      audience: 'librechat-temp'
    });
    
    if (decoded.type !== 'temp' || decoded.purpose !== expectedPurpose) {
      throw new Error('Invalid token type or purpose');
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Temporary token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid temporary token');
    }
    throw error;
  }
};

/**
 * Check if token needs refresh (expires within 5 minutes)
 * @param {string} token - Access token
 * @returns {boolean} True if token needs refresh
 */
const tokenNeedsRefresh = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    
    const expiryTime = decoded.exp * 1000;
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
    
    return expiryTime < fiveMinutesFromNow;
  } catch (error) {
    return true; // If we can't decode, assume it needs refresh
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  extractTokenFromHeader,
  requireSimplifiedAuth,
  generateTempToken,
  verifyTempToken,
  tokenNeedsRefresh,
  
  // Constants for external use
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
};