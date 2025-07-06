# Lumin Drug Navigator AI System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [AI Model Architecture](#ai-model-architecture)
3. [Prompts & Instructions](#prompts--instructions)
4. [Decision Logic & Triggers](#decision-logic--triggers)
5. [User Pathways & Flows](#user-pathways--flows)
6. [Technical Implementation](#technical-implementation)

---

## System Overview

### Models Used
- **TxAgent**: Specialized clinical AI model (via RunPod API)
- **GPT-4o**: General purpose AI (via OpenAI API)

### Assistant Types
- **Document Assistant**: Generates and edits drug shortage documents
- **Shortage Assistant**: Provides drug shortage analysis and Q&A

### Default Model Selection
- **Document sessions**: TxAgent (specialized for clinical documents)
- **Info sessions**: OpenAI GPT-4o (general analysis)
- **User can switch**: Via ModelSelector component

---

## AI Model Architecture

### TxAgent Configuration
```typescript
TXAGENT_BASE_URL = "https://api.runpod.ai/v2/os7ld1gn1e2us3/openai/v1"
TXAGENT_MODEL = "mims-harvard/TxAgent-T1-Llama-3.1-8B"
TXAGENT_TIMEOUT_DOCUMENT = 180000 // 3 minutes
TXAGENT_TIMEOUT_CHAT = 45000 // 45 seconds
MAX_RETRIES = 3
```

### OpenAI Configuration
```typescript
SHORTAGE_ASSISTANT_ID = "asst_p9adU6tFNefnEmlqMDmuAbeg"
DOCUMENT_ASSISTANT_ID = "asst_YD3cbgbhibchd3NltzVtP2VO"
```

---

## Prompts & Instructions

### 1. TxAgent Prompts

#### 1.1 Document Generation (Initial)
**Trigger**: `generateDocument = true` AND `documentContent` is empty

```
You are a clinical decision support LLM that is built to help clinicians and decision makers make better decisions about the impact of a drug shortage. Your task is to generate a drug shortage document for "${drugName}". This document will be used to summarize the potential impact but also to help in the response. 

You MUST generate the document using markdown and follow all instructions precisely.

**CRITICAL INSTRUCTIONS:**
- NEVER leave any section with "N/A", "TBD", "To be determined", or blank values. If you don't have specific information, provide general clinical guidance based on the drug class and common clinical practice.
- Take into account the formulation of the shortage. This can be a difference for many drugs. 
- Research and provide accurate therapeutic information based on the drug name "${drugName}". Use information that is up-to-date and is based on multiple sources. 
- Always fill in all sections with meaningful clinical content that can be acted upon by hospital staff. This is information meant for clinicians so be technical and have enough information for them to draw upon. 
- The document can be no longer than 5 pages.
- EVERY section must contain substantive clinical information. Do not create empty sections.
- If you're unsure about specific details, provide general guidance based on the drug's therapeutic class and known clinical uses. 

**DOCUMENT STRUCTURE REQUIREMENTS:**
1. Start with the main title: "Drug Shortage Clinical Response Template"
2. Add the following lines, populating the drug name and date:
   - **Drug Name:** ${drugName}
   - **Date:** ${currentDate}
   - **Prepared by:** [Your Name]
   - **For Use By:** Clinicians, Pharmacists, Formulary Committees, Health System Planners

3. Create a level 3 markdown heading titled "1. Current Product Shortage Status". Under it, create a bulleted list for:
   - **Molecule:** Research and provide the generic/chemical name
   - **Formulations in Shortage (Canada):** Research common formulations for this drug
   - **Available Market Alternatives:** Research and list available alternatives

4. Create a level 3 markdown heading titled "2. Major Indications". Under it, create bulleted lists for:
   - **On-label:** Research and provide FDA/Health Canada approved indications. Use the full language from the indication. 
   - **Common Off-label:** Research and provide all known off-label uses that the pharmacist should know about and have on their radar.

5. Create a level 3 markdown heading titled "3. Therapeutic Alternatives by Indication". Under it, create bulleted lists sorted by "Indication", (this should map over to the above section) with "Alternatives" and "Notes" for each indication. Alternatives should be equivalent where feasible. This information can be drawn from clinical guidelines or other information. If no equivalent drug is available offer the next line therapy and note that it is a next line and any limitations. Populate with all indications listed in the above section and their alternatives that follow guidelines recommendations for the indication. This should take into account the formulation and note it. One of the alternatives could be lower dosages or combinations. 

Lastly, highlight indications that are more in need of this drug if they had to be prioritized. Account for size of the population and other therapeutic options. When doing this also take into account if the other alternative also has an active shortage. Try not to suggest things in shortage. 

6. Create a level 3 markdown heading titled "4. Subpopulations of Concern". Under it, create bulleted lists sorted by "Population" and their "Considerations". Include actionable info for any subpopulations of concern for the drug, such as Pediatrics, Renal impairment, Pregnant/lactating, and Elderly patients as applicable. If we mention dosage adjustments or alternatives or any sort of recommendation, make sure that the recommendation is actionable, specicific, and can be acted upon by hospital staff.

7. Create a level 3 markdown heading titled "5. Other Considerations". These should only be included if they apply Under it, create bulleted lists for:
   - **Infection control implications:** Provide relevant considerations (be specific)
   - **Communication needs:** Outline communication requirements. This can include things like switching formulations or risks with this switch. Also account for this if there is prioritization or dose reductions to save drug. 
   - **Reconstitution practices:** Provide relevant guidance (be specific). Align this with any recommendations if formulation switches or compounding must/can occur. 
   - **Saving of doses:** Suggest strategies for saving doses (be specific)

[If drug data available]
**Available Drug Data:**
${JSON.stringify(drugData, null, 2)}

Use this data where relevant, but supplement with your clinical knowledge to ensure no section is left incomplete.

[If no drug data]
**No specific shortage data available.** Research the drug "${drugName}" and provide comprehensive clinical information based on your knowledge.

Generate the complete document now:
```

#### 1.2 Document Editing
**Trigger**: `isDocumentEdit = true` AND `documentContent` exists

```
You are a clinical decision support LLM specializing in drug shortage management documentation. Current document content: ${documentContent}. The user wants to edit the document. Their request is in the last message. Update the document based on their request and return the ENTIRE, new version of the document as a single markdown block. Focus on practical clinical information for hospital staff.

User messages:
${userMessages}
```

#### 1.3 Drug Shortage Analysis
**Trigger**: `assistantType = "shortage"`

```
You are a clinical decision support LLM trained in advanced therapeutic reasoning, Canadian guidelines, and drug shortage management. 

[If drug data available]
Analyze this drug shortage data: ${JSON.stringify(drugData, null, 2)}. 

[If additional shortage data available]
Additional shortage context: ${JSON.stringify(allShortageData, null, 2)}. 

Provide detailed analysis of the shortage situation, therapeutic alternatives, conservation strategies, and clinical guidance.

User messages:
${userMessages}
```

#### 1.4 General Chat/Questions
**Trigger**: `assistantType = "document"` AND NOT `generateDocument` AND NOT `isDocumentEdit`

```
You are a clinical decision support LLM specializing in drug shortage management documentation. Focus on practical clinical information for hospital staff.

User messages:
${userMessages}
```

### 2. OpenAI GPT-4o System

**Important**: OpenAI uses pre-configured Assistant IDs with built-in system prompts, NOT custom prompts like TxAgent.

#### 2.1 Pre-configured Assistants
```typescript
SHORTAGE_ASSISTANT_ID = "asst_p9adU6tFNefnEmlqMDmuAbeg"  // Pre-configured for shortage analysis
DOCUMENT_ASSISTANT_ID = "asst_YD3cbgbhibchd3NltzVtP2VO"  // Pre-configured for document work
```

#### 2.2 Initial Context Message (New Thread Only)
**Trigger**: When creating a new thread

**For Shortage Assistant:**
```
You are analyzing drug shortage data for ${drugName}. 

[If drug data available]
This is the specific report data in full raw JSON format: ${JSON.stringify(drugData, null, 2)}. 

[If all shortage data available]
Here is comprehensive data about all related shortages in full raw JSON format: ${JSON.stringify(allShortageData, null, 2)}. 

Please provide a detailed analysis of the shortage situation, including therapeutic alternatives, conservation strategies, patient prioritization, and other relevant information.
```

**For Document Assistant:**
```
You are helping create a concise document about a drug shortage. 

[If drug data available]
This is the specific drug data in full raw JSON format: ${JSON.stringify(drugData, null, 2)}. 

[If all shortage data available]
Here is comprehensive data about all related shortages in full raw JSON format: ${JSON.stringify(allShortageData, null, 2)}. 

[If document content exists]
Here is the current document content that you should use as a base: "${documentContent}". 

[If generating document]
Please generate a complete initial markdown-formatted shortage management plan document based on the data provided. Include all relevant sections such as overview, therapeutic alternatives, conservation strategies, patient prioritization, implementation plan, communication strategy, and resources. 

[If not generating document]
Please generate an initial draft for a hospital staff communication document. 

Focus on: expected shortage resolution date, therapeutic alternatives, conservation strategies, and other key information hospital staff need to know.
```

#### 2.3 Runtime Instructions (Every Request)
**Trigger**: Each assistant run

**For Shortage Assistant:**
```
You are analyzing drug shortage data. Provide detailed insights about ${drugName} shortage, therapeutic alternatives, conservation strategies, and other relevant information.
```

**For Document Assistant:**
```
You are helping create a concise document about a drug shortage. 

[If document content exists]
The current document is: "${documentContent}". 

[If generating document and no existing content]
Generate a complete initial shortage management plan document in markdown format with clear sections. 

[If document edit]
The user is asking to modify the document. Please make the requested changes and return the *entire* updated document as a single markdown block. Do not just describe the changes.

[If question about document]
The user is asking a question about the document. Provide a concise answer and do not return the whole document.
```

---

## Decision Logic & Triggers

### 1. Document Editing Detection

#### Automatic Document Editing Triggers
The system automatically updates the document when ALL conditions are met:
- `assistantType === "document"`
- User message contains specific keywords (case-insensitive):
  - "remove", "add", "change", "update", "edit", "modify", "delete"
  - "list", "what are", "can you", "for each"

```typescript
const isDocumentEdit = assistantType === "document" && (
  content.toLowerCase().includes("remove") ||
  content.toLowerCase().includes("add") ||
  content.toLowerCase().includes("change") ||
  content.toLowerCase().includes("update") ||
  content.toLowerCase().includes("edit") ||
  content.toLowerCase().includes("modify") ||
  content.toLowerCase().includes("delete") ||
  content.toLowerCase().includes("list") ||
  content.toLowerCase().includes("what are") ||
  content.toLowerCase().includes("can you") ||
  content.toLowerCase().includes("for each")
);
```

#### Automatic Edit Behavior
When `isDocumentEdit = true`:
1. Document content is immediately updated via `onDocumentUpdate()`
2. User sees: "✅ Document has been updated successfully with your requested changes."
3. No "Apply to Document" button needed

### 2. "Apply to Document" Button Display

#### Button Appears When:
- `sessionType === "document"`
- AI response contains document-like content (detected by `isDocumentContent()`)
- Response was NOT automatically applied (not detected as edit request)

#### Document Content Detection Logic
```typescript
const isDocumentContent = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  
  const headerCount = (text.match(/^#{1,6}\s/gm) || []).length;
  const hasStructure = text.includes('##') || text.includes('**') || text.includes('###');
  const isLongForm = text.length > 300;
  const hasMainTitle = text.includes('Drug Shortage Clinical Response Template');
  
  return headerCount > 1 || (hasStructure && isLongForm) || text.length > 1000;
};
```

### 3. Model Selection Logic

#### Default Model Assignment
```typescript
// ChatInterface component
const [currentModel, setCurrentModel] = useState<ModelType>(
  sessionType === "document" ? "txagent" : "openai"
);

// Document Assistant (SessionPage)
modelType: "txagent" // Always use TxAgent for document generation

// Info Assistant (SessionPage)  
// Uses default "openai" from hook
```

#### Model Switching
Users can switch models via ModelSelector component:
- **Advanced Clinical Model** (TxAgent): For specialized medical scenarios
- **General Model** (GPT-4o): For general purpose assistance

### 4. Document Generation Triggers

#### Automatic Document Generation
Occurs when ALL conditions are met:
- `assistantType === "document"`
- `generateDocument === true`
- `documentContent === ""`
- `sessionId` exists
- `drugName` exists
- `!docLoadAttempted`

```typescript
// Document generation conditions
autoInitialize: !!sessionId && !!drugName && documentContent === "" && !docLoadAttempted,
generateDocument: !!sessionId && !!drugName && documentContent === "" && !docLoadAttempted,
```

---

## User Pathways & Flows

### 1. Primary User Journey

#### Step 1: Drug Search
- User enters drug name on Dashboard
- System creates session in `search_sessions` table
- User navigates to SessionPage with `sessionId`

#### Step 2: Session Page Load
- System loads session data and drug name
- Auto-selects first shortage report if available
- Defaults to "Document" tab for new searches
- Initializes Document Assistant with TxAgent

#### Step 3: Document Generation
- **Automatic**: If no existing document, TxAgent generates one
- **Loading State**: Shows "Generating document..." with progress
- **Success**: Document appears in DocumentEditor
- **Error**: Shows error message with retry option

#### Step 4: Document Interaction
- **View**: User reads generated document
- **Edit**: User can modify document via chat or direct editing
- **Chat**: User can ask questions about the document

#### Step 5: Info Analysis
- User switches to "Info" tab
- Shortage Assistant analyzes drug shortage data
- Provides therapeutic alternatives and clinical guidance

### 2. Tab Navigation Flow

#### Document Tab
- **Purpose**: Generate and edit shortage management documents
- **Default Model**: TxAgent (specialized clinical)
- **Features**:
  - Automatic document generation
  - Direct document editing
  - Chat-based document modifications
  - Document export/save

#### Info Tab  
- **Purpose**: Analyze drug shortage data and provide clinical guidance
- **Default Model**: OpenAI GPT-4o (general analysis)
- **Features**:
  - Shortage data analysis
  - Therapeutic alternatives
  - Conservation strategies
  - Q&A about shortage

### 3. Model Switching Flow

#### User-Initiated Switching
1. User clicks ModelSelector in chat interface
2. System calls `switchModel()` function
3. New model is used for subsequent messages
4. Message badges show which model generated each response

#### Model Compatibility
- **TxAgent**: Creates `txagent_${timestamp}` thread IDs
- **OpenAI**: Creates `thread_${id}` thread IDs
- **Cross-model**: Threads are not directly compatible
- **Fallback**: OpenAI can be used as fallback for TxAgent failures (chat only)

### 4. Document Editing Pathways

#### Automatic Editing Path
1. User types message with edit keywords
2. System detects `isDocumentEdit = true`
3. AI processes edit request
4. Document automatically updates
5. User sees success confirmation

#### Manual Apply Path
1. User asks general question
2. AI provides response with document-like content
3. "Apply to Document" button appears
4. User manually clicks to apply changes
5. Document updates with new content

#### Direct Editing Path
1. User clicks in DocumentEditor
2. Makes direct text changes
3. System auto-saves changes
4. Changes persist in database

---

## Technical Implementation

### 1. API Routing Logic

#### Model Selection
```typescript
// Route to appropriate handler based on model type
if (modelType === "txagent") {
  return await handleTxAgentRequest({...});
} else {
  return await handleOpenAIRequest({...});
}
```

#### TxAgent Implementation
- **Single-shot prompting**: All context included in one request
- **No conversation history**: Each request is independent
- **Retry logic**: 3 attempts with exponential backoff
- **Timeout**: 3 minutes for documents, 45 seconds for chat

#### OpenAI Implementation
- **Thread-based**: Maintains conversation history
- **Assistant API**: Uses predefined assistant configurations
- **Polling**: Waits for completion before returning response

### 2. Document Generation Workflow

#### Background Job System
1. **Job Creation**: `enqueue-doc` function creates job in `document_generation_jobs`
2. **Worker Processing**: GitHub Actions runs `process-doc-jobs` every 7 minutes
3. **TxAgent Call**: Worker calls TxAgent via `openai-assistant` function
4. **Document Save**: Completed document saved via `save_session_document`
5. **Status Updates**: Real-time updates via Supabase subscriptions

#### Frontend Polling
- **Real-time**: Supabase subscriptions for job status changes
- **Polling**: Every 5 seconds as backup
- **Timeout**: 5 minutes maximum wait time
- **Error Handling**: Graceful degradation with retry options

### 3. State Management

#### Session State
- `sessionId`: Unique identifier for drug search session
- `drugName`: Drug being analyzed
- `documentContent`: Current document text
- `selectedReportId`: Active shortage report
- `activeTab`: Current tab ("document" or "info")

#### AI State
- `currentModel`: Active AI model ("txagent" or "openai")
- `messages`: Chat conversation history
- `threadId`: Conversation thread identifier
- `isLoading`: Request in progress
- `error`: Error state

#### Document State
- `isDocumentGenerated`: Document has been created
- `isDocumentInitializing`: Document generation in progress
- `docGenerationError`: Document generation failed
- `isSaving`: Document save in progress

### 4. Error Handling

#### TxAgent Errors
- **API Failures**: Retry with exponential backoff
- **Timeout**: 3 minutes for documents, 45 seconds for chat
- **Empty Response**: Validation and retry with enhanced prompt
- **Resource Limits**: Graceful error message, no fallback for documents

#### OpenAI Errors
- **API Failures**: Standard error handling
- **Thread Issues**: Create new thread if invalid
- **Rate Limits**: Built-in OpenAI SDK handling

#### Fallback Strategy
- **Chat Only**: TxAgent failures fall back to OpenAI for chat
- **No Document Fallback**: Document generation failures do not fall back
- **User Retry**: Users can manually retry failed operations

---

## Configuration & Constants

### Environment Variables
```typescript
// TxAgent
RUNPOD_API_KEY: RunPod API key for TxAgent access
TXAGENT_BASE_URL: "https://api.runpod.ai/v2/os7ld1gn1e2us3/openai/v1"

// OpenAI
OPENAI_API_KEY: OpenAI API key
SHORTAGE_ASSISTANT_ID: "asst_p9adU6tFNefnEmlqMDmuAbeg"
DOCUMENT_ASSISTANT_ID: "asst_YD3cbgbhibchd3NltzVtP2VO"

// Supabase
SUPABASE_URL: Supabase project URL
SUPABASE_ANON_KEY: Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
```

### Timeouts & Limits
```typescript
// TxAgent
TXAGENT_TIMEOUT_DOCUMENT: 180000 // 3 minutes
TXAGENT_TIMEOUT_CHAT: 45000 // 45 seconds
MAX_RETRIES: 3

// Document Generation
MAX_ATTEMPTS: 3 // Job retry attempts
POLLING_INTERVAL: 5000 // 5 seconds
GENERATION_TIMEOUT: 300000 // 5 minutes

// OpenAI
MAX_POLLING_ATTEMPTS: 30 // 30 seconds timeout
POLL_INTERVAL: 1000 // 1 second
```

---

*This documentation covers the complete AI system architecture, prompting strategies, decision logic, and user flows for the Lumin Drug Navigator application.* 