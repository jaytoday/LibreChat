/**
 * Security Hardening Utilities
 * Implements security best practices for client-side architecture
 */

import { logger } from '~/utils';

export interface SecurityConfig {
  enableCSP: boolean;
  enableHSTS: boolean;
  enableXSS: boolean;
  enableClickjacking: boolean;
  enableMIME: boolean;
  maxStorageSize: number;
  encryptionRequired: boolean;
  validateOrigin: boolean;
  sanitizeInputs: boolean;
}

export interface SecurityWarning {
  type: 'warning' | 'error' | 'info';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  timestamp: number;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enableCSP: true,
  enableHSTS: true,
  enableXSS: true,
  enableClickjacking: true,
  enableMIME: true,
  maxStorageSize: 100 * 1024 * 1024, // 100MB
  encryptionRequired: true,
  validateOrigin: true,
  sanitizeInputs: true,
};

/**
 * Security hardening manager
 */
export class SecurityManager {
  private config: SecurityConfig;
  private warnings: SecurityWarning[] = [];
  private isSecure: boolean = false;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
    this.initialize();
  }

  /**
   * Initialize security measures
   */
  private initialize(): void {
    this.checkSecurityHeaders();
    this.checkHTTPS();
    this.checkLocalStorage();
    this.setupCSP();
    this.validateEnvironment();
    
    this.isSecure = this.warnings.filter(w => w.severity === 'critical').length === 0;
    
    if (!this.isSecure) {
      logger.error('Critical security issues detected:', this.warnings.filter(w => w.severity === 'critical'));
    }
  }

  /**
   * Check if HTTPS is enabled
   */
  private checkHTTPS(): void {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      this.addWarning({
        type: 'error',
        message: 'Application is not served over HTTPS',
        severity: 'critical',
        recommendation: 'Use HTTPS for all client-side LLM communications to protect API keys',
      });
    }
  }

  /**
   * Check security headers
   */
  private checkSecurityHeaders(): void {
    // This would typically be done server-side, but we can check what we can
    const warnings = [];

    // Check if we can detect some security headers via meta tags or other means
    if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
      warnings.push('Content-Security-Policy header not detected');
    }

    if (!document.querySelector('meta[http-equiv="X-Frame-Options"]')) {
      warnings.push('X-Frame-Options header not detected');
    }

    if (warnings.length > 0) {
      this.addWarning({
        type: 'warning',
        message: `Security headers missing: ${warnings.join(', ')}`,
        severity: 'medium',
        recommendation: 'Configure security headers on the server',
      });
    }
  }

  /**
   * Check localStorage security
   */
  private checkLocalStorage(): void {
    try {
      // Check if localStorage is available and not disabled
      localStorage.setItem('security_test', 'test');
      localStorage.removeItem('security_test');
    } catch (error) {
      this.addWarning({
        type: 'error',
        message: 'localStorage is not available or disabled',
        severity: 'high',
        recommendation: 'Enable localStorage for client-side storage functionality',
      });
    }

    // Check storage size limits
    const usage = this.getStorageUsage();
    if (usage > this.config.maxStorageSize * 0.9) {
      this.addWarning({
        type: 'warning',
        message: 'localStorage usage approaching limit',
        severity: 'medium',
        recommendation: 'Clear old data or enable server backup',
      });
    }
  }

  /**
   * Setup Content Security Policy
   */
  private setupCSP(): void {
    if (!this.config.enableCSP) return;

    // Check if CSP is already set
    const existingCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    
    if (!existingCSP) {
      // Create a basic CSP for client-side LLM calls
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Needed for React
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://*.openai.azure.com",
        "font-src 'self'",
        "object-src 'none'",
        "media-src 'self'",
        "frame-src 'none'",
      ].join('; ');

      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = csp;
      document.head.appendChild(meta);

      logger.info('Client-side CSP applied');
    }
  }

  /**
   * Validate runtime environment
   */
  private validateEnvironment(): void {
    // Check for dev tools (basic detection)
    if (this.isDevToolsOpen()) {
      this.addWarning({
        type: 'warning',
        message: 'Developer tools detected',
        severity: 'low',
        recommendation: 'API keys may be visible in developer tools',
      });
    }

    // Check for suspicious extensions (basic detection)
    if (this.hasSuspiciousExtensions()) {
      this.addWarning({
        type: 'warning',
        message: 'Potentially suspicious browser extensions detected',
        severity: 'medium',
        recommendation: 'Review browser extensions for data access permissions',
      });
    }

    // Check origin validation
    if (this.config.validateOrigin && !this.isValidOrigin()) {
      this.addWarning({
        type: 'error',
        message: 'Invalid origin detected',
        severity: 'critical',
        recommendation: 'Ensure application is running from expected domain',
      });
    }
  }

  /**
   * Basic dev tools detection
   */
  private isDevToolsOpen(): boolean {
    const threshold = 160; // Rough threshold for dev tools
    return (
      window.outerHeight - window.innerHeight > threshold ||
      window.outerWidth - window.innerWidth > threshold
    );
  }

  /**
   * Basic suspicious extensions detection
   */
  private hasSuspiciousExtensions(): boolean {
    // Check for common extension indicators
    const suspiciousProperties = [
      'webkitSpeechRecognition',
      '__nightmare',
      '_phantom',
      'callPhantom',
      'spawn',
    ];

    return suspiciousProperties.some(prop => (window as any)[prop]);
  }

  /**
   * Validate origin
   */
  private isValidOrigin(): boolean {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3080',
      'https://localhost:3080',
      // Add your production domains here
    ];

    return allowedOrigins.includes(window.location.origin) || 
           window.location.hostname === 'localhost';
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input: string): string {
    if (!this.config.sanitizeInputs) return input;

    // Basic XSS protection
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate API key format
   */
  validateApiKey(key: string, provider: string): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let isValid = true;

    // Basic format validation
    const patterns: Record<string, RegExp> = {
      openAI: /^sk-[a-zA-Z0-9]{48}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9_-]+$/,
      google: /^[a-zA-Z0-9_-]{39}$/,
    };

    const pattern = patterns[provider];
    if (pattern && !pattern.test(key)) {
      warnings.push(`API key format doesn't match expected pattern for ${provider}`);
      isValid = false;
    }

    // Check for common mistakes
    if (key.includes(' ')) {
      warnings.push('API key contains spaces');
      isValid = false;
    }

    if (key.length < 20) {
      warnings.push('API key appears too short');
      isValid = false;
    }

    if (key.includes('test') || key.includes('example')) {
      warnings.push('API key appears to be a test/example key');
      isValid = false;
    }

    return { isValid, warnings };
  }

  /**
   * Check if data encryption is properly configured
   */
  checkEncryption(): {
    isEnabled: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    try {
      // Check if Web Crypto API is available
      if (!window.crypto || !window.crypto.subtle) {
        issues.push('Web Crypto API not available');
      }

      // Check if we have proper encryption key
      const masterKey = localStorage.getItem('librechat_master_key');
      if (!masterKey) {
        issues.push('Encryption master key not found');
      }

      // Test encryption functionality
      if (window.crypto && window.crypto.getRandomValues) {
        const testArray = new Uint8Array(16);
        window.crypto.getRandomValues(testArray);
      } else {
        issues.push('Crypto random number generation not available');
      }

    } catch (error) {
      issues.push(`Encryption test failed: ${(error as Error).message}`);
    }

    return {
      isEnabled: issues.length === 0,
      issues,
    };
  }

  /**
   * Monitor for security events
   */
  startMonitoring(): void {
    // Monitor for suspicious activities
    this.monitorConsoleAccess();
    this.monitorStorageAccess();
    this.monitorNetworkRequests();
  }

  /**
   * Monitor console access
   */
  private monitorConsoleAccess(): void {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      this.checkForSensitiveData(args);
      originalLog.apply(console, args);
    };

    console.warn = (...args) => {
      this.checkForSensitiveData(args);
      originalWarn.apply(console, args);
    };

    console.error = (...args) => {
      this.checkForSensitiveData(args);
      originalError.apply(console, args);
    };
  }

  /**
   * Check for sensitive data in console output
   */
  private checkForSensitiveData(args: any[]): void {
    const sensitivePatterns = [
      /sk-[a-zA-Z0-9]{48}/, // OpenAI keys
      /sk-ant-[a-zA-Z0-9_-]+/, // Anthropic keys
      /Bearer\s+[a-zA-Z0-9_-]+/, // Bearer tokens
      /password.*[:=]\s*[^\s]+/i, // Passwords
    ];

    const argsString = JSON.stringify(args);
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(argsString)) {
        this.addWarning({
          type: 'error',
          message: 'Sensitive data detected in console output',
          severity: 'critical',
          recommendation: 'Remove sensitive data from logs immediately',
        });
        break;
      }
    }
  }

  /**
   * Monitor localStorage access
   */
  private monitorStorageAccess(): void {
    const originalSetItem = localStorage.setItem;
    const originalGetItem = localStorage.getItem;

    localStorage.setItem = (key: string, value: string) => {
      this.validateStorageOperation('set', key, value);
      originalSetItem.call(localStorage, key, value);
    };

    localStorage.getItem = (key: string) => {
      this.validateStorageOperation('get', key);
      return originalGetItem.call(localStorage, key);
    };
  }

  /**
   * Validate storage operations
   */
  private validateStorageOperation(operation: string, key: string, value?: string): void {
    // Check storage usage
    if (operation === 'set' && value) {
      const currentUsage = this.getStorageUsage();
      const newItemSize = key.length + value.length;
      
      if (currentUsage + newItemSize > this.config.maxStorageSize) {
        this.addWarning({
          type: 'warning',
          message: 'Storage operation would exceed size limit',
          severity: 'medium',
          recommendation: 'Clean up old data or enable server backup',
        });
      }
    }

    // Check for sensitive keys
    const sensitiveKeyPatterns = [
      /api[_-]?key/i,
      /token/i,
      /secret/i,
      /password/i,
    ];

    if (sensitiveKeyPatterns.some(pattern => pattern.test(key))) {
      if (!this.config.encryptionRequired) {
        this.addWarning({
          type: 'warning',
          message: `Potentially sensitive data stored without encryption: ${key}`,
          severity: 'high',
          recommendation: 'Enable encryption for sensitive data',
        });
      }
    }
  }

  /**
   * Monitor network requests
   */
  private monitorNetworkRequests(): void {
    const originalFetch = window.fetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      // Validate outgoing requests
      this.validateNetworkRequest(url, init);
      
      try {
        const response = await originalFetch(input, init);
        this.validateNetworkResponse(url, response.clone());
        return response;
      } catch (error) {
        this.handleNetworkError(url, error);
        throw error;
      }
    };
  }

  /**
   * Validate network request
   */
  private validateNetworkRequest(url: string, init?: RequestInit): void {
    // Check for HTTPS
    if (!url.startsWith('https://') && !url.includes('localhost')) {
      this.addWarning({
        type: 'error',
        message: `Non-HTTPS request to: ${url}`,
        severity: 'critical',
        recommendation: 'Use HTTPS for all external requests',
      });
    }

    // Check for sensitive data in headers
    if (init?.headers) {
      const headerString = JSON.stringify(init.headers);
      if (/sk-[a-zA-Z0-9]{48}/.test(headerString)) {
        logger.warn('API key detected in request headers - this is normal for LLM calls');
      }
    }
  }

  /**
   * Validate network response
   */
  private validateNetworkResponse(url: string, response: Response): void {
    // Check for security headers in responses
    const securityHeaders = [
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
    ];

    const missingHeaders = securityHeaders.filter(header => !response.headers.get(header));
    
    if (missingHeaders.length > 0) {
      logger.debug(`Response from ${url} missing security headers:`, missingHeaders);
    }
  }

  /**
   * Handle network errors
   */
  private handleNetworkError(url: string, error: any): void {
    if (error.message?.includes('CORS')) {
      this.addWarning({
        type: 'error',
        message: `CORS error for ${url}`,
        severity: 'high',
        recommendation: 'Check CORS configuration or use server proxy',
      });
    }
  }

  /**
   * Get current localStorage usage
   */
  private getStorageUsage(): number {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  }

  /**
   * Add security warning
   */
  private addWarning(warning: Omit<SecurityWarning, 'timestamp'>): void {
    this.warnings.push({
      ...warning,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all security warnings
   */
  getWarnings(): SecurityWarning[] {
    return [...this.warnings];
  }

  /**
   * Clear warnings
   */
  clearWarnings(): void {
    this.warnings = [];
  }

  /**
   * Get security status
   */
  getSecurityStatus(): {
    isSecure: boolean;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    recommendations: string[];
  } {
    const critical = this.warnings.filter(w => w.severity === 'critical').length;
    const high = this.warnings.filter(w => w.severity === 'high').length;
    const medium = this.warnings.filter(w => w.severity === 'medium').length;
    const low = this.warnings.filter(w => w.severity === 'low').length;

    return {
      isSecure: critical === 0 && high === 0,
      criticalIssues: critical,
      highIssues: high,
      mediumIssues: medium,
      lowIssues: low,
      recommendations: this.warnings.map(w => w.recommendation),
    };
  }

  /**
   * Generate security report
   */
  generateSecurityReport(): string {
    const status = this.getSecurityStatus();
    const report = [
      '# LibreChat Client Security Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Security Status',
      `Overall Status: ${status.isSecure ? '✅ SECURE' : '⚠️  ISSUES DETECTED'}`,
      `Critical Issues: ${status.criticalIssues}`,
      `High Priority Issues: ${status.highIssues}`,
      `Medium Priority Issues: ${status.mediumIssues}`,
      `Low Priority Issues: ${status.lowIssues}`,
      '',
      '## Issues Details',
      ...this.warnings.map(w => 
        `- **${w.severity.toUpperCase()}**: ${w.message}\n  *Recommendation: ${w.recommendation}*`
      ),
      '',
      '## Configuration',
      `HTTPS Enabled: ${window.location.protocol === 'https:'}`,
      `CSP Enabled: ${this.config.enableCSP}`,
      `Encryption Required: ${this.config.encryptionRequired}`,
      `Input Sanitization: ${this.config.sanitizeInputs}`,
      `Origin Validation: ${this.config.validateOrigin}`,
    ];

    return report.join('\n');
  }
}

// Global security manager instance
export const securityManager = new SecurityManager();

// Auto-start monitoring
securityManager.startMonitoring();

export default securityManager;