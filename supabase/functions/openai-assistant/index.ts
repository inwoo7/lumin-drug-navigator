
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

// CORS headers to allow requests from the frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get OpenAI API key from the environment
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

// Assistant IDs for different purposes
const SHORTAGE_ASSISTANT_ID = "asst_p9adU6tFNefnEmlqMDmuAbeg";
const DOCUMENT_ASSISTANT_ID = "asst_YD3cbgbhibchd3NltzVtP2VO";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Ensure we have the API key
    if (!openAIApiKey) {
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

    // Parse the request
    const { 
      assistantType, // "shortage" or "document"
      messages, 
      drugData, // The drug shortage report data from Drug Shortages Canada API
      allShortageData, // All shortage data for comprehensive analysis
      documentContent, // Current document content for the document assistant
      sessionId,
      threadId, // For continuing existing conversations
      generateDocument = false // Flag to generate document content automatically
    } = await req.json();

    console.log(`Received request for ${assistantType} assistant`);
    console.log(`Thread ID: ${threadId || 'new thread'}`);
    
    // Select the appropriate assistant ID
    const assistantId = assistantType === "shortage" 
      ? SHORTAGE_ASSISTANT_ID 
      : DOCUMENT_ASSISTANT_ID;
    
    let thread;
    
    // Use existing thread if provided, otherwise create a new one
    if (threadId) {
      console.log(`Using existing thread: ${threadId}`);
      thread = { id: threadId };
    } else {
      // Create a new thread - Updated for v2 API
      const threadResponse = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2" // Updated header for v2 API
        }
      });
      
      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${await threadResponse.text()}`);
      }
      
      thread = await threadResponse.json();
      console.log("Created new thread:", thread.id);
      
      // For new threads, add an initial system message based on the assistant type
      let initialPrompt = "";
      
      if (assistantType === "shortage") {
        // Provide complete drug shortage data to the LLM
        initialPrompt = `You are analyzing drug shortage data for ${drugData?.drug_name || "the requested drug"}. `;
        
        if (drugData) {
          initialPrompt += `This is the specific report data: ${JSON.stringify(drugData, null, 2)}. `;
        }
        
        if (allShortageData && allShortageData.length > 0) {
          initialPrompt += `Here is comprehensive data about all related shortages: ${JSON.stringify(allShortageData, null, 2)}. `;
        }
        
        initialPrompt += `Please provide a detailed analysis of the shortage situation, including therapeutic alternatives, conservation strategies, patient prioritization, and other relevant information.`;
      } else {
        initialPrompt = `You are helping create a concise document about a drug shortage. `;
        
        if (drugData) {
          initialPrompt += `This is the specific drug data: ${JSON.stringify(drugData, null, 2)}. `;
        }
        
        if (allShortageData && allShortageData.length > 0) {
          initialPrompt += `Here is comprehensive data about all related shortages: ${JSON.stringify(allShortageData, null, 2)}. `;
        }
        
        if (documentContent) {
          initialPrompt += `Here is the current document content that you should use as a base: "${documentContent}". `;
        } else if (generateDocument) {
          initialPrompt += `Please generate a complete initial shortage management plan document. `;
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
      for (const msg of messages) {
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
        instructions += `Provide detailed insights about ${drugData.drug_name || "this drug"} shortage, therapeutic alternatives, conservation strategies, and other relevant information.`;
      }
    } else {
      instructions = `You are helping create a concise document about a drug shortage. `;
      if (documentContent) {
        instructions += `The current document is: "${documentContent}". `;
      }
      
      if (generateDocument && !documentContent) {
        instructions += `Generate a complete initial shortage management plan document in markdown format with clear sections. `;
      }
      
      instructions += `Focus on key information that hospital staff need to know, such as shortage duration, alternatives, and conservation strategies.`;
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
    
    while (runStatus !== "completed" && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between polls
      
      const statusResponse = await fetch(
        `https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`,
        {
          headers: {
            "Authorization": `Bearer ${openAIApiKey}`,
            "OpenAI-Beta": "assistants=v2"
          }
        }
      );
      
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
    const messagesResponse = await fetch(
      `https://api.openai.com/v1/threads/${thread.id}/messages`,
      {
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "OpenAI-Beta": "assistants=v2"
        }
      }
    );
    
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
    
    const allMessages = messagesData.data.map(msg => ({
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
          await supabase
            .rpc('save_ai_conversation', {
              p_session_id: sessionId,
              p_assistant_type: assistantType,
              p_thread_id: thread.id,
              p_messages: allMessages
            });
          
          // If this is the document assistant, update the document content
          if (assistantType === "document" && (generateDocument || messages.length > 0)) {
            await supabase
              .rpc('save_session_document', {
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
    return new Response(
      JSON.stringify({
        message: lastMessage.content[0].text.value,
        threadId: thread.id,
        messages: allMessages
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
    
  } catch (error) {
    console.error("Error in openai-assistant function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
