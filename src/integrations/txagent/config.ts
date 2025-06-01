/**
 * TxAgent Frontend Configuration
 * 
 * This file provides TxAgent integration for SynapseRx to replace OpenAI assistant calls.
 */

// TxAgent configuration
export const TXAGENT_CONFIG = {
  // TxAgent wrapper service endpoint
  baseUrl: "http://localhost:8001",
  endpoints: {
    assistant: "/openai-assistant",
    health: "/health",
    conversations: "/conversations"
  },
  
  // Assistant types supported (same as OpenAI version)
  assistantTypes: {
    SHORTAGE: "shortage",
    DOCUMENT: "document"
  },
  
  // Default request configuration
  defaultHeaders: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  
  // Timeout settings
  timeout: 30000, // 30 seconds
  
  // Retry configuration
  retries: 3,
  retryDelay: 1000 // 1 second
};

/**
 * TxAgent API Client
 * Drop-in replacement for OpenAI assistant calls
 */
export class TxAgentClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(config = TXAGENT_CONFIG) {
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.defaultHeaders;
  }

  /**
   * Call TxAgent assistant - matches OpenAI assistant interface
   * This replaces supabase.functions.invoke("openai-assistant")
   */
  async callAssistant(payload: {
    assistantType: string;
    messages?: Array<{
      id?: string;
      role: string;
      content: string;
      timestamp?: string;
    }>;
    drugData?: any;
    allShortageData?: any[];
    documentContent?: string;
    sessionId?: string;
    threadId?: string;
    generateDocument?: boolean;
  }) {
    try {
      const response = await fetch(`${this.baseUrl}${TXAGENT_CONFIG.endpoints.assistant}`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`TxAgent request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Return in same format as Supabase function
      return {
        data,
        error: null
      };
      
    } catch (error) {
      console.error('TxAgent request error:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Health check for TxAgent service
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}${TXAGENT_CONFIG.endpoints.health}`);
      return await response.json();
    } catch (error) {
      console.error('TxAgent health check failed:', error);
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Get conversation by thread ID
   */
  async getConversation(threadId: string) {
    try {
      const response = await fetch(`${this.baseUrl}${TXAGENT_CONFIG.endpoints.conversations}/${threadId}`);
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return null;
    }
  }
}

// Create singleton instance
export const txAgentClient = new TxAgentClient();

/**
 * Environment-aware configuration
 * Allows switching between OpenAI and TxAgent based on environment
 */
export const getAssistantConfig = () => {
  // Check if TxAgent should be used (default to true for local development)
  // Use string environment variables with fallback
  const useTxAgent = typeof window !== 'undefined' 
    ? (window as any).NEXT_PUBLIC_USE_TXAGENT !== 'false'
    : true; // Default to TxAgent in development
    
  const txAgentUrl = typeof window !== 'undefined'
    ? (window as any).NEXT_PUBLIC_TXAGENT_URL || 'http://localhost:8001'
    : 'http://localhost:8001';
  
  if (useTxAgent) {
    return {
      type: 'txagent' as const,
      client: new TxAgentClient({
        ...TXAGENT_CONFIG,
        baseUrl: txAgentUrl
      })
    };
  }
  
  return {
    type: 'openai' as const,
    client: null // Will use existing OpenAI logic
  };
};

export default TXAGENT_CONFIG; 