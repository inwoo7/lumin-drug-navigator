import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

// CORS headers to allow requests from the frontend
const corsHeaders = {
  // Allow requests from any origin (adjust to specific domain in production)
  'Access-Control-Allow-Origin': '*',
  // Specify which headers can be used during the actual request
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // IMPORTANT: Explicitly allow the HTTP methods that the browser may send in the
  // Access-Control-Request-Method header of the pre-flight request. Without this
  // header the pre-flight will fail with a generic CORS error and the main request
  // will never reach the function.
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Get API keys from the environment
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const runpodApiKey = Deno.env.get('RUNPOD_API_KEY');

// OpenAI Assistant IDs for different purposes
const SHORTAGE_ASSISTANT_ID = "asst_p9adU6tFNefnEmlqMDmuAbeg";
const DOCUMENT_ASSISTANT_ID = "asst_YD3cbgbhibchd3NltzVtP2VO";

// TxAgent configuration
const TXAGENT_BASE_URL = "https://api.runpod.ai/v2/os7ld1gn1e2us3/openai/v1";
const TXAGENT_MODEL = "mims-harvard/TxAgent-T1-Llama-3.1-8B";
const TXAGENT_TIMEOUT_DOCUMENT = 180000; // 3 minutes for document generation
const TXAGENT_TIMEOUT_CHAT = 45000; // 45 seconds for chat
const MAX_RETRIES = 3;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Parse the request first to get model type
    console.log("Attempting to parse request body...");
    let requestBody;
    try {
      const rawBody = await req.text();
      console.log("Raw request body length:", rawBody.length);
      console.log("Raw request body start:", rawBody.substring(0, 200));
      requestBody = JSON.parse(rawBody);
      console.log("Request body parsed successfully");
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON in request body", 
          details: parseError.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    const { 
      assistantType,
      modelType = "openai", // Default to OpenAI for backward compatibility
      messages, 
      drugData,
      allShortageData,
      documentContent,
      sessionId,
      threadId,
      generateDocument = false,
      isDocumentEdit = false,
      drugName // NEW: Support drugName when drugData is not available
    } = requestBody;

    console.log(`Received request for ${assistantType} assistant using ${modelType} model`);

    // Validate API keys based on model type
    if (modelType === "txagent" && !runpodApiKey) {
      console.error("RunPod API key not configured");
      return new Response(
        JSON.stringify({ 
          error: "TxAgent API key not configured", 
          missingApiKey: true 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    if (modelType === "txagent") {
      console.log("TxAgent API key configured:", runpodApiKey ? "YES" : "NO");
      console.log("TxAgent endpoint:", TXAGENT_BASE_URL);
    }
    
    if (modelType === "openai" && !openAIApiKey) {
      console.error("OpenAI API key not configured");
      return new Response(
        JSON.stringify({ 
          error: "OpenAI API key not configured", 
          missingApiKey: true 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Request already parsed above

    console.log(`Thread ID: ${threadId || 'new thread'}`);
    console.log(`Generate Document: ${generateDocument}`);
    
    // Route to appropriate handler based on model type
    if (modelType === "txagent") {
      return await handleTxAgentRequest({
        assistantType,
        messages,
        drugData,
        allShortageData,
        documentContent,
        sessionId,
        threadId,
        generateDocument,
        isDocumentEdit,
        drugName
      });
    } else {
      return await handleOpenAIRequest({
        assistantType,
        messages,
        drugData,
        allShortageData,
        documentContent,
        sessionId,
        threadId,
        generateDocument,
        isDocumentEdit,
        drugName
      });
    }
  } catch (error) {
    console.error("Error in assistant function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

// Helper function to normalize drug names
function normalizeDrugName(drugName: string): string {
  if (!drugName) return 'Unknown Drug';
  
  // Remove special formatting like capitals in middle of words
  return drugName
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1$2') // Handle camelCase
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Helper function for retry logic
async function retryTxAgentRequest(requestFn: () => Promise<Response>, maxRetries: number = MAX_RETRIES): Promise<Response> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`TxAgent attempt ${attempt}/${maxRetries}`);
      const response = await requestFn();
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`TxAgent attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 5s, 10s, 20s
        const delay = Math.pow(2, attempt) * 2500;
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// TxAgent handler function
async function handleTxAgentRequest({
  assistantType,
  messages,
  drugData,
  allShortageData,
  documentContent,
  sessionId,
  threadId,
  generateDocument,
  isDocumentEdit,
  drugName
}: any) {
  try {
    // Normalize drug name for better processing
    const normalizedDrugName = normalizeDrugName(drugName || drugData?.drug_name || drugData?.brand_name);
    
    console.log("TxAgent handler starting...", { 
      assistantType, 
      generateDocument, 
      originalDrugName: drugName,
      normalizedDrugName,
      hasDrugData: !!drugData 
    });
    
    // Build the prompt based on assistant type
    let prompt = "";
    
    if (assistantType === "shortage") {
      prompt = `You are a clinical decision support LLM trained in advanced therapeutic reasoning, Canadian guidelines, and drug shortage management. `;
      
      if (drugData) {
        prompt += `Analyze this drug shortage data: ${JSON.stringify(drugData, null, 2)}. `;
      }
      
      if (allShortageData && allShortageData.length > 0) {
        prompt += `Additional shortage context: ${JSON.stringify(allShortageData, null, 2)}. `;
      }
      
      prompt += `Provide detailed analysis of the shortage situation, therapeutic alternatives, conservation strategies, and clinical guidance.`;
    } else {
      if (generateDocument && !documentContent) {
        // This is the prompt for initial document generation.
        // IMPROVED: Handle cases with or without Drug Shortages API data
        const hasApiData = drugData && Object.keys(drugData).length > 0;
        
        prompt = `You are a clinical decision support LLM that is built to help clinicians and decision makers make better decisions about the impact of a drug shortage. Your task is to generate a drug shortage document for "${normalizedDrugName}". This document will be used to summarize the potential impact but also to help in the response. 
You MUST generate the document using markdown and follow all instructions precisely.

**CRITICAL INSTRUCTIONS:**
- NEVER leave any section with "N/A", "TBD", "To be determined", or blank values. If you don't have specific information, provide general clinical guidance based on the drug class and common clinical practice.
- Take into account the formulation of the shortage. This can be a difference for many drugs. 
- Research and provide accurate therapeutic information based on the drug name "${normalizedDrugName}". Use information that is up-to-date and is based on multiple sources. 
- Always fill in all sections with meaningful clinical content that can be acted upon by hospital staff. This is information meant for clinicians so be technical and have enough information for them to draw upon. 
- The document can be no longer than 5 pages.
- EVERY section must contain substantive clinical information. Do not create empty sections.
- If you're unsure about specific details, provide general guidance based on the drug's therapeutic class and known clinical uses. 

**DOCUMENT STRUCTURE REQUIREMENTS:**
1. Start with the main title: "Drug Shortage Clinical Response Template"
2. Add the following lines, populating the drug name and date:
   - **Drug Name:** ${normalizedDrugName}
   - **Date:** ${new Date().toLocaleDateString()}
   - **Prepared by:** [Your Name]
   - **For Use By:** Clinicians, Pharmacists, Formulary Committees, Health System Planners

3. Create a level 3 markdown heading titled "1. Current Product Shortage Status". Under it, create a bulleted list for:
   - **Molecule:** Research and provide the generic/chemical name
   - **Formulations in Shortage (Canada):** ${hasApiData ? 'Use provided data or' : ''} Research common formulations for this drug
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

${hasApiData ? `\n**Available Drug Data:**\n${JSON.stringify(drugData, null, 2)}\n\nUse this data where relevant, but supplement with your clinical knowledge to ensure no section is left incomplete.` : `\n**No specific shortage data available.** Research the drug "${normalizedDrugName}" and provide comprehensive clinical information based on your knowledge.`}
Generate the complete document now:`;
      } else {
        // This is the prompt for follow-up edits or questions.
        prompt = `You are a clinical decision support LLM specializing in drug shortage management documentation.`;
        if (documentContent) prompt += ` Current document content: ${documentContent}.`;
        if (isDocumentEdit) {
          prompt += ` The user wants to edit the document. Their request is in the last message. Update the document based on their request and return the ENTIRE, new version of the document as a single markdown block.`;
        }
        prompt += ` Focus on practical clinical information for hospital staff.`;
      }
    }
    
    // For edit/question prompts, add user message history. For generation, the prompt is self-contained.
    if (!generateDocument || documentContent) {
        const userMessages = messages?.filter(msg => msg.role === 'user').map(msg => msg.content).join('\\n') || '';
        if(userMessages) {
            prompt += `\\n\\nUser messages:\\n${userMessages}`;
        }
    }

    // Determine timeout based on operation type
    const timeout = generateDocument ? TXAGENT_TIMEOUT_DOCUMENT : TXAGENT_TIMEOUT_CHAT;
    
    // Create the request function for retry logic
    const makeRequest = async (): Promise<Response> => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`TxAgent request timeout after ${timeout/1000}s`)), timeout)
      );
      
      const responsePromise = fetch(`${TXAGENT_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${runpodApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: TXAGENT_MODEL,
          messages: [
            { role: "user", content: prompt }
          ],
          max_tokens: generateDocument ? 2000 : 1500, // More tokens for document generation
          temperature: 0.1
        })
      });
      
      const response = await Promise.race([responsePromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TxAgent API error (${response.status}): ${errorText}`);
      }
      
      return response;
    };
    
    // Use retry logic for document generation, single attempt for chat
    const response = generateDocument 
      ? await retryTxAgentRequest(makeRequest)
      : await makeRequest();
    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from TxAgent');
    }
    
    let messageContent = data.choices[0].message.content;
    
    if (!messageContent || messageContent.trim().length === 0) {
      throw new Error('Empty response from TxAgent');
    }
    
    // Additional validation for document generation
    if (generateDocument) {
      console.log(`TxAgent document generation response length: ${messageContent.length} characters`);
      
      // Check if the document appears to have proper structure
      const headerCount = (messageContent.match(/^#{1,6}\s/gm) || []).length;
      const hasMainTitle = messageContent.includes('Drug Shortage Clinical Response Template');
      const hasStructuredContent = messageContent.includes('**') && messageContent.includes('###');
      
      console.log(`Document validation - Headers: ${headerCount}, HasMainTitle: ${hasMainTitle}, HasStructuredContent: ${hasStructuredContent}`);
      
      if (headerCount < 3 || !hasMainTitle || !hasStructuredContent) {
        console.warn('TxAgent generated document appears to be incomplete or improperly structured');
        console.log('First 500 characters of response:', messageContent.substring(0, 500));
        
        // If the document is clearly incomplete, try once more with a more explicit prompt
        if (messageContent.length < 800 || headerCount < 2) {
          console.log('Document appears too short or malformed, attempting retry with enhanced prompt');
          
          const enhancedPrompt = `You are a clinical decision support LLM. Generate a COMPLETE drug shortage document for "${normalizedDrugName}". 

IMPORTANT: You must generate a FULL document with ALL sections filled out with real clinical information. Do not use placeholders, "N/A", or empty sections.

Generate a complete markdown document with this exact structure:

# Drug Shortage Clinical Response Template

**Drug Name:** ${normalizedDrugName}
**Date:** ${new Date().toLocaleDateString()}
**Prepared by:** Clinical AI Assistant
**For Use By:** Clinicians, Pharmacists, Formulary Committees, Health System Planners

### 1. Current Product Shortage Status
- **Molecule:** [Provide the generic name and chemical class]
- **Formulations in Shortage (Canada):** [List common formulations like tablets, injections, etc.]
- **Available Market Alternatives:** [List available alternatives]

### 2. Major Indications
- **On-label:** [List FDA/Health Canada approved uses]
- **Common Off-label:** [List common off-label uses]

### 3. Therapeutic Alternatives by Indication
[For each indication, provide specific alternatives with clinical notes]

### 4. Shortage Management Strategies
- **Conservation strategies:** [Specific dose-sparing approaches]
- **Alternative formulations:** [Other available forms]
- **Compounding options:** [If applicable]

### 5. Clinical Considerations
[Important clinical guidance for prescribers]

Fill every section with detailed, actionable clinical information. Make it comprehensive and clinically useful.`;

          try {
            const retryResponse = await fetch(`${TXAGENT_BASE_URL}/chat/completions`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${runpodApiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: TXAGENT_MODEL,
                messages: [{ role: "user", content: enhancedPrompt }],
                max_tokens: 2500,
                temperature: 0.1
              })
            });
            
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              const retryContent = retryData.choices?.[0]?.message?.content;
              if (retryContent && retryContent.length > messageContent.length) {
                console.log('Enhanced prompt retry successful, using improved response');
                messageContent = retryContent;
              }
            }
          } catch (retryError) {
            console.log('Retry with enhanced prompt failed, using original response');
          }
        }
      }
      
      // Check for common empty content indicators
      const hasEmptyIndicators = /\b(N\/A|TBD|To be determined|TODO|PLACEHOLDER|\[.*\])\b/i.test(messageContent);
      if (hasEmptyIndicators) {
        console.warn('TxAgent document contains empty content indicators');
      }
    }
    
    // Create a mock thread ID for TxAgent (since it doesn't use threads)
    const txagentThreadId = threadId || `txagent_${Date.now()}`;
    
    // Format response messages
    const allMessages = messages ? [...messages] : [];

    if (generateDocument) {
      // For initial document generation, include the actual document content in the chat
      allMessages.push({
        id: `txagent_${Date.now()}`,
        role: "assistant", 
        content: messageContent, // This contains the actual generated document
        timestamp: Date.now(),
        model: 'txagent'
      });
    } else {
      // For follow-up edits, the chat message contains the new content
      allMessages.push({
        id: `txagent_${Date.now()}`,
        role: "assistant",
        content: messageContent,
        timestamp: Date.now(),
        model: 'txagent'
      });
    }
    
    // Save conversation if sessionId provided
    if (sessionId) {
      logToSupabase(sessionId, assistantType, txagentThreadId, allMessages, 'txagent', messageContent, (generateDocument || isDocumentEdit));
    }
    
    return new Response(
      JSON.stringify({
        message: messageContent,
        threadId: txagentThreadId,
        messages: allMessages,
        modelType: 'txagent'
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
    
  } catch (error) {
    console.error("TxAgent error:", error);
    
    // CRITICAL CHANGE: Never fall back to OpenAI for document generation
    if (generateDocument) {
      console.error("Document generation failed with TxAgent. This is a critical error that should be resolved.");
      return new Response(
        JSON.stringify({ 
          error: `Document generation failed: ${error.message}. Please try again in a moment as the system may be initializing.`,
          isTxAgentError: true,
          shouldRetry: true
        }),
        { 
          status: 503, // Service Temporarily Unavailable
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    // Only fall back to OpenAI for chat/questions, not document generation
    console.log("Falling back to OpenAI for chat/questions due to TxAgent error");
    return await handleOpenAIRequest({
      assistantType,
      messages,
      drugData,
      allShortageData,
      documentContent,
      sessionId,
      threadId,
      generateDocument: false, // Force to false to prevent OpenAI document generation
      isDocumentEdit,
      drugName: normalizeDrugName(drugName || drugData?.drug_name || drugData?.brand_name)
    });
  }
}

// OpenAI handler function (original logic)
async function handleOpenAIRequest({
  assistantType,
  messages,
  drugData,
  allShortageData,
  documentContent,
  sessionId,
  threadId,
  generateDocument,
  isDocumentEdit,
  drugName
}: any) {
  try {
    // Select the appropriate assistant ID
    const assistantId = assistantType === "shortage" ? SHORTAGE_ASSISTANT_ID : DOCUMENT_ASSISTANT_ID;
    
    let thread;

    // FIX: Validate threadId before using it. OpenAI requires IDs to start with "thread_".
    if (threadId && threadId.startsWith("thread_")) {
      console.log(`Using existing OpenAI thread: ${threadId}`);
      thread = { id: threadId };
    } else {
      // If threadId exists but is invalid (from TxAgent), log a warning.
      if (threadId) {
        console.warn(`Invalid thread_id '${threadId}' for OpenAI. A new thread will be created. Conversation history from TxAgent will not be preserved in this new thread.`);
      }
      
      // Create a new thread for OpenAI since one wasn't provided or was invalid.
      const threadResponse = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        }
      });

      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${await threadResponse.text()}`);
      }
      
      thread = await threadResponse.json();
      console.log("Created new OpenAI thread:", thread.id);
      
      // For new threads, add an initial system message based on the assistant type
      let initialPrompt = "";
      if (assistantType === "shortage") {
        initialPrompt = `You are analyzing drug shortage data for ${drugData?.brand_name || drugData?.drug_name || "the requested drug"}. `;
        if (drugData) {
          initialPrompt += `This is the specific report data in full raw JSON format: ${JSON.stringify(drugData, null, 2)}. `;
        }
        if (allShortageData && allShortageData.length > 0) {
          initialPrompt += `Here is comprehensive data about all related shortages in full raw JSON format: ${JSON.stringify(allShortageData, null, 2)}. `;
        }
        initialPrompt += `Please provide a detailed analysis of the shortage situation, including therapeutic alternatives, conservation strategies, patient prioritization, and other relevant information.`;
      } else {
        initialPrompt = `You are helping create a concise document about a drug shortage. `;
        if (drugData) {
          initialPrompt += `This is the specific drug data in full raw JSON format: ${JSON.stringify(drugData, null, 2)}. `;
        }
        if (allShortageData && allShortageData.length > 0) {
          initialPrompt += `Here is comprehensive data about all related shortages in full raw JSON format: ${JSON.stringify(allShortageData, null, 2)}. `;
        }
        if (documentContent) {
          initialPrompt += `Here is the current document content that you should use as a base: "${documentContent}". `;
        } else if (generateDocument) {
          initialPrompt += `Please generate a complete initial markdown-formatted shortage management plan document based on the data provided. Include all relevant sections such as overview, therapeutic alternatives, conservation strategies, patient prioritization, implementation plan, communication strategy, and resources. `;
        } else {
          initialPrompt += `Please generate an initial draft for a hospital staff communication document. `;
        }
        initialPrompt += `Focus on: expected shortage resolution date, therapeutic alternatives, conservation strategies, and other key information hospital staff need to know.`;
      }
      // Add the initial prompt as a user message
      await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: JSON.stringify({
          role: "user",
          content: initialPrompt
        })
      });
    }
    
    // Add any additional user messages to the thread
    if (messages && messages.length > 0) {
      for (const msg of messages){
        if (msg.role === "user") {
          await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openAIApiKey}`,
              "Content-Type": "application/json",
              "OpenAI-Beta": "assistants=v2"
            },
            body: JSON.stringify({
              role: "user",
              content: msg.content
            })
          });
        }
      }
    }
    // Run the assistant with appropriate instructions
    let instructions = "";
    if (assistantType === "shortage") {
      instructions = `You are analyzing drug shortage data. `;
      if (drugData) {
        instructions += `Provide detailed insights about ${drugData.brand_name || drugData.drug_name || "this drug"} shortage, therapeutic alternatives, conservation strategies, and other relevant information.`;
      }
    } else {
      instructions = `You are helping create a concise document about a drug shortage. `;
      if (documentContent) {
        instructions += `The current document is: "${documentContent}". `;
      }
      if (generateDocument && !documentContent) {
        instructions += `Generate a complete initial shortage management plan document in markdown format with clear sections. `;
      } else if (isDocumentEdit) {
        instructions += `The user is asking to modify the document. Please make the requested changes and return the *entire* updated document as a single markdown block. Do not just describe the changes.`;
      } else {
        instructions += `The user is asking a question about the document. Provide a concise answer and do not return the whole document.`;
      }
    }
    // Run the assistant - Updated for v2 API
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        assistant_id: assistantId,
        instructions
      })
    });
    if (!runResponse.ok) {
      throw new Error(`Failed to run assistant: ${await runResponse.text()}`);
    }
    const run = await runResponse.json();
    console.log("Started run:", run.id);
    // Poll for completion - Updated for v2 API
    let runStatus = run.status;
    let attempts = 0;
    const maxAttempts = 30; // Maximum number of polling attempts
    while(runStatus !== "completed" && attempts < maxAttempts){
      await new Promise((resolve)=>setTimeout(resolve, 1000)); // Wait 1 second between polls
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });
      if (!statusResponse.ok) {
        throw new Error(`Failed to check run status: ${await statusResponse.text()}`);
      }
      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      attempts++;
      if (runStatus === "failed") {
        throw new Error("Assistant run failed");
      }
    }
    if (runStatus !== "completed") {
      throw new Error("Assistant run timed out");
    }
    // Get all messages from the thread - Updated for v2 API
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });
    if (!messagesResponse.ok) {
      throw new Error(`Failed to get messages: ${await messagesResponse.text()}`);
    }
    const messagesData = await messagesResponse.json();
    // Check if we have messages
    if (!messagesData.data || messagesData.data.length === 0) {
      throw new Error("No messages returned from OpenAI");
    }
    const lastMessage = messagesData.data[0];
    // Check if last message has content
    if (!lastMessage.content || lastMessage.content.length === 0 || !lastMessage.content[0].text) {
      throw new Error("No content in last message");
    }
    const allMessages = messagesData.data.map((msg)=>({
        id: msg.id,
        role: msg.role,
        content: msg.content[0].text.value,
        timestamp: msg.created_at
      }));
    // If we have a session ID, log this interaction in the database
    if (sessionId) {
      try {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          // Store the interaction in ai_interactions table
          await supabase.rpc('save_ai_conversation', {
            p_session_id: sessionId,
            p_assistant_type: assistantType,
            p_thread_id: thread.id,
            p_messages: allMessages,
            p_model_type: 'openai'
          });
          // If this is the document assistant and we have generated a document or the user is editing it, update the document content
          if (assistantType === "document" && (generateDocument || messages && messages.length > 0)) {
            await supabase.rpc('save_session_document', {
              p_session_id: sessionId,
              p_content: lastMessage.content[0].text.value
            });
          }
          console.log(`Logged AI interaction for session ${sessionId}`);
        }
      } catch (dbError) {
        // Just log the error but don't fail the request
        console.error("Error logging AI interaction:", dbError);
      }
    }
    // Return the response
    return new Response(JSON.stringify({
      message: lastMessage.content[0].text.value,
      threadId: thread.id,
      messages: allMessages,
      modelType: 'openai' // FIX: Ensure modelType is returned
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Error in OpenAI handler:", error);
    return new Response(JSON.stringify({
      error: error.message || "Internal server error"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
}

async function logToSupabase(sessionId, assistantType, threadId, messages, modelType, content, shouldSaveDocument) {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.rpc('save_ai_conversation', {
        p_session_id: sessionId,
        p_assistant_type: assistantType,
        p_thread_id: threadId,
        p_messages: messages,
        p_model_type: modelType
      });

      if (assistantType === "document" && shouldSaveDocument) {
        await supabase.rpc('save_session_document', {
          p_session_id: sessionId,
          p_content: content
        });
      }
      console.log(`Logged AI interaction for session ${sessionId}`);
    }
  } catch (dbError) {
    console.error("Error logging AI interaction:", dbError);
  }
}
