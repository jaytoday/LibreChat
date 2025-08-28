/**
 * React Hooks for Client Configuration
 */

import { useState, useEffect, useMemo } from 'react';
import type { ClientConfig, ProviderConfig, ModelConfig } from '~/utils/clientConfiguration';
import { clientConfigManager } from '~/utils/clientConfiguration';

/**
 * Hook for accessing client configuration
 */
export const useClientConfig = () => {
  const [config, setConfig] = useState<ClientConfig>(clientConfigManager.getConfig);

  useEffect(() => {
    const unsubscribe = clientConfigManager.onChange(setConfig);
    return unsubscribe;
  }, []);

  return {
    config,
    updateConfig: clientConfigManager.updateConfig.bind(clientConfigManager),
    resetToDefaults: clientConfigManager.resetToDefaults.bind(clientConfigManager),
    exportConfig: clientConfigManager.exportConfig.bind(clientConfigManager),
    importConfig: clientConfigManager.importConfig.bind(clientConfigManager),
  };
};

/**
 * Hook for managing providers
 */
export const useProviders = () => {
  const { config } = useClientConfig();

  const providers = useMemo(() => {
    return Object.values(config.providers);
  }, [config.providers]);

  const getProvider = (providerId: string) => {
    return config.providers[providerId];
  };

  const enabledProviders = useMemo(() => {
    return providers.filter(provider => 
      provider.models.some(model => model.enabled !== false)
    );
  }, [providers]);

  return {
    providers,
    enabledProviders,
    getProvider,
    defaultProvider: config.defaultProvider,
  };
};

/**
 * Hook for managing models
 */
export const useModels = (providerId?: string) => {
  const { config } = useClientConfig();

  const allModels = useMemo(() => {
    return Object.values(config.providers)
      .flatMap(provider => provider.models)
      .filter(model => model.enabled !== false);
  }, [config.providers]);

  const modelsForProvider = useMemo(() => {
    if (!providerId) return [];
    const provider = config.providers[providerId];
    return provider?.models.filter(model => model.enabled !== false) || [];
  }, [config.providers, providerId]);

  const getModel = (modelProviderId: string, modelId: string) => {
    const provider = config.providers[modelProviderId];
    return provider?.models.find(model => model.id === modelId);
  };

  const getPreferredModel = (modelProviderId: string) => {
    return clientConfigManager.getPreferredModel(modelProviderId);
  };

  const setPreferredModel = (modelProviderId: string, modelId: string) => {
    clientConfigManager.setPreferredModel(modelProviderId, modelId);
  };

  return {
    allModels,
    models: modelsForProvider,
    getModel,
    getPreferredModel,
    setPreferredModel,
    addCustomModel: clientConfigManager.addCustomModel.bind(clientConfigManager),
    removeCustomModel: clientConfigManager.removeCustomModel.bind(clientConfigManager),
  };
};

/**
 * Hook for managing features
 */
export const useFeatures = () => {
  const { config } = useClientConfig();

  const isEnabled = (feature: keyof ClientConfig['features']) => {
    return config.features[feature];
  };

  const toggle = (feature: keyof ClientConfig['features']) => {
    clientConfigManager.toggleFeature(feature);
  };

  return {
    features: config.features,
    isEnabled,
    toggle,
    
    // Convenience accessors for common features
    clientStorageEnabled: config.features.clientStorageEnabled,
    offlineModeEnabled: config.features.offlineModeEnabled,
    encryptionEnabled: config.features.encryptionEnabled,
    backupEnabled: config.features.backupEnabled,
  };
};

/**
 * Hook for managing UI settings
 */
export const useUISettings = () => {
  const { config } = useClientConfig();

  const updateSettings = (settings: Partial<ClientConfig['ui']>) => {
    clientConfigManager.updateUISettings(settings);
  };

  return {
    uiSettings: config.ui,
    updateSettings,
    theme: config.ui.theme,
    language: config.ui.language,
    density: config.ui.density,
  };
};

/**
 * Hook for model selection logic
 */
export const useModelSelection = (providerId?: string) => {
  const { models, getPreferredModel, setPreferredModel } = useModels(providerId);
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  useEffect(() => {
    if (providerId) {
      const preferred = getPreferredModel(providerId);
      setSelectedModelId(preferred);
    }
  }, [providerId, getPreferredModel]);

  const selectModel = (modelId: string) => {
    if (providerId) {
      setPreferredModel(providerId, modelId);
      setSelectedModelId(modelId);
    }
  };

  const selectedModel = useMemo(() => {
    return models.find(model => model.id === selectedModelId);
  }, [models, selectedModelId]);

  return {
    models,
    selectedModel,
    selectedModelId,
    selectModel,
  };
};

/**
 * Hook for provider capabilities
 */
export const useProviderCapabilities = (providerId: string) => {
  const { getProvider } = useProviders();
  
  const provider = useMemo(() => {
    return getProvider(providerId);
  }, [getProvider, providerId]);

  return {
    provider,
    supportsCORS: provider?.supportsCORS ?? false,
    supportsStreaming: provider?.features.streaming ?? false,
    supportsVision: provider?.features.vision ?? false,
    supportsFunctionCalling: provider?.features.function_calling ?? false,
    supportsFileUpload: provider?.features.file_upload ?? false,
    rateLimits: provider?.rateLimits,
  };
};

/**
 * Hook for model capabilities
 */
export const useModelCapabilities = (providerId: string, modelId: string) => {
  const { getModel } = useModels();
  
  const model = useMemo(() => {
    return getModel(providerId, modelId);
  }, [getModel, providerId, modelId]);

  return {
    model,
    supportsVision: model?.supportedFeatures.vision ?? false,
    supportsFunctionCalling: model?.supportedFeatures.function_calling ?? false,
    supportsStreaming: model?.supportedFeatures.streaming ?? false,
    supportsFileUpload: model?.supportedFeatures.file_upload ?? false,
    maxTokens: model?.maxTokens,
    contextWindow: model?.contextWindow,
    pricing: model?.pricing,
  };
};

export default {
  useClientConfig,
  useProviders,
  useModels,
  useFeatures,
  useUISettings,
  useModelSelection,
  useProviderCapabilities,
  useModelCapabilities,
};