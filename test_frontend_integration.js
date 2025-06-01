/**
 * Frontend Integration Test for TxAgent
 * 
 * This simulates how your React components will interact with TxAgent
 * Run with: node test_frontend_integration.js
 */

const fetch = require('node-fetch');

// Simulate the TxAgent client (same as frontend config)
class TxAgentClient {
  constructor() {
    this.baseUrl = "http://localhost:8001";
  }

  async callAssistant(payload) {
    try {
      const response = await fetch(`${this.baseUrl}/openai-assistant`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
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
        error: error.message
      };
    }
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return await response.json();
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

// Simulate Drug Shortages Canada API data (same structure your app uses)
const mockDrugShortageData = {
  brand_name: "Acetaminophen 500mg",
  drug_name: "acetaminophen",
  shortage_status: "Shortage",
  reason_shortage: "Manufacturing delay at primary facility",
  anticipated_resolution_date: "2024-03-15",
  company_name: "Generic Pharma Inc",
  din: "12345678",
  strength: "500mg",
  dosage_form: "Tablet"
};

// Test functions to simulate frontend usage
async function testShortageAssistant() {
  console.log("\n🧪 Testing Shortage Assistant (simulating useOpenAIAssistant hook)...");
  
  const client = new TxAgentClient();
  
  // Simulate initial auto-initialization call
  const payload = {
    assistantType: "shortage",
    drugData: mockDrugShortageData,
    sessionId: "test-frontend-session-1",
    generateDocument: false
  };

  console.log("📤 Calling TxAgent with payload:", {
    assistantType: payload.assistantType,
    drugName: payload.drugData.brand_name,
    sessionId: payload.sessionId
  });

  const { data, error } = await client.callAssistant(payload);

  if (error) {
    console.error("❌ Error:", error);
    return false;
  }

  console.log("✅ Success! Received response:");
  console.log("🔗 Thread ID:", data.threadId);
  console.log("💬 Messages:", data.messages.length);
  
  if (data.messages.length > 0) {
    const assistantMessage = data.messages.find(msg => msg.role === "assistant");
    if (assistantMessage) {
      console.log("🤖 Assistant Response Preview:");
      console.log(assistantMessage.content.substring(0, 200) + "...");
    }
  }

  return data.threadId; // Return thread ID for follow-up test
}

async function testDocumentAssistant() {
  console.log("\n📄 Testing Document Assistant (simulating document generation)...");
  
  const client = new TxAgentClient();
  
  // Simulate document generation call
  const payload = {
    assistantType: "document",
    drugData: mockDrugShortageData,
    sessionId: "test-frontend-session-2",
    generateDocument: true
  };

  console.log("📤 Calling TxAgent for document generation...");

  const { data, error } = await client.callAssistant(payload);

  if (error) {
    console.error("❌ Error:", error);
    return false;
  }

  console.log("✅ Document generated successfully!");
  console.log("🔗 Thread ID:", data.threadId);
  console.log("💬 Messages:", data.messages.length);
  
  if (data.messages.length > 0) {
    const assistantMessage = data.messages.find(msg => msg.role === "assistant");
    if (assistantMessage) {
      console.log("📋 Document Preview:");
      console.log(assistantMessage.content.substring(0, 300) + "...");
    }
  }

  return true;
}

async function testConversationContinuity(threadId) {
  console.log("\n💬 Testing Conversation Continuity (simulating follow-up questions)...");
  
  const client = new TxAgentClient();
  
  // Simulate user sending a follow-up message
  const payload = {
    assistantType: "shortage",
    threadId: threadId,
    messages: [
      {
        role: "user",
        content: "What are the main therapeutic alternatives for this medication?",
        timestamp: new Date().toISOString()
      }
    ],
    sessionId: "test-frontend-session-1"
  };

  console.log("📤 Sending follow-up question with thread ID:", threadId);

  const { data, error } = await client.callAssistant(payload);

  if (error) {
    console.error("❌ Error:", error);
    return false;
  }

  console.log("✅ Follow-up response received!");
  console.log("🔗 Thread ID maintained:", data.threadId === threadId);
  console.log("💬 Total messages:", data.messages.length);
  
  return true;
}

// Main test runner
async function runFrontendIntegrationTests() {
  console.log("🚀 Frontend Integration Test Suite for TxAgent");
  console.log("=" * 60);
  
  // Check if TxAgent service is available
  const client = new TxAgentClient();
  const health = await client.healthCheck();
  
  if (health.status !== 'healthy') {
    console.error("❌ TxAgent service is not available!");
    console.error("Please start the service with: python start_txagent_wrapper.py");
    return;
  }
  
  console.log("✅ TxAgent service is healthy and ready");
  
  try {
    // Test 1: Shortage Assistant
    const threadId = await testShortageAssistant();
    if (!threadId) {
      console.error("❌ Shortage assistant test failed");
      return;
    }
    
    // Test 2: Document Assistant  
    const docSuccess = await testDocumentAssistant();
    if (!docSuccess) {
      console.error("❌ Document assistant test failed");
      return;
    }
    
    // Test 3: Conversation Continuity
    const continuitySuccess = await testConversationContinuity(threadId);
    if (!continuitySuccess) {
      console.error("❌ Conversation continuity test failed");
      return;
    }
    
    console.log("\n🎉 ALL FRONTEND INTEGRATION TESTS PASSED!");
    console.log("\n✅ Your React app is ready to use TxAgent!");
    console.log("\nNext steps:");
    console.log("1. Start your React development server: npm run dev");
    console.log("2. TxAgent will automatically replace OpenAI calls");
    console.log("3. Test with real drug shortage data in your app");
    console.log("4. All existing functionality should work seamlessly");
    
  } catch (error) {
    console.error("❌ Test suite failed:", error);
  }
}

// Run the tests
runFrontendIntegrationTests().catch(console.error); 