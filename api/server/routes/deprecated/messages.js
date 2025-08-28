/**
 * Deprecated Messages Route
 * Shows deprecation warnings for LLM proxy endpoints
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

const DEPRECATION_MESSAGE = {
  error: 'Endpoint deprecated',
  message: 'This endpoint has been deprecated in favor of client-side LLM calls',
  details: {
    reason: 'Server no longer acts as LLM proxy for improved privacy',
    migration: 'Use direct client-to-LLM API calls with provisioned keys',
    documentation: '/docs/client-side-architecture',
    deprecatedSince: '2024-01-01',
    removalDate: '2024-06-01'
  },
  alternatives: {
    messages: 'Store messages client-side with encryption',
    chat: 'Use direct LLM provider APIs from browser',
    streaming: 'Implement client-side streaming with provider SDKs'
  }
};

// Log deprecation warning
const logDeprecationWarning = (req) => {
  logger.warn(`[DEPRECATED] ${req.method} ${req.originalUrl} accessed by user ${req.user?.id}`, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
};

// Middleware to add deprecation headers
const addDeprecationHeaders = (req, res, next) => {
  res.set({
    'Deprecated': 'true',
    'Sunset': '2024-06-01',
    'Link': '</docs/client-side-architecture>; rel="successor-version"',
    'Warning': '299 - "This endpoint is deprecated and will be removed"'
  });
  
  logDeprecationWarning(req);
  next();
};

// All message routes return deprecation notice
router.use(addDeprecationHeaders);

router.get('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/messages',
    suggestion: 'Use client-side storage to retrieve messages locally'
  });
});

router.post('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/messages',
    suggestion: 'Use direct LLM provider APIs for chat completions'
  });
});

router.patch('/:messageId', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'PATCH /api/messages/:messageId',
    suggestion: 'Update messages in client-side storage'
  });
});

router.delete('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'DELETE /api/messages',
    suggestion: 'Delete messages from client-side storage'
  });
});

// Catch all other message routes
router.all('*', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: `${req.method} /api/messages${req.path}`,
    suggestion: 'Migrate to client-side message handling'
  });
});

module.exports = router;