
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
      sessionId
    } = await req.json();

    console.log(`Received request for ${assistantType} assistant`);
    
    // Select the appropriate assistant ID
    const assistantId = assistantType === "shortage" 
      ? SHORTAGE_ASSISTANT_ID 
      : DOCUMENT_ASSISTANT_ID;
    
    // Create a new thread
    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v1"
      }
    });
    
    if (!threadResponse.ok) {
      throw new Error(`Failed to create thread: ${await threadResponse.text()}`);
    }
    
    const thread = await threadResponse.json();
    console.log("Created thread:", thread.id);
    
    // Add the user's messages to the thread
    for (const msg of messages) {
      if (msg.role === "user") {
        await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openAIApiKey}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v1"
          },
          body: JSON.stringify({
            role: "user",
            content: msg.content
          })
        });
      }
    }
    
    // Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v1"
      },
      body: JSON.stringify({
        assistant_id: assistantId,
        instructions: assistantType === "shortage" 
          ? `You are analyzing this drug shortage data: ${JSON.stringify(drugData)}. 
             Provide detailed insights about the shortage situation, therapeutic alternatives, 
             conservation strategies, and other relevant information.`
          : `You are helping create a concise document about this drug shortage: 
             ${JSON.stringify(drugData)}. Focus on key information that hospital staff 
             need to know.`
      })
    });
    
    if (!runResponse.ok) {
      throw new Error(`Failed to run assistant: ${await runResponse.text()}`);
    }
    
    const run = await runResponse.json();
    console.log("Started run:", run.id);
    
    // Poll for completion
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
            "OpenAI-Beta": "assistants=v1"
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
    
    // Get the latest message from the thread
    const messagesResponse = await fetch(
      `https://api.openai.com/v1/threads/${thread.id}/messages`,
      {
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "OpenAI-Beta": "assistants=v1"
        }
      }
    );
    
    if (!messagesResponse.ok) {
      throw new Error(`Failed to get messages: ${await messagesResponse.text()}`);
    }
    
    const messagesData = await messagesResponse.json();
    const lastMessage = messagesData.data[0];
    
    // If we have a session ID, log this interaction in the database
    if (sessionId) {
      try {
        const { supabaseClient } = await import('https://esm.sh/@supabase/supabase-js@2.38.4');
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = supabaseClient(supabaseUrl, supabaseServiceKey);
          
          await supabase
            .from('ai_interactions')
            .insert({
              session_id: sessionId,
              assistant_type: assistantType,
              prompt: messages[messages.length - 1].content,
              response: lastMessage.content[0].text.value,
              created_at: new Date().toISOString()
            });
          
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
        threadId: thread.id
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
