const { logger } = require('@librechat/data-schemas');
const { getUserKey, getUserKeyValues } = require('./UserService');
const { EModelEndpoint } = require('librechat-data-provider');

/**
 * Provider-specific API key provisioning configurations
 */
const PROVIDER_CONFIGS = {
  [EModelEndpoint.openAI]: {
    keyName: 'openAI',
    baseUrl: 'https://api.openai.com/v1',
    supportsSingleUse: false, // Will be updated in future step
  },
  [EModelEndpoint.anthropic]: {
    keyName: 'anthropic', 
    baseUrl: 'https://api.anthropic.com/v1',
    supportsSingleUse: false,
  },
  [EModelEndpoint.google]: {
    keyName: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    supportsSingleUse: false,
  },
  [EModelEndpoint.azureOpenAI]: {
    keyName: 'azureOpenAI',
    baseUrl: null, // Will be constructed from user config
    supportsSingleUse: false,
  },
  [EModelEndpoint.assistants]: {
    keyName: 'openAI', // Assistants use OpenAI keys
    baseUrl: 'https://api.openai.com/v1',
    supportsSingleUse: false,
  },
  [EModelEndpoint.azureAssistants]: {
    keyName: 'azureOpenAI',
    baseUrl: null,
    supportsSingleUse: false,
  }
};

/**
 * Provisions an API key for client-side LLM calls
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The user ID requesting the key
 * @param {string} params.provider - The LLM provider (openAI, anthropic, etc.)
 * @param {string} params.purpose - The purpose of the request (chat, completion, etc.)
 * @returns {Promise<Object>} The provisioned API key information
 */
const provisionApiKey = async ({ userId, provider, purpose = 'chat' }) => {
  try {
    logger.debug(`[ApiKeyProvisioning] Provisioning key for user ${userId}, provider: ${provider}`);

    // Get provider configuration
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Get the master API key from server-side storage
    let apiKeyData;
    
    try {
      if (provider === EModelEndpoint.azureOpenAI || provider === EModelEndpoint.azureAssistants) {
        // Azure keys are stored as JSON objects
        apiKeyData = await getUserKeyValues({ userId, name: config.keyName });
      } else {
        // Standard API keys are stored as strings
        const apiKey = await getUserKey({ userId, name: config.keyName });
        apiKeyData = { apiKey };
      }
    } catch (error) {
      // Check if it's a system-level key (fallback to environment variables)
      apiKeyData = getSystemApiKey(provider);
      if (!apiKeyData) {
        throw new Error(`No API key configured for provider: ${provider}`);
      }
    }

    // Prepare the response based on provider type
    const response = {
      provider,
      purpose,
      provisioned: true,
      expiresAt: Date.now() + (30 * 60 * 1000), // 30 minutes from now
      ...prepareProviderResponse(provider, config, apiKeyData)
    };

    logger.debug(`[ApiKeyProvisioning] Successfully provisioned key for ${provider}`);
    return response;

  } catch (error) {
    logger.error(`[ApiKeyProvisioning] Failed to provision key: ${error.message}`);
    throw error;
  }
};

/**
 * Get system-level API keys from environment variables
 * @param {string} provider - The provider name
 * @returns {Object|null} The system API key data or null if not found
 */
const getSystemApiKey = (provider) => {
  const envKeyMap = {
    [EModelEndpoint.openAI]: process.env.OPENAI_API_KEY,
    [EModelEndpoint.anthropic]: process.env.ANTHROPIC_API_KEY,
    [EModelEndpoint.google]: process.env.GOOGLE_KEY,
    [EModelEndpoint.assistants]: process.env.ASSISTANTS_API_KEY || process.env.OPENAI_API_KEY,
    // Azure keys would need more complex handling from environment
  };

  const apiKey = envKeyMap[provider];
  if (apiKey && apiKey !== 'user_provided') {
    return { apiKey };
  }

  return null;
};

/**
 * Prepare provider-specific response data
 * @param {string} provider - The provider name
 * @param {Object} config - The provider configuration
 * @param {Object} apiKeyData - The API key data
 * @returns {Object} The formatted response data
 */
const prepareProviderResponse = (provider, config, apiKeyData) => {
  switch (provider) {
    case EModelEndpoint.azureOpenAI:
    case EModelEndpoint.azureAssistants:
      return {
        apiKey: apiKeyData.azureOpenAIApiKey,
        baseUrl: constructAzureBaseUrl(apiKeyData),
        apiVersion: apiKeyData.azureOpenAIApiVersion,
        deployment: apiKeyData.azureOpenAIApiDeploymentName,
        instanceName: apiKeyData.azureOpenAIApiInstanceName,
      };
    
    case EModelEndpoint.google:
      return {
        apiKey: apiKeyData.apiKey,
        baseUrl: config.baseUrl,
      };
    
    case EModelEndpoint.openAI:
    case EModelEndpoint.anthropic:
    case EModelEndpoint.assistants:
    default:
      return {
        apiKey: apiKeyData.apiKey,
        baseUrl: config.baseUrl,
      };
  }
};

/**
 * Construct Azure OpenAI base URL from configuration
 * @param {Object} azureConfig - The Azure configuration object
 * @returns {string} The constructed base URL
 */
const constructAzureBaseUrl = (azureConfig) => {
  const { azureOpenAIApiInstanceName, azureOpenAIApiVersion } = azureConfig;
  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureConfig.azureOpenAIApiDeploymentName}`;
};

/**
 * Validate provisioning request
 * @param {Object} params - The request parameters
 * @returns {boolean} True if valid
 */
const validateProvisioningRequest = ({ userId, provider, purpose }) => {
  if (!userId || !provider) {
    return false;
  }
  
  if (!PROVIDER_CONFIGS[provider]) {
    return false;
  }
  
  return true;
};

/**
 * Check if a provider supports single-use keys (future functionality)
 * @param {string} provider - The provider name
 * @returns {boolean} True if single-use is supported
 */
const supportsSingleUseKeys = (provider) => {
  const config = PROVIDER_CONFIGS[provider];
  return config ? config.supportsSingleUse : false;
};

module.exports = {
  provisionApiKey,
  validateProvisioningRequest,
  supportsSingleUseKeys,
  PROVIDER_CONFIGS
};