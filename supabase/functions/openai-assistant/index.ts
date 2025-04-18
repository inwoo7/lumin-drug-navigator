
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
      threadId // For continuing existing conversations
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
        initialPrompt = `You are analyzing drug shortage data for ${drugData?.drug_name || "the requested drug"}. `;
        
        if (drugData) {
          initialPrompt += `This is the specific report data: ${JSON.stringify(drugData)}. `;
        }
        
        if (allShortageData && allShortageData.length > 0) {
          initialPrompt += `Here is comprehensive data about all related shortages: ${JSON.stringify(allShortageData)}. `;
        }
        
        initialPrompt += `Please provide a detailed analysis of the shortage situation, including therapeutic alternatives, conservation strategies, patient prioritization, and other relevant information.`;
      } else {
        initialPrompt = `You are helping create a concise document about a drug shortage. `;
        
        if (drugData) {
          initialPrompt += `This is the specific drug data: ${JSON.stringify(drugData)}. `;
        }
        
        if (documentContent) {
          initialPrompt += `Here is the current document content that you should use as a base: "${documentContent}". `;
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
    const lastMessage = messagesData.data[0];
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
            .from('ai_interactions')
            .insert({
              session_id: sessionId,
              assistant_type: assistantType,
              prompt: messages.length > 0 ? messages[messages.length - 1].content : "Initial prompt",
              response: lastMessage.content[0].text.value,
              created_at: new Date().toISOString()
            });
          
          // Update or create the conversation record
          const existingConversation = await supabase
            .from('ai_conversations')
            .select('id')
            .eq('session_id', sessionId)
            .eq('assistant_type', assistantType)
            .single();
            
          if (existingConversation.data) {
            // Update existing conversation
            await supabase
              .from('ai_conversations')
              .update({
                thread_id: thread.id,
                messages: allMessages,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingConversation.data.id);
          } else {
            // Create new conversation
            await supabase
              .from('ai_conversations')
              .insert({
                session_id: sessionId,
                assistant_type: assistantType,
                thread_id: thread.id,
                messages: allMessages,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
          }
          
          // If this is the document assistant, update the document content
          if (assistantType === "document") {
            const existingDocument = await supabase
              .from('session_documents')
              .select('id')
              .eq('session_id', sessionId)
              .single();
              
            const documentContent = lastMessage.content[0].text.value;
            
            if (existingDocument.data) {
              // Update existing document
              await supabase
                .from('session_documents')
                .update({
                  content: documentContent,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingDocument.data.id);
            } else {
              // Create new document
              await supabase
                .from('session_documents')
                .insert({
                  session_id: sessionId,
                  content: documentContent,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
            }
            
            // Update the session to indicate it has a document
            await supabase
              .from('search_sessions')
              .update({ has_document: true })
              .eq('id', sessionId);
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
