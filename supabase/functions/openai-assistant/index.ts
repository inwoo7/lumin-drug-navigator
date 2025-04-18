
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

// CORS headers to allow requests from the frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get OpenAI API key from the environment
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

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
    
    // Construct different system prompts based on the assistant type
    let systemPrompt = '';
    
    if (assistantType === "shortage") {
      systemPrompt = `You are an AI assistant specialized in drug shortage information for hospital pharmacists.
Your role is to provide detailed information about drug shortages to help pharmacists respond effectively.

Here is the most recent data about this drug shortage:
${JSON.stringify(drugData, null, 2)}

Based on this data, provide comprehensive information including:
1. A summary of the current shortage situation
2. Therapeutic alternatives that could be considered
3. Conservation strategies for the limited supply
4. Patient prioritization recommendations
5. Potential off-label uses that might be affected
6. Other healthcare practitioners to consult

Be precise, clinical, and practical in your responses. Cite specific details from the shortage data when relevant.
If you don't know something, acknowledge that and suggest where the pharmacist might find that information.`;
    } else if (assistantType === "document") {
      systemPrompt = `You are an AI assistant specialized in creating documentation for drug shortage communications.
Your role is to draft concise, professional documentation that hospital pharmacists can send to staff.

Here is the most recent data about this drug shortage:
${JSON.stringify(drugData, null, 2)}

Create professional documentation that includes:
1. A clear header with the drug name and date
2. Brief description of the shortage situation
3. Expected resolution date
4. Recommended therapeutic alternatives
5. Practical conservation strategies
6. Clear next steps and contacts

Format the documentation in a professional manner suitable for distribution to healthcare staff.
If asked to revise any part of the document, make targeted changes while maintaining the professional tone and format.`;
    } else {
      console.error(`Invalid assistant type: ${assistantType}`);
      return new Response(
        JSON.stringify({ error: "Invalid assistant type" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    // Prepare the messages array for OpenAI
    const messageArray = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ];
    
    console.log(`Sending ${messageArray.length} messages to OpenAI`);
    
    // Call the OpenAI API
    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAIApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using the specified model, can be upgraded to gpt-4o if needed
        messages: messageArray,
        temperature: 0.7,
        max_tokens: 1500, // Adjust based on the expected response length
      })
    });
    
    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.text();
      console.error("OpenAI API error:", errorData);
      throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
    }
    
    const result = await openAIResponse.json();
    console.log("Successfully received response from OpenAI");
    
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
              prompt: messageArray[messageArray.length - 1].content,
              response: result.choices[0].message.content,
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
        message: result.choices[0].message.content,
        usage: result.usage
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
