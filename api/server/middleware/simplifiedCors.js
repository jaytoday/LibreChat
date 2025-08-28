/**
 * Simplified CORS Configuration
 * Optimized for client-side LLM calls and reduced server endpoints
 */

const cors = require('cors');
const { logger } = require('@librechat/data-schemas');

/**
 * CORS configuration for simplified server architecture
 */
const corsConfig = {
  // Allow requests from client application
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Get allowed origins from environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3080',
      'https://localhost:3000',
      'https://localhost:3080'
    ];
    
    // In development, be more permissive
    if (process.env.NODE_ENV === 'development') {
      // Allow localhost with any port
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  
  // Allow credentials for authentication
  credentials: true,
  
  // Allowed methods for simplified server
  methods: [
    'GET',
    'POST', 
    'PUT',
    'DELETE',
    'OPTIONS',
    'PATCH'
  ],
  
  // Allowed headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-User-Agent',
    'X-Request-ID'
  ],
  
  // Headers exposed to client
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining', 
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Storage-Mode',
    'Warning',
    'Deprecated',
    'Sunset'
  ],
  
  // Cache preflight requests for 24 hours
  maxAge: 24 * 60 * 60,
  
  // Don't pass through preflight response to next handler
  preflightContinue: false,
  
  // Provide successful OPTIONS status
  optionsSuccessStatus: 200
};

/**
 * Enhanced CORS middleware with logging
 */
const corsMiddleware = cors({
  ...corsConfig,
  origin: function (origin, callback) {
    const startTime = Date.now();
    
    corsConfig.origin(origin, (error, result) => {
      const duration = Date.now() - startTime;
      
      if (error) {
        logger.warn('[CORS] Request blocked', {
          origin,
          error: error.message,
          duration
        });
      } else if (process.env.NODE_ENV === 'development') {
        logger.debug('[CORS] Request allowed', {
          origin: origin || 'no-origin',
          duration
        });
      }
      
      callback(error, result);
    });
  }
});

/**
 * Strict CORS for sensitive endpoints
 */
const strictCorsConfig = {
  ...corsConfig,
  // Only allow same origin for sensitive operations
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // In production, be stricter
    if (process.env.NODE_ENV === 'production') {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[STRICT-CORS] Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by strict CORS policy'));
      }
    } else {
      // In development, use regular CORS
      corsConfig.origin(origin, callback);
    }
  }
};

const strictCorsMiddleware = cors(strictCorsConfig);

/**
 * Permissive CORS for public endpoints
 */
const publicCorsConfig = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Cache-Control'
  ],
  maxAge: 24 * 60 * 60
};

const publicCorsMiddleware = cors(publicCorsConfig);

/**
 * Dynamic CORS based on endpoint
 */
const dynamicCors = (req, res, next) => {
  const path = req.path;
  
  // Strict CORS for authentication and user data endpoints
  if (path.startsWith('/auth') || path.startsWith('/user') || path.startsWith('/backup')) {
    return strictCorsMiddleware(req, res, next);
  }
  
  // Public CORS for static files and config
  if (path.startsWith('/static') || path.startsWith('/config') || path.startsWith('/health')) {
    return publicCorsMiddleware(req, res, next);
  }
  
  // Regular CORS for everything else
  return corsMiddleware(req, res, next);
};

/**
 * CORS preflight handler for complex requests
 */
const handlePreflight = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Log preflight requests in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('[CORS] Preflight request', {
        origin: req.headers.origin,
        method: req.headers['access-control-request-method'],
        headers: req.headers['access-control-request-headers'],
        path: req.path
      });
    }
    
    // Set preflight headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
    res.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
    res.header('Access-Control-Max-Age', corsConfig.maxAge);
    
    return res.status(200).end();
  }
  
  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Set security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy for client-side architecture
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for client-side LLM SDKs
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://*.openai.azure.com", // Allow LLM provider APIs
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  res.header('Content-Security-Policy', csp);
  
  next();
};

module.exports = {
  corsMiddleware,
  strictCorsMiddleware,
  publicCorsMiddleware,
  dynamicCors,
  handlePreflight,
  securityHeaders,
  corsConfig,
  strictCorsConfig,
  publicCorsConfig
};