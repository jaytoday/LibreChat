/**
 * Deprecated Edit Routes
 * Shows deprecation warnings for LLM editing endpoints
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

const DEPRECATION_MESSAGE = {
  error: 'Endpoint deprecated',
  message: 'LLM editing endpoints have been deprecated in favor of client-side processing',
  details: {
    reason: 'Server no longer processes LLM requests for improved privacy',
    migration: 'Implement client-side message editing with direct LLM calls',
    documentation: '/docs/client-side-editing',
    deprecatedSince: '2024-01-01',
    removalDate: '2024-06-01'
  },
  alternatives: {
    editing: 'Edit messages client-side and call LLM providers directly',
    regeneration: 'Regenerate responses using client-side LLM calls',
    continuation: 'Continue conversations with direct provider APIs'
  }
};

const addDeprecationHeaders = (req, res, next) => {
  res.set({
    'Deprecated': 'true',
    'Sunset': '2024-06-01',
    'Link': '</docs/client-side-editing>; rel="successor-version"',
    'Warning': '299 - "This LLM editing endpoint is deprecated"'
  });
  
  logger.warn(`[DEPRECATED] ${req.method} ${req.originalUrl} accessed by user ${req.user?.id}`);
  next();
};

router.use(addDeprecationHeaders);

// OpenAI editing
router.post('/openai', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/edit/openai',
    provider: 'OpenAI',
    suggestion: 'Use OpenAI API directly from client with provisioned key'
  });
});

// Anthropic editing
router.post('/anthropic', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/edit/anthropic', 
    provider: 'Anthropic',
    suggestion: 'Use Anthropic API directly from client with provisioned key'
  });
});

// Google editing
router.post('/google', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/edit/google',
    provider: 'Google',
    suggestion: 'Use Google Gemini API directly from client with provisioned key'
  });
});

// Custom endpoint editing
router.post('/custom', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/edit/custom',
    provider: 'Custom',
    suggestion: 'Configure custom endpoint for direct client-side calls'
  });
});

// Catch all other edit routes
router.all('*', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: `${req.method} /api/edit${req.path}`,
    suggestion: 'Implement client-side editing with direct LLM provider calls'
  });
});

module.exports = router;