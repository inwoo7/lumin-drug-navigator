/**
 * TxAgent Frontend Configuration
 * 
 * This file shows how to update your frontend to use TxAgent instead of OpenAI.
 * Replace the OpenAI endpoints with TxAgent wrapper endpoints.
 */

// Current OpenAI configuration (to be replaced)
const CURRENT_OPENAI_CONFIG = {
  endpoint: "supabase.functions.invoke('openai-assistant')",
  assistantIds: {
    shortage: "asst_p9adU6tFNefnEmlqMDmuAbeg",
    document: "asst_YD3cbgbhibchd3NltzVtP2VO"
  }
};

// New TxAgent configuration
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
 * Example: How to update use-openai-assistant.ts hook
 * 
 * Replace this line in your existing hook:
 * 
 * OLD:
 * const { data, error } = await supabase.functions.invoke("openai-assistant", {
 *   body: functionPayload
 * });
 * 
 * NEW:
 * const { data, error } = await txAgentClient.callAssistant(functionPayload);
 */

/**
 * Migration guide for existing components:
 * 
 * 1. Install required packages:
 *    pip install fastapi uvicorn pydantic transformers
 * 
 * 2. Start TxAgent wrapper service:
 *    python start_txagent_wrapper.py
 * 
 * 3. Update your use-openai-assistant.ts hook:
 *    - Import txAgentClient from this file
 *    - Replace supabase.functions.invoke calls with txAgentClient.callAssistant
 *    - Update error handling if needed
 * 
 * 4. Test the integration:
 *    - Verify health endpoint: http://localhost:8001/health
 *    - Test drug shortage analysis
 *    - Test document generation
 * 
 * 5. Optional: Update environment configuration
 *    - Add TXAGENT_BASE_URL environment variable
 *    - Add fallback to OpenAI if TxAgent is unavailable
 */

/**
 * Environment-aware configuration
 * Allows switching between OpenAI and TxAgent based on environment
 */
export const getAssistantConfig = () => {
  // Safely access environment variables (works in both Node.js and browser)
  const useTxAgent = typeof window !== 'undefined' 
    ? (window as any).NEXT_PUBLIC_USE_TXAGENT === 'true'
    : false;
  
  const txAgentUrl = typeof window !== 'undefined'
    ? (window as any).NEXT_PUBLIC_TXAGENT_URL || 'http://localhost:8001'
    : 'http://localhost:8001';
  
  if (useTxAgent) {
    return {
      type: 'txagent',
      client: new TxAgentClient({
        ...TXAGENT_CONFIG,
        baseUrl: txAgentUrl
      })
    };
  }
  
  return {
    type: 'openai',
    // Keep existing OpenAI configuration
  };
};

export default TXAGENT_CONFIG; 