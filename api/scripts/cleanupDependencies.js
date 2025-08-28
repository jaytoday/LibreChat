/**
 * Cleanup Dependencies Script
 * Removes LLM client libraries and other server-side dependencies no longer needed
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logger } = require('@librechat/data-schemas');

/**
 * Dependencies to remove from server-side package.json
 */
const DEPENDENCIES_TO_REMOVE = [
  // OpenAI client libraries
  'openai',
  '@azure/openai',
  
  // Anthropic client libraries  
  '@anthropic-ai/sdk',
  
  // Google AI client libraries
  '@google-ai/generativelanguage',
  'google-auth-library',
  
  // Other LLM providers
  'cohere-ai',
  'replicate',
  
  // LLM-related utilities that are now client-side
  'tiktoken',
  'gpt-3-encoder',
  'gpt-tokenizer',
  
  // Server-side streaming libraries (now handled client-side)
  'eventsource-parser',
  'server-sent-events',
  
  // Model management libraries  
  'huggingface',
  '@huggingface/inference',
  
  // Plugin system dependencies
  'vm2',
  'isolated-vm',
  
  // LLM proxy utilities
  'http-proxy-middleware',
  'node-fetch', // If only used for LLM calls
  
  // Embedding and vector libraries (if not used elsewhere)
  'hnswlib-node',
  'faiss-node',
  'chromadb',
  
  // LLM function calling utilities
  'zod-to-json-schema',
  'json-schema-to-typescript'
];

/**
 * Dev dependencies to remove
 */
const DEV_DEPENDENCIES_TO_REMOVE = [
  // LLM testing utilities
  '@types/openai',
  'openai-test-utils',
  
  // Model testing frameworks
  'llm-test-harness'
];

/**
 * Dependencies to keep (core server functionality)
 */
const DEPENDENCIES_TO_KEEP = [
  // Core server framework
  'express',
  'cors',
  'helmet',
  
  // Authentication
  'jsonwebtoken',
  'bcryptjs',
  'passport',
  
  // Database
  'mongoose',
  'mongodb',
  
  // Utilities
  'lodash',
  'uuid',
  'crypto-js',
  
  // File handling
  'multer',
  'sharp',
  
  // Validation
  'joi',
  'express-validator',
  
  // Logging
  'winston',
  'morgan',
  
  // Environment
  'dotenv',
  
  // Rate limiting
  'express-rate-limit',
  
  // WebSocket (if needed)
  'ws',
  'socket.io'
];

/**
 * Read package.json
 */
function readPackageJson(packagePath) {
  try {
    const content = fs.readFileSync(packagePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(`Failed to read package.json at ${packagePath}:`, error);
    throw error;
  }
}

/**
 * Write package.json
 */
function writePackageJson(packagePath, packageData) {
  try {
    const content = JSON.stringify(packageData, null, 2);
    fs.writeFileSync(packagePath, content, 'utf8');
    logger.info(`Updated package.json at ${packagePath}`);
  } catch (error) {
    logger.error(`Failed to write package.json at ${packagePath}:`, error);
    throw error;
  }
}

/**
 * Clean up server-side dependencies
 */
function cleanupServerDependencies() {
  logger.info('[Cleanup] Starting server dependency cleanup...');
  
  const serverPackagePath = path.join(__dirname, '..', 'package.json');
  const packageData = readPackageJson(serverPackagePath);
  
  let removedDeps = [];
  let removedDevDeps = [];
  
  // Remove production dependencies
  if (packageData.dependencies) {
    DEPENDENCIES_TO_REMOVE.forEach(dep => {
      if (packageData.dependencies[dep]) {
        delete packageData.dependencies[dep];
        removedDeps.push(dep);
      }
    });
  }
  
  // Remove dev dependencies
  if (packageData.devDependencies) {
    DEV_DEPENDENCIES_TO_REMOVE.forEach(dep => {
      if (packageData.devDependencies[dep]) {
        delete packageData.devDependencies[dep];
        removedDevDeps.push(dep);
      }
    });
  }
  
  // Write updated package.json
  writePackageJson(serverPackagePath, packageData);
  
  logger.info(`[Cleanup] Removed ${removedDeps.length} dependencies:`, removedDeps);
  logger.info(`[Cleanup] Removed ${removedDevDeps.length} dev dependencies:`, removedDevDeps);
  
  return { removedDeps, removedDevDeps };
}

/**
 * Update client-side dependencies to include LLM libraries
 */
function updateClientDependencies() {
  logger.info('[Cleanup] Updating client dependencies...');
  
  const clientPackagePath = path.join(__dirname, '..', '..', 'client', 'package.json');
  
  if (!fs.existsSync(clientPackagePath)) {
    logger.warn('[Cleanup] Client package.json not found, skipping client updates');
    return;
  }
  
  const clientPackageData = readPackageJson(clientPackagePath);
  
  // Add client-side LLM dependencies if not already present
  const clientDependencies = {
    // Core LLM libraries for client-side use
    'openai': '^4.0.0',
    '@anthropic-ai/sdk': '^0.20.0',
    '@google/generative-ai': '^0.7.0',
    
    // Client-side utilities
    'crypto-js': '^4.2.0',
    'idb': '^8.0.0', // Already added in previous steps
    'uuid': '^9.0.0',
    
    // Streaming utilities
    'eventsource-parser': '^1.1.0'
  };
  
  let addedDeps = [];
  
  // Add missing dependencies
  Object.entries(clientDependencies).forEach(([dep, version]) => {
    if (!clientPackageData.dependencies?.[dep]) {
      if (!clientPackageData.dependencies) {
        clientPackageData.dependencies = {};
      }
      clientPackageData.dependencies[dep] = version;
      addedDeps.push(`${dep}@${version}`);
    }
  });
  
  if (addedDeps.length > 0) {
    writePackageJson(clientPackagePath, clientPackageData);
    logger.info(`[Cleanup] Added ${addedDeps.length} client dependencies:`, addedDeps);
  } else {
    logger.info('[Cleanup] Client dependencies already up to date');
  }
  
  return { addedDeps };
}

/**
 * Clean up unused files and directories
 */
function cleanupUnusedFiles() {
  logger.info('[Cleanup] Cleaning up unused files...');
  
  const filesToRemove = [
    // LLM client directories
    path.join(__dirname, '..', 'clients'),
    path.join(__dirname, '..', 'services', 'Endpoints'),
    
    // Plugin directories
    path.join(__dirname, '..', 'plugins'),
    
    // Model management
    path.join(__dirname, '..', 'models', 'LLM'),
    
    // Tokenizer utilities
    path.join(__dirname, '..', 'utils', 'tokenizer'),
    
    // Proxy utilities
    path.join(__dirname, '..', 'proxy'),
    
    // Old chat handlers
    path.join(__dirname, '..', 'handlers', 'chat'),
    
    // LLM middleware
    path.join(__dirname, '..', 'middleware', 'llm'),
    
    // Old streaming handlers
    path.join(__dirname, '..', 'streaming')
  ];
  
  let removedFiles = [];
  
  filesToRemove.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
          removedFiles.push(`${filePath}/ (directory)`);
        } else {
          fs.unlinkSync(filePath);
          removedFiles.push(filePath);
        }
      }
    } catch (error) {
      logger.warn(`[Cleanup] Failed to remove ${filePath}:`, error.message);
    }
  });
  
  logger.info(`[Cleanup] Removed ${removedFiles.length} files/directories:`, removedFiles);
  
  return { removedFiles };
}

/**
 * Update import statements in remaining files
 */
function updateImports() {
  logger.info('[Cleanup] Updating import statements...');
  
  const filesToUpdate = [
    path.join(__dirname, '..', 'server', 'index.js'),
    path.join(__dirname, '..', 'server', 'routes', 'index.js'),
  ];
  
  let updatedFiles = [];
  
  filesToUpdate.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Remove imports for deleted modules
        const importsToRemove = [
          /const.*openai.*require.*openai.*/gi,
          /const.*anthropic.*require.*@anthropic-ai\/sdk.*/gi,
          /const.*google.*require.*@google.*ai.*/gi,
          /import.*openai.*from.*openai.*/gi,
          /import.*anthropic.*from.*@anthropic-ai.*/gi,
        ];
        
        importsToRemove.forEach(regex => {
          const newContent = content.replace(regex, '');
          if (newContent !== content) {
            content = newContent;
            modified = true;
          }
        });
        
        if (modified) {
          fs.writeFileSync(filePath, content, 'utf8');
          updatedFiles.push(filePath);
        }
      }
    } catch (error) {
      logger.warn(`[Cleanup] Failed to update imports in ${filePath}:`, error.message);
    }
  });
  
  logger.info(`[Cleanup] Updated imports in ${updatedFiles.length} files:`, updatedFiles);
  
  return { updatedFiles };
}

/**
 * Run npm/yarn cleanup
 */
function runPackageManagerCleanup() {
  logger.info('[Cleanup] Running package manager cleanup...');
  
  try {
    // Detect package manager
    const serverDir = path.join(__dirname, '..');
    const hasYarnLock = fs.existsSync(path.join(serverDir, 'yarn.lock'));
    const hasPnpmLock = fs.existsSync(path.join(serverDir, 'pnpm-lock.yaml'));
    
    let packageManager = 'npm';
    if (hasPnpmLock) {
      packageManager = 'pnpm';
    } else if (hasYarnLock) {
      packageManager = 'yarn';
    }
    
    logger.info(`[Cleanup] Using package manager: ${packageManager}`);
    
    // Clean cache and remove unused packages
    if (packageManager === 'npm') {
      execSync('npm prune --production', { cwd: serverDir, stdio: 'inherit' });
      execSync('npm cache clean --force', { cwd: serverDir, stdio: 'inherit' });
    } else if (packageManager === 'yarn') {
      execSync('yarn install --production', { cwd: serverDir, stdio: 'inherit' });
      execSync('yarn cache clean', { cwd: serverDir, stdio: 'inherit' });
    } else if (packageManager === 'pnpm') {
      execSync('pnpm prune --prod', { cwd: serverDir, stdio: 'inherit' });
      execSync('pnpm store prune', { cwd: serverDir, stdio: 'inherit' });
    }
    
    logger.info('[Cleanup] Package manager cleanup completed');
    
  } catch (error) {
    logger.warn('[Cleanup] Package manager cleanup failed:', error.message);
  }
}

/**
 * Main cleanup function
 */
async function runCleanup() {
  try {
    logger.info('[Cleanup] Starting dependency cleanup for simplified server architecture...');
    
    // Step 1: Clean up server dependencies
    const serverResults = cleanupServerDependencies();
    
    // Step 2: Update client dependencies
    const clientResults = updateClientDependencies();
    
    // Step 3: Clean up unused files
    const fileResults = cleanupUnusedFiles();
    
    // Step 4: Update import statements
    const importResults = updateImports();
    
    // Step 5: Run package manager cleanup
    runPackageManagerCleanup();
    
    logger.info('[Cleanup] Dependency cleanup completed successfully!');
    
    return {
      success: true,
      summary: {
        removedServerDeps: serverResults.removedDeps.length,
        removedServerDevDeps: serverResults.removedDevDeps.length,
        addedClientDeps: clientResults.addedDeps?.length || 0,
        removedFiles: fileResults.removedFiles.length,
        updatedFiles: importResults.updatedFiles.length
      },
      details: {
        server: serverResults,
        client: clientResults, 
        files: fileResults,
        imports: importResults
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('[Cleanup] Dependency cleanup failed:', error);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Export for use in other scripts
module.exports = {
  runCleanup,
  cleanupServerDependencies,
  updateClientDependencies,
  cleanupUnusedFiles,
  updateImports,
  runPackageManagerCleanup,
  DEPENDENCIES_TO_REMOVE,
  DEV_DEPENDENCIES_TO_REMOVE,
  DEPENDENCIES_TO_KEEP
};

// Run cleanup if script is called directly
if (require.main === module) {
  runCleanup()
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Cleanup script error:', error);
      process.exit(1);
    });
}