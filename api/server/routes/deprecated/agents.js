/**
 * Deprecated Agents Routes
 * Shows deprecation warnings for AI Agents proxy endpoints  
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

const DEPRECATION_MESSAGE = {
  error: 'Endpoint deprecated',
  message: 'AI Agents proxy endpoints have been deprecated',
  details: {
    reason: 'Server-side agent processing removed for client-side architecture', 
    migration: 'Implement agents client-side or use server storage mode',
    documentation: '/docs/agents-architecture',
    deprecatedSince: '2024-01-01',
    removalDate: '2024-06-01'
  },
  alternatives: {
    simpleAgents: 'Implement basic agents client-side with LLM provider APIs',
    complexAgents: 'Use server storage mode for advanced agent functionality',
    tools: 'Integrate tools directly in client-side agent implementations'
  },
  note: 'Complex agents with tool calling, memory, and state management are best handled server-side. Consider using server storage mode for full agent capabilities.'
};

const addDeprecationHeaders = (req, res, next) => {
  res.set({
    'Deprecated': 'true',
    'Sunset': '2024-06-01', 
    'Link': '</docs/agents-architecture>; rel="successor-version"',
    'Warning': '299 - "AI Agents proxy endpoint is deprecated"'
  });
  
  logger.warn(`[DEPRECATED] ${req.method} ${req.originalUrl} accessed by user ${req.user?.id}`);
  next();
};

router.use(addDeprecationHeaders);

// Agent management
router.get('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/agents',
    suggestion: 'List agents from client-side storage or implement custom agent registry'
  });
});

router.post('/', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/agents',
    suggestion: 'Create agents client-side or use server storage mode for persistence'
  });
});

router.get('/:id', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/agents/:id',
    suggestion: 'Retrieve agent configuration from client-side storage'
  });
});

router.put('/:id', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'PUT /api/agents/:id',
    suggestion: 'Update agents in client-side storage or server storage mode'
  });
});

router.delete('/:id', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'DELETE /api/agents/:id',
    suggestion: 'Delete agents from client-side storage'
  });
});

// Agent chat/execution
router.post('/:id/chat', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/agents/:id/chat',
    suggestion: 'Implement agent chat logic client-side with direct LLM calls',
    complexity: 'HIGH - Complex agents with tools require server-side processing'
  });
});

router.post('/:id/execute', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/agents/:id/execute',
    suggestion: 'Execute agent logic client-side or use server storage mode',
    complexity: 'HIGH - Tool calling and external integrations need server-side handling'
  });
});

// Agent tools
router.get('/:id/tools', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/agents/:id/tools',
    suggestion: 'Manage agent tools client-side or in server storage mode'
  });
});

router.post('/:id/tools', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/agents/:id/tools',
    suggestion: 'Add tools to agents client-side or via server storage mode'
  });
});

// Agent actions
router.get('/actions', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/agents/actions',
    suggestion: 'Implement actions client-side or use server storage mode for complex actions'
  });
});

router.post('/actions', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/agents/actions',
    suggestion: 'Create actions client-side or in server storage mode'
  });
});

// Agent memory/state
router.get('/:id/memory', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'GET /api/agents/:id/memory',
    suggestion: 'Manage agent memory client-side with local storage or server storage mode'
  });
});

router.post('/:id/memory', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: 'POST /api/agents/:id/memory',
    suggestion: 'Store agent memory client-side or use server storage for persistence'
  });
});

// Catch all other agent routes
router.all('*', (req, res) => {
  res.status(410).json({
    ...DEPRECATION_MESSAGE,
    endpoint: `${req.method} /api/agents${req.path}`,
    suggestion: 'Implement agent functionality client-side or use server storage mode',
    recommendation: 'Use server storage mode for complex agents with tools and persistent state'
  });
});

module.exports = router;