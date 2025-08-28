/**
 * User Preferences Hook
 * Manages user preferences and settings for the simplified auth system
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import request from '~/data-provider/request';

export interface UserPreferences {
  storageMode: 'client_only' | 'server_only' | 'hybrid';
  theme: 'light' | 'dark' | 'auto';
  language: string;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  encryptionEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  dateFormat: string;
  notifications: {
    email: boolean;
    desktop: boolean;
    sounds: boolean;
  };
  accessibility: {
    highContrast: boolean;
    largeText: boolean;
    reduceMotion: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    shareErrors: boolean;
  };
  performance: {
    animationsEnabled: boolean;
    preloadContent: boolean;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
}

const PREFERENCES_CACHE_KEY = 'userPreferences';
const SETTINGS_CACHE_KEY = 'userSettings';
const PROFILE_CACHE_KEY = 'userProfile';

/**
 * Hook for managing user preferences
 */
export const useUserPreferences = () => {
  const queryClient = useQueryClient();

  // Get user preferences
  const {
    data: preferences,
    isLoading: preferencesLoading,
    error: preferencesError,
  } = useQuery<UserPreferences>(
    [PREFERENCES_CACHE_KEY],
    async () => {
      const response = await request.get('/auth/preferences');
      return response.preferences;
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      retry: 1,
    }
  );

  // Update user preferences mutation
  const updatePreferencesMutation = useMutation(
    async (newPreferences: Partial<UserPreferences>) => {
      const response = await request.put('/auth/preferences', {
        preferences: newPreferences
      });
      return response.preferences;
    },
    {
      onSuccess: (updatedPreferences) => {
        queryClient.setQueryData([PREFERENCES_CACHE_KEY], updatedPreferences);
        
        // Update local storage for immediate access
        try {
          localStorage.setItem('librechat_user_preferences', JSON.stringify(updatedPreferences));
        } catch (error) {
          console.warn('Failed to cache preferences locally:', error);
        }
      },
      onError: (error) => {
        console.error('Failed to update preferences:', error);
      }
    }
  );

  // Update a single preference
  const updatePreference = useCallback(
    (key: keyof UserPreferences, value: any) => {
      const currentPreferences = preferences || {} as UserPreferences;
      updatePreferencesMutation.mutate({
        ...currentPreferences,
        [key]: value,
      });
    },
    [preferences, updatePreferencesMutation]
  );

  // Get preference value with fallback
  const getPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, fallback: UserPreferences[K]): UserPreferences[K] => {
      return preferences?.[key] ?? fallback;
    },
    [preferences]
  );

  return {
    preferences,
    preferencesLoading,
    preferencesError,
    updatePreferences: updatePreferencesMutation.mutate,
    updatePreference,
    getPreference,
    isUpdatingPreferences: updatePreferencesMutation.isLoading,
  };
};

/**
 * Hook for managing user settings
 */
export const useUserSettings = () => {
  const queryClient = useQueryClient();

  // Get user settings
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useQuery<UserSettings>(
    [SETTINGS_CACHE_KEY],
    async () => {
      const response = await request.get('/auth/settings');
      return response.settings;
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      retry: 1,
    }
  );

  // Update user settings mutation
  const updateSettingsMutation = useMutation(
    async (newSettings: Partial<UserSettings>) => {
      const response = await request.put('/auth/settings', {
        settings: newSettings
      });
      return response.settings;
    },
    {
      onSuccess: (updatedSettings) => {
        queryClient.setQueryData([SETTINGS_CACHE_KEY], updatedSettings);
        
        // Apply theme changes immediately
        if (updatedSettings.theme) {
          document.documentElement.setAttribute('data-theme', updatedSettings.theme);
        }
      },
      onError: (error) => {
        console.error('Failed to update settings:', error);
      }
    }
  );

  // Update a single setting
  const updateSetting = useCallback(
    (key: keyof UserSettings, value: any) => {
      const currentSettings = settings || {} as UserSettings;
      updateSettingsMutation.mutate({
        ...currentSettings,
        [key]: value,
      });
    },
    [settings, updateSettingsMutation]
  );

  // Get setting value with fallback
  const getSetting = useCallback(
    <K extends keyof UserSettings>(key: K, fallback: UserSettings[K]): UserSettings[K] => {
      return settings?.[key] ?? fallback;
    },
    [settings]
  );

  return {
    settings,
    settingsLoading,
    settingsError,
    updateSettings: updateSettingsMutation.mutate,
    updateSetting,
    getSetting,
    isUpdatingSettings: updateSettingsMutation.isLoading,
  };
};

/**
 * Hook for managing user profile
 */
export const useUserProfile = () => {
  const queryClient = useQueryClient();

  // Update user profile mutation
  const updateProfileMutation = useMutation(
    async (profileData: Partial<UserProfile>) => {
      const response = await request.put('/auth/profile', profileData);
      return response.user;
    },
    {
      onSuccess: (updatedProfile) => {
        queryClient.setQueryData([PROFILE_CACHE_KEY], updatedProfile);
      },
      onError: (error) => {
        console.error('Failed to update profile:', error);
      }
    }
  );

  return {
    updateProfile: updateProfileMutation.mutate,
    isUpdatingProfile: updateProfileMutation.isLoading,
    profileError: updateProfileMutation.error,
  };
};

/**
 * Combined hook for all user data management
 */
export const useUserData = () => {
  const preferences = useUserPreferences();
  const settings = useUserSettings();
  const profile = useUserProfile();

  return {
    ...preferences,
    ...settings,
    ...profile,
    
    // Loading states
    isLoading: preferences.preferencesLoading || settings.settingsLoading,
    
    // Error states
    error: preferences.preferencesError || settings.settingsError,
  };
};

/**
 * Hook to initialize user defaults for new users
 */
export const useInitializeUserDefaults = () => {
  return useMutation(
    async () => {
      const response = await request.post('/auth/initialize-defaults');
      return response;
    },
    {
      onSuccess: () => {
        // Refetch preferences and settings after initialization
        const queryClient = useQueryClient();
        queryClient.invalidateQueries([PREFERENCES_CACHE_KEY]);
        queryClient.invalidateQueries([SETTINGS_CACHE_KEY]);
      }
    }
  );
};

/**
 * Hook to migrate from API key system
 */
export const useMigrateFromApiKeys = () => {
  return useMutation(
    async () => {
      const response = await request.post('/auth/cleanup-api-keys');
      return response;
    },
    {
      onSuccess: () => {
        console.log('Successfully migrated from API key system');
      },
      onError: (error) => {
        console.error('Migration failed:', error);
      }
    }
  );
};

export default useUserPreferences;