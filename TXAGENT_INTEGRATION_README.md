# TxAgent Integration Guide for SynapseRx

## Overview

This guide explains how to replace your current OpenAI GPT assistant with TxAgent, a specialized biomedical AI assistant. TxAgent provides the same interface as your OpenAI setup while offering enhanced biomedical expertise through 214 specialized tools.

## ✅ What's Been Created

### 1. TxAgent Wrapper Service
- **File**: `txagent_assistant_wrapper.py`
- **Purpose**: FastAPI service that mimics your OpenAI assistant interface
- **Port**: 8001
- **Features**:
  - Drop-in replacement for OpenAI assistant calls
  - Same request/response format as your Supabase Edge Function
  - Conversation management with thread IDs
  - Support for both "shortage" and "document" assistant types

### 2. Startup Script
- **File**: `start_txagent_wrapper.py`
- **Purpose**: Easy way to start the TxAgent service with proper error checking
- **Features**:
  - Checks required dependencies
  - Validates TxAgent files
  - Starts service with proper configuration

### 3. Frontend Configuration
- **File**: `txagent_frontend_config.ts`
- **Purpose**: Client-side configuration for connecting to TxAgent
- **Features**:
  - Drop-in replacement for Supabase function calls
  - Environment-aware configuration
  - Error handling and health checks

### 4. Test Suite
- **File**: `test_txagent_wrapper.py`
- **Purpose**: Comprehensive testing of TxAgent functionality
- **Tests**: Shortage analysis, document generation, conversation continuity

## 🚀 Quick Start

### Step 1: Start TxAgent Service
```bash
# Make sure you're in the txagent-env virtual environment
python start_txagent_wrapper.py
```

Service will be available at: `http://localhost:8001`

### Step 2: Verify Service is Running
```bash
# Test health endpoint
curl http://localhost:8001/health

# Or run comprehensive tests
python test_txagent_wrapper.py
```

### Step 3: Update Your Frontend

Replace OpenAI calls in `src/hooks/use-openai-assistant.ts`:

**OLD:**
```typescript
const { data, error } = await supabase.functions.invoke("openai-assistant", {
  body: functionPayload
});
```

**NEW:**
```typescript
import { txAgentClient } from "./txagent_frontend_config";

const { data, error } = await txAgentClient.callAssistant(functionPayload);
```

## 📋 Detailed Integration Steps

### 1. Install Dependencies (Already Done)
```bash
pip install fastapi uvicorn pydantic transformers
```

### 2. File Structure
```
your-project/
├── txagent_assistant_wrapper.py    # Main TxAgent service
├── start_txagent_wrapper.py        # Startup script
├── test_txagent_wrapper.py         # Test suite
├── txagent_frontend_config.ts      # Frontend config
├── working_drug_agent.py           # TxAgent implementation (optional)
└── TXAGENT_INTEGRATION_README.md   # This file
```

### 3. Frontend Integration Options

#### Option A: Direct Replacement (Recommended for testing)
Update `src/hooks/use-openai-assistant.ts`:

```typescript
// Add this import at the top
import { txAgentClient } from "../path/to/txagent_frontend_config";

// Replace all instances of:
// supabase.functions.invoke("openai-assistant", { body: payload })
// with:
// txAgentClient.callAssistant(payload)
```

#### Option B: Environment-Based Switching
```typescript
import { getAssistantConfig } from "../path/to/txagent_frontend_config";

const assistantConfig = getAssistantConfig();

if (assistantConfig.type === 'txagent') {
  const { data, error } = await assistantConfig.client.callAssistant(payload);
} else {
  // Keep existing OpenAI logic
  const { data, error } = await supabase.functions.invoke("openai-assistant", {
    body: payload
  });
}
```

### 4. Environment Variables (Optional)
Add to your `.env` file:
```
NEXT_PUBLIC_USE_TXAGENT=true
NEXT_PUBLIC_TXAGENT_URL=http://localhost:8001
```

## 🔄 API Compatibility

The TxAgent wrapper maintains **100% compatibility** with your existing OpenAI assistant interface:

### Request Format (Unchanged)
```json
{
  "assistantType": "shortage" | "document",
  "drugData": { /* Drug Shortages Canada API data */ },
  "allShortageData": [ /* Array of shortage data */ ],
  "messages": [ /* Chat messages */ ],
  "sessionId": "string",
  "threadId": "string",
  "generateDocument": boolean,
  "documentContent": "string"
}
```

### Response Format (Unchanged)
```json
{
  "threadId": "string",
  "messages": [
    {
      "id": "string",
      "role": "user" | "assistant",
      "content": "string",
      "timestamp": "string"
    }
  ],
  "error": null | "string"
}
```

## 📊 Test Results

✅ **Health Check**: Service running and TxAgent loaded  
✅ **Shortage Analysis**: Analyzing drug shortages with biomedical insights  
✅ **Document Generation**: Creating shortage management documents  
✅ **Conversation Continuity**: Maintaining context across messages  

## 🎯 Benefits of TxAgent vs OpenAI

### ✅ TxAgent Advantages
- **Specialized biomedical knowledge**: 214 biomedical tools (FDA drug labeling, clinical guidelines)
- **Cost-effective**: No API usage fees
- **Privacy**: Runs locally, no data sent to external APIs
- **Customizable**: Full control over the model and responses
- **Drug-specific expertise**: Built-in knowledge of therapeutic alternatives

### ⚠️ Considerations
- **Resource requirements**: Needs local GPU/CPU resources
- **Model size**: 8B parameters vs GPT-4's larger size
- **Maintenance**: Self-hosted service requires monitoring

## 🔧 Customization for Your Templates

When you're ready to implement your custom templates (Step 2), you can modify the `TxAgentAssistant` class in `txagent_assistant_wrapper.py`:

```python
# In txagent_assistant_wrapper.py
class TxAgentAssistant:
    def __init__(self):
        # Add your custom templates here
        self.your_custom_template = """
        Your custom template format...
        """
    
    async def analyze_shortage(self, drug_data, all_shortage_data=None):
        # Apply your custom template logic here
        # Format response according to your specifications
        pass
```

## 🚨 Troubleshooting

### Service Won't Start
1. Check if port 8001 is available: `netstat -an | findstr 8001`
2. Verify virtual environment: `pip list | findstr fastapi`
3. Check Python path and imports

### API Calls Fail
1. Verify service is running: `curl http://localhost:8001/health`
2. Check request format matches expected schema
3. Review service logs for detailed error messages

### Frontend Integration Issues
1. Ensure CORS is properly configured
2. Check network connectivity to localhost:8001
3. Verify request/response format compatibility

## 📞 Support

If you encounter issues:

1. **Check service logs**: The TxAgent wrapper provides detailed logging
2. **Run test suite**: `python test_txagent_wrapper.py`
3. **Verify health endpoint**: `curl http://localhost:8001/health`
4. **Review configuration**: Ensure all files are in place

## 🎯 Next Steps

1. ✅ **TxAgent wrapper created and tested**
2. 🔄 **Update frontend to use TxAgent** (your current task)
3. 📝 **Implement custom response templates** (Step 2)
4. 🧪 **Test with real Drug Shortages Canada API data**
5. 🚀 **Deploy to production environment**

---

**Status**: Step 1 Complete ✅  
**Ready for**: Frontend integration and custom template implementation 