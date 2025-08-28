/**
 * Deprecated Assistants Routes  
 * Shows deprecation warnings for OpenAI Assistants proxy endpoints
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

const DEPRECATION_MESSAGE = {
  error: 'Endpoint deprecated',
  message: 'OpenAI Assistants proxy endpoints have been deprecated',
  details: {
    reason: 'Server no longer proxies OpenAI Assistants API calls for improved privacy',
    migration: 'Use OpenAI Assistants API directly from client with provisioned keys',
    documentation: '/docs/assistants-client-side',
    deprecatedSince: '2024-01-01', 
    removalDate: '2024-06-01'
  },
  alternatives: {
    assistants: 'Manage assistants directly via OpenAI API from client',
    threads: 'Create and manage threads client-side',
    runs: 'Execute assistant runs with direct API calls',
    files: 'Upload files directly to OpenAI from client'
  },
  note: 'Assistants require server-side processing for some features like function calling and file access. Consider using hybrid mode or server storage for full assistant functionality.'
};

const addDeprecationHeaders = (req, res, next) => {
  res.set({
    'Deprecated': 'true',
    'Sunset': '2024-06-01',
    'Link': '</docs/assistants-client-side>; rel="successor-version"',
    'Warning': '299 - "OpenAI Assistants proxy endpoint is deprecated"'
  });
  
  logger.warn(`[DEPRECATED] ${req.method} ${req.originalUrl} accessed by user ${req.user?.id}`);
  next();
};

router.use(addDeprecationHeaders);

// Assistants management
router.get('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/assistants',
    suggestion: 'List assistants using OpenAI API directly: GET https://api.openai.com/v1/assistants'
  });
});

router.post('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/assistants',
    suggestion: 'Create assistants using OpenAI API directly: POST https://api.openai.com/v1/assistants'
  });
});

router.get('/:id', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/assistants/:id',
    suggestion: 'Retrieve assistant using OpenAI API directly: GET https://api.openai.com/v1/assistants/{id}'
  });
});

// Assistant chat endpoints
router.post('/:id/chat', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/assistants/:id/chat',
    suggestion: 'Use OpenAI Threads and Runs API directly from client',
    complexity: 'HIGH - Assistants require complex thread/run management best handled server-side'
  });
});

// Thread management  
router.post('/threads', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/assistants/threads',
    suggestion: 'Create threads using OpenAI API directly: POST https://api.openai.com/v1/threads'
  });
});

router.get('/threads/:threadId', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/assistants/threads/:threadId',
    suggestion: 'Retrieve thread using OpenAI API directly: GET https://api.openai.com/v1/threads/{thread_id}'
  });
});

// Runs management
router.post('/threads/:threadId/runs', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/assistants/threads/:threadId/runs',
    suggestion: 'Create runs using OpenAI API directly: POST https://api.openai.com/v1/threads/{thread_id}/runs',
    complexity: 'HIGH - Run management with function calling requires server-side handling'
  });
});

// File management
router.post('/files', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/assistants/files',
    suggestion: 'Upload files using OpenAI API directly: POST https://api.openai.com/v1/files'
  });
});

// Vector stores
router.post('/vector_stores', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/assistants/vector_stores',
    suggestion: 'Create vector stores using OpenAI API directly: POST https://api.openai.com/v1/vector_stores'
  });
});

// Catch all other assistants routes
router.all('*', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: `${req.method} /api/assistants${req.path}`,
    suggestion: 'Use OpenAI Assistants API directly from client',
    recommendation: 'Consider server storage mode for full assistants functionality'
  });
});

module.exports = router;