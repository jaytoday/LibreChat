/**
 * Simplified Server Routes Index
 * Contains only essential routes for client-side architecture:
 * - User authentication and management
 * - Static file serving
 * - Configuration
 * - Optional backup services
 * 
 * REMOVED:
 * - All LLM proxy endpoints (/api/messages, chat endpoints)
 * - Assistant/Agent server processing
 * - Message storage endpoints
 * - LLM-related edit endpoints
 */

// KEEP: Essential user and system management
const simplifiedAuth = require('./simplifiedAuth');
const config = require('./config');
const staticRoute = require('./static');
const user = require('./user');
const files = require('./files'); // For avatar uploads and basic file management

// KEEP: API key provisioning (from Step 1)
const keys = require('./keys');

// KEEP: Optional backup and sync services
const backupRoutes = require('./backup');

// KEEP: Basic system utilities
const balance = require('./balance'); // For usage tracking if needed
const banner = require('./banner'); // For system announcements

// DEPRECATED: LLM Proxy Routes (marked for removal)
// These routes are kept temporarily with deprecation warnings
const deprecatedMessages = require('./deprecated/messages');
const deprecatedEdit = require('./deprecated/edit');
const deprecatedAssistants = require('./deprecated/assistants');
const deprecatedAgents = require('./deprecated/agents');

// CONDITIONAL: Legacy support routes (can be disabled via config)
const convos = require('./convos'); // Only for server storage mode
const memories = require('./memories'); // Only for server storage mode

module.exports = {
  // CORE ROUTES (always enabled)
  auth: simplifiedAuth,
  config,
  static: staticRoute,
  user,
  files,
  keys,
  backup: backupRoutes,
  
  // SYSTEM ROUTES (optional)
  balance,
  banner,
  
  // STORAGE MODE CONDITIONAL ROUTES
  // These are only enabled when server storage mode is active
  convos,
  memories,
  
  // DEPRECATED ROUTES (with warnings)
  // These will be removed in future versions
  messages: deprecatedMessages,
  edit: deprecatedEdit,
  assistants: deprecatedAssistants,
  agents: deprecatedAgents,
};

/**
 * Route configuration for simplified server
 */
const ROUTE_CONFIG = {
  // Always enabled routes
  core: [
    'auth',
    'config', 
    'static',
    'user',
    'files',
    'keys',
    'backup'
  ],
  
  // Optional system routes
  optional: [
    'balance',
    'banner'
  ],
  
  // Conditional routes (based on storage mode)
  conditional: [
    'convos',
    'memories'
  ],
  
  // Deprecated routes (will show warnings)
  deprecated: [
    'messages',
    'edit', 
    'assistants',
    'agents'
  ],
  
  // Completely removed routes
  removed: [
    'endpoints', // LLM endpoint management
    'models', // LLM model listings
    'tokenizer', // LLM tokenization
    'prompts', // Server-side prompt management
    'presets', // Server-side preset management
    'plugins', // LLM plugins
    'actions', // LLM actions
    'search', // Server-side search
    'roles', // API access roles
    'oauth', // OAuth for LLM providers
    'tags', // Server-side tagging
    'mcp', // Model Control Protocol
    'accessPermissions' // LLM access permissions
  ]
};

/**
 * Get enabled routes based on configuration
 */
function getEnabledRoutes(options = {}) {
  const {
    enableDeprecated = false,
    enableConditional = false,
    enableOptional = true
  } = options;
  
  const routes = {};
  const routeMap = module.exports;
  
  // Always include core routes
  ROUTE_CONFIG.core.forEach(routeName => {
    if (routeMap[routeName]) {
      routes[routeName] = routeMap[routeName];
    }
  });
  
  // Include optional routes if enabled
  if (enableOptional) {
    ROUTE_CONFIG.optional.forEach(routeName => {
      if (routeMap[routeName]) {
        routes[routeName] = routeMap[routeName];
      }
    });
  }
  
  // Include conditional routes if enabled
  if (enableConditional) {
    ROUTE_CONFIG.conditional.forEach(routeName => {
      if (routeMap[routeName]) {
        routes[routeName] = routeMap[routeName];
      }
    });
  }
  
  // Include deprecated routes if enabled (with warnings)
  if (enableDeprecated) {
    ROUTE_CONFIG.deprecated.forEach(routeName => {
      if (routeMap[routeName]) {
        routes[routeName] = routeMap[routeName];
      }
    });
  }
  
  return routes;
}

/**
 * Configuration helper to determine which routes to enable
 */
function getRouteConfig() {
  const enableDeprecated = process.env.ENABLE_DEPRECATED_ROUTES === 'true';
  const storageMode = process.env.DEFAULT_STORAGE_MODE || 'client_only';
  const enableConditional = storageMode === 'server_only' || storageMode === 'hybrid';
  
  return {
    enableDeprecated,
    enableConditional,
    enableOptional: true,
  };
}

module.exports.getEnabledRoutes = getEnabledRoutes;
module.exports.getRouteConfig = getRouteConfig;
module.exports.ROUTE_CONFIG = ROUTE_CONFIG;