/**
 * CORS Helper for Direct LLM API Calls
 * Handles Cross-Origin Resource Sharing issues for client-side LLM requests
 */

import { EModelEndpoint } from 'librechat-data-provider';

interface CorsConfiguration {
  supportsCORS: boolean;
  requiresProxy: boolean;
  notes: string;
}

/**
 * CORS support matrix for different LLM providers
 */
export const CORS_SUPPORT: Record<string, CorsConfiguration> = {
  [EModelEndpoint.openAI]: {
    supportsCORS: true,
    requiresProxy: false,
    notes: 'OpenAI API supports CORS from browser origins'
  },
  [EModelEndpoint.anthropic]: {
    supportsCORS: true,
    requiresProxy: false,
    notes: 'Anthropic API supports CORS with proper headers'
  },
  [EModelEndpoint.google]: {
    supportsCORS: true,
    requiresProxy: false,
    notes: 'Google Gemini API supports CORS for web applications'
  },
  [EModelEndpoint.azureOpenAI]: {
    supportsCORS: true,
    requiresProxy: false,
    notes: 'Azure OpenAI supports CORS when configured properly'
  },
  [EModelEndpoint.assistants]: {
    supportsCORS: true,
    requiresProxy: false,
    notes: 'OpenAI Assistants API supports CORS'
  },
  [EModelEndpoint.azureAssistants]: {
    supportsCORS: true,
    requiresProxy: false,
    notes: 'Azure OpenAI Assistants support CORS when configured'
  }
};

/**
 * Check if a provider supports CORS for direct browser requests
 */
export function supportsCORS(provider: string): boolean {
  const config = CORS_SUPPORT[provider];
  return config?.supportsCORS ?? false;
}

/**
 * Check if a provider requires a proxy for CORS
 */
export function requiresProxy(provider: string): boolean {
  const config = CORS_SUPPORT[provider];
  return config?.requiresProxy ?? true;
}

/**
 * Get CORS configuration notes for a provider
 */
export function getCORSNotes(provider: string): string {
  const config = CORS_SUPPORT[provider];
  return config?.notes ?? 'CORS support unknown for this provider';
}

/**
 * Validate that a request can be made directly from the browser
 */
export function canMakeDirectRequest(provider: string): {
  canMake: boolean;
  reason?: string;
  suggestion?: string;
} {
  if (!supportsCORS(provider)) {
    return {
      canMake: false,
      reason: 'Provider does not support CORS',
      suggestion: 'Use server proxy instead'
    };
  }

  if (requiresProxy(provider)) {
    return {
      canMake: false,
      reason: 'Provider requires proxy for CORS',
      suggestion: 'Configure CORS proxy or use server endpoint'
    };
  }

  return { canMake: true };
}

/**
 * Handle CORS errors and provide helpful messages
 */
export function handleCORSError(error: Error, provider: string): {
  isCORSError: boolean;
  userMessage: string;
  technicalDetails: string;
} {
  const errorMessage = error.message.toLowerCase();
  const isCORSError = errorMessage.includes('cors') || 
                     errorMessage.includes('cross-origin') ||
                     errorMessage.includes('access-control');

  if (!isCORSError) {
    return {
      isCORSError: false,
      userMessage: error.message,
      technicalDetails: error.message
    };
  }

  const config = CORS_SUPPORT[provider];
  
  return {
    isCORSError: true,
    userMessage: `Unable to connect directly to ${provider}. This may be a temporary issue or a browser restriction.`,
    technicalDetails: `CORS Error for ${provider}: ${error.message}. ${config?.notes || 'Check provider CORS configuration.'}`
  };
}

/**
 * Add appropriate headers for direct LLM requests
 */
export function getRequestHeaders(provider: string, apiKey: string): HeadersInit {
  const baseHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  switch (provider) {
    case EModelEndpoint.openAI:
    case EModelEndpoint.assistants:
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${apiKey}`,
      };

    case EModelEndpoint.anthropic:
      return {
        ...baseHeaders,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };

    case EModelEndpoint.azureOpenAI:
    case EModelEndpoint.azureAssistants:
      return {
        ...baseHeaders,
        'api-key': apiKey,
      };

    case EModelEndpoint.google:
      // Google uses API key in URL params, not headers
      return baseHeaders;

    default:
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${apiKey}`,
      };
  }
}

/**
 * Create a fetch request with proper CORS handling
 */
export async function corsAwareFetch(
  url: string,
  options: RequestInit,
  provider: string
): Promise<Response> {
  try {
    // Don't add CORS headers to outgoing requests - those are for server responses
    // Instead, just use the proper request headers for the provider
    const response = await fetch(url, {
      ...options,
      mode: 'cors', // Explicitly set CORS mode
    });

    return response;
  } catch (error) {
    const corsError = handleCORSError(error as Error, provider);
    
    if (corsError.isCORSError) {
      console.error('CORS Error:', corsError.technicalDetails);
      // You might want to show a user-friendly message here
      throw new Error(corsError.userMessage);
    }
    
    throw error;
  }
}

/**
 * Configuration guide for developers
 */
export const CORS_SETUP_GUIDE = {
  general: `
Direct client-to-LLM API calls require proper CORS configuration.
Most major LLM providers support CORS for browser requests.
`,
  
  openai: `
OpenAI API supports CORS by default for browser requests.
No additional configuration needed.
`,
  
  anthropic: `
Anthropic API supports CORS for web applications.
Ensure your API key has appropriate permissions.
`,
  
  google: `
Google Gemini API supports CORS for web applications.
API key is passed as URL parameter, not in headers.
`,
  
  azure: `
Azure OpenAI requires CORS configuration in Azure portal:
1. Go to your Azure OpenAI resource
2. Navigate to CORS settings
3. Add your domain to allowed origins
4. Allow necessary headers and methods
`,
  
  troubleshooting: `
If you encounter CORS errors:
1. Check browser developer console for detailed error messages
2. Verify API key permissions and quotas
3. Ensure provider supports direct browser requests
4. Consider using server proxy as fallback
`
};

export default {
  supportsCORS,
  requiresProxy,
  getCORSNotes,
  canMakeDirectRequest,
  handleCORSError,
  getRequestHeaders,
  corsAwareFetch,
  CORS_SETUP_GUIDE
};