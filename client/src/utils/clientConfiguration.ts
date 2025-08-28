/**
 * Client-Side Configuration System
 * Manages model configurations and provider settings for client-only architecture
 */

import { EModelEndpoint } from 'librechat-data-provider';
import { logger } from '~/utils';

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  description?: string;
  maxTokens?: number;
  contextWindow?: number;
  supportedFeatures: {
    vision?: boolean;
    function_calling?: boolean;
    streaming?: boolean;
    file_upload?: boolean;
  };
  pricing?: {
    input?: number; // per 1K tokens
    output?: number; // per 1K tokens
  };
  deprecated?: boolean;
  enabled?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  supportsCORS: boolean;
  requiresApiKey: boolean;
  defaultModel?: string;
  models: ModelConfig[];
  features: {
    streaming?: boolean;
    vision?: boolean;
    function_calling?: boolean;
    file_upload?: boolean;
  };
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
}

export interface ClientConfig {
  providers: Record<string, ProviderConfig>;
  defaultProvider: string;
  user: {
    preferredModels: Record<string, string>; // provider -> model
    customSettings: Record<string, any>;
  };
  features: {
    clientStorageEnabled: boolean;
    offlineModeEnabled: boolean;
    encryptionEnabled: boolean;
    backupEnabled: boolean;
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    density: 'comfortable' | 'compact';
  };
}

const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  [EModelEndpoint.openAI]: {
    id: EModelEndpoint.openAI,
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    supportsCORS: true,
    requiresApiKey: true,
    defaultModel: 'gpt-4o-mini',
    features: {
      streaming: true,
      vision: true,
      function_calling: true,
      file_upload: true,
    },
    rateLimits: {
      requestsPerMinute: 3500,
      tokensPerMinute: 200000,
    },
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: EModelEndpoint.openAI,
        description: 'Most capable model, multimodal',
        maxTokens: 4096,
        contextWindow: 128000,
        supportedFeatures: {
          vision: true,
          function_calling: true,
          streaming: true,
          file_upload: true,
        },
        pricing: { input: 0.005, output: 0.015 },
        enabled: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: EModelEndpoint.openAI,
        description: 'Fast, cost-effective model',
        maxTokens: 4096,
        contextWindow: 128000,
        supportedFeatures: {
          vision: true,
          function_calling: true,
          streaming: true,
          file_upload: true,
        },
        pricing: { input: 0.00015, output: 0.0006 },
        enabled: true,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: EModelEndpoint.openAI,
        description: 'High-performance model with large context',
        maxTokens: 4096,
        contextWindow: 128000,
        supportedFeatures: {
          vision: true,
          function_calling: true,
          streaming: true,
          file_upload: true,
        },
        pricing: { input: 0.01, output: 0.03 },
        enabled: true,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: EModelEndpoint.openAI,
        description: 'Fast and efficient for most tasks',
        maxTokens: 4096,
        contextWindow: 16385,
        supportedFeatures: {
          function_calling: true,
          streaming: true,
        },
        pricing: { input: 0.0005, output: 0.0015 },
        enabled: true,
      },
    ],
  },

  [EModelEndpoint.anthropic]: {
    id: EModelEndpoint.anthropic,
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    supportsCORS: true,
    requiresApiKey: true,
    defaultModel: 'claude-3-5-sonnet-20241022',
    features: {
      streaming: true,
      vision: true,
      file_upload: true,
    },
    rateLimits: {
      requestsPerMinute: 1000,
      tokensPerMinute: 40000,
    },
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: EModelEndpoint.anthropic,
        description: 'Most intelligent model',
        maxTokens: 8192,
        contextWindow: 200000,
        supportedFeatures: {
          vision: true,
          streaming: true,
          file_upload: true,
        },
        pricing: { input: 0.003, output: 0.015 },
        enabled: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        provider: EModelEndpoint.anthropic,
        description: 'Fast and cost-effective',
        maxTokens: 8192,
        contextWindow: 200000,
        supportedFeatures: {
          vision: true,
          streaming: true,
          file_upload: true,
        },
        pricing: { input: 0.001, output: 0.005 },
        enabled: true,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: EModelEndpoint.anthropic,
        description: 'Most capable model for complex tasks',
        maxTokens: 4096,
        contextWindow: 200000,
        supportedFeatures: {
          vision: true,
          streaming: true,
          file_upload: true,
        },
        pricing: { input: 0.015, output: 0.075 },
        enabled: true,
      },
    ],
  },

  [EModelEndpoint.google]: {
    id: EModelEndpoint.google,
    name: 'Google',
    endpoint: 'https://generativelanguage.googleapis.com/v1',
    supportsCORS: true,
    requiresApiKey: true,
    defaultModel: 'gemini-1.5-pro-latest',
    features: {
      streaming: true,
      vision: true,
      file_upload: true,
    },
    rateLimits: {
      requestsPerMinute: 360,
      requestsPerDay: 1000,
    },
    models: [
      {
        id: 'gemini-1.5-pro-latest',
        name: 'Gemini 1.5 Pro',
        provider: EModelEndpoint.google,
        description: 'Most capable model with large context window',
        maxTokens: 8192,
        contextWindow: 2000000,
        supportedFeatures: {
          vision: true,
          streaming: true,
          file_upload: true,
        },
        enabled: true,
      },
      {
        id: 'gemini-1.5-flash-latest',
        name: 'Gemini 1.5 Flash',
        provider: EModelEndpoint.google,
        description: 'Fast and efficient model',
        maxTokens: 8192,
        contextWindow: 1000000,
        supportedFeatures: {
          vision: true,
          streaming: true,
          file_upload: true,
        },
        enabled: true,
      },
    ],
  },

  [EModelEndpoint.azureOpenAI]: {
    id: EModelEndpoint.azureOpenAI,
    name: 'Azure OpenAI',
    endpoint: 'https://{instance}.openai.azure.com',
    supportsCORS: true,
    requiresApiKey: true,
    defaultModel: 'gpt-4o',
    features: {
      streaming: true,
      vision: true,
      function_calling: true,
      file_upload: true,
    },
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Azure)',
        provider: EModelEndpoint.azureOpenAI,
        description: 'Azure-hosted GPT-4o',
        maxTokens: 4096,
        contextWindow: 128000,
        supportedFeatures: {
          vision: true,
          function_calling: true,
          streaming: true,
          file_upload: true,
        },
        enabled: true,
      },
    ],
  },
};

const DEFAULT_CONFIG: ClientConfig = {
  providers: DEFAULT_PROVIDER_CONFIGS,
  defaultProvider: EModelEndpoint.openAI,
  user: {
    preferredModels: {
      [EModelEndpoint.openAI]: 'gpt-4o-mini',
      [EModelEndpoint.anthropic]: 'claude-3-5-sonnet-20241022',
      [EModelEndpoint.google]: 'gemini-1.5-pro-latest',
    },
    customSettings: {},
  },
  features: {
    clientStorageEnabled: true,
    offlineModeEnabled: true,
    encryptionEnabled: true,
    backupEnabled: false,
  },
  ui: {
    theme: 'auto',
    language: 'en',
    density: 'comfortable',
  },
};

const CONFIG_STORAGE_KEY = 'librechat_client_config';

/**
 * Client Configuration Manager
 */
export class ClientConfigManager {
  private config: ClientConfig;
  private changeListeners: ((config: ClientConfig) => void)[] = [];

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from localStorage with fallback to defaults
   */
  private loadConfig(): ClientConfig {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsedConfig = JSON.parse(stored);
        
        // Merge with defaults to handle new fields
        return this.mergeWithDefaults(parsedConfig);
      }
    } catch (error) {
      logger.warn('Failed to load client config from storage:', error);
    }
    
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Merge stored config with defaults to handle version updates
   */
  private mergeWithDefaults(stored: any): ClientConfig {
    return {
      providers: { ...DEFAULT_PROVIDER_CONFIGS, ...stored.providers },
      defaultProvider: stored.defaultProvider || DEFAULT_CONFIG.defaultProvider,
      user: {
        preferredModels: { ...DEFAULT_CONFIG.user.preferredModels, ...stored.user?.preferredModels },
        customSettings: stored.user?.customSettings || {},
      },
      features: { ...DEFAULT_CONFIG.features, ...stored.features },
      ui: { ...DEFAULT_CONFIG.ui, ...stored.ui },
    };
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config));
      logger.debug('Client config saved to storage');
    } catch (error) {
      logger.error('Failed to save client config:', error);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ClientConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ClientConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Get available providers
   */
  getProviders(): ProviderConfig[] {
    return Object.values(this.config.providers);
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): ProviderConfig | undefined {
    return this.config.providers[providerId];
  }

  /**
   * Get models for a provider
   */
  getModelsForProvider(providerId: string): ModelConfig[] {
    const provider = this.getProvider(providerId);
    return provider?.models.filter(m => m.enabled !== false) || [];
  }

  /**
   * Get all available models
   */
  getAllModels(): ModelConfig[] {
    return Object.values(this.config.providers)
      .flatMap(provider => provider.models)
      .filter(model => model.enabled !== false);
  }

  /**
   * Get model by ID
   */
  getModel(providerId: string, modelId: string): ModelConfig | undefined {
    const provider = this.getProvider(providerId);
    return provider?.models.find(m => m.id === modelId);
  }

  /**
   * Get preferred model for a provider
   */
  getPreferredModel(providerId: string): string {
    const preferred = this.config.user.preferredModels[providerId];
    if (preferred) return preferred;
    
    const provider = this.getProvider(providerId);
    return provider?.defaultModel || provider?.models[0]?.id || '';
  }

  /**
   * Set preferred model for a provider
   */
  setPreferredModel(providerId: string, modelId: string): void {
    this.config.user.preferredModels[providerId] = modelId;
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Add custom model configuration
   */
  addCustomModel(providerId: string, model: Omit<ModelConfig, 'provider'>): void {
    const provider = this.config.providers[providerId];
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const modelWithProvider: ModelConfig = {
      ...model,
      provider: providerId,
    };

    provider.models.push(modelWithProvider);
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Remove custom model
   */
  removeCustomModel(providerId: string, modelId: string): void {
    const provider = this.config.providers[providerId];
    if (!provider) return;

    provider.models = provider.models.filter(m => m.id !== modelId);
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof ClientConfig['features']): boolean {
    return this.config.features[feature];
  }

  /**
   * Toggle a feature
   */
  toggleFeature(feature: keyof ClientConfig['features']): void {
    this.config.features[feature] = !this.config.features[feature];
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Get UI settings
   */
  getUISettings(): ClientConfig['ui'] {
    return { ...this.config.ui };
  }

  /**
   * Update UI settings
   */
  updateUISettings(settings: Partial<ClientConfig['ui']>): void {
    this.config.ui = { ...this.config.ui, ...settings };
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
    this.notifyListeners();
  }

  /**
   * Export configuration for backup
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from backup
   */
  importConfig(configJson: string): void {
    try {
      const imported = JSON.parse(configJson);
      this.config = this.mergeWithDefaults(imported);
      this.saveConfig();
      this.notifyListeners();
      logger.info('Client config imported successfully');
    } catch (error) {
      logger.error('Failed to import client config:', error);
      throw new Error('Invalid configuration format');
    }
  }

  /**
   * Subscribe to configuration changes
   */
  onChange(listener: (config: ClientConfig) => void): () => void {
    this.changeListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyListeners(): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(this.config);
      } catch (error) {
        logger.error('Error in config change listener:', error);
      }
    });
  }
}

// Global configuration manager instance
export const clientConfigManager = new ClientConfigManager();

export default clientConfigManager;