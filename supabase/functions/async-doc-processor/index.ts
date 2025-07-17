import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// RunPod configuration  
const RUNPOD_API_KEY = Deno.env.get("RUNPOD_API_KEY");
const RUNPOD_ENDPOINT_ID = "os7ld1gn1e2us3";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders });
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    console.log("🔍 Looking for pending document generation jobs...");

    // 1. Get next pending job
    const { data: job, error: fetchErr } = await supabase
      .from("document_generation_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!job) {
      console.log("✅ No pending jobs found");
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📋 Processing job ${job.id} for drug: ${job.drug_name}`);

    // 2. Mark as processing immediately
    // await supabase
    //   .from("document_generation_jobs")
    //   .update({ 
    //     status: "processing", 
    //     updated_at: new Date().toISOString() 
    //   })
    //   .eq("id", job.id);

    // 3. Prepare RunPod payload - FIX: Use correct format matching working version
    const systemPrompt = `You are TxAgent, a specialized AI assistant for pharmaceutical professionals. You help clinicians and decision makers understand the impact of drug shortages and develop response strategies.

Generate a comprehensive drug shortage document that includes:
1. Executive Summary
2. Clinical Impact Assessment  
3. Alternative Therapeutic Options
4. Supply Chain Considerations
5. Implementation Recommendations
6. Monitoring and Follow-up

Use professional medical language and evidence-based recommendations.`;

    const runpodPayload = {
      model: "mims-harvard/TxAgent-T1-Llama-3.1-8B",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user", 
          content: `Generate a comprehensive drug shortage document for: ${job.drug_name}\n\nProvide detailed analysis including clinical impact, therapeutic alternatives, and recommendations. Format the response in markdown.`
        }
      ],
      max_tokens: 1200,
      temperature: 0.1
    };

    // 4. Submit to GCP Authentication Gateway with timeout fallback
    console.log(`🚀 Submitting to GCP Auth Gateway (with 55s fallback timeout)...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("⏰ GCP gateway call timed out after 55 seconds");
      controller.abort();
    }, 55 * 1000); // 55 seconds - 5 second buffer before Supabase kills us

    // Get Supabase service role token for authentication
    const supabaseServiceToken = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    try {
      const gcpResponse = await fetch(`https://us-central1-lumin-drug-navigator-prod.cloudfunctions.net/lumin-auth-gateway`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceToken}`
        },
        body: JSON.stringify({
          prompt: `Generate a comprehensive drug shortage document for: ${job.drug_name}\n\nProvide detailed analysis including clinical impact, therapeutic alternatives, and recommendations. Format the response in markdown.`,
          max_tokens: 1200,
          temperature: 0.1
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!gcpResponse.ok) {
        const errorText = await gcpResponse.text();
        throw new Error(`GCP submission failed (${gcpResponse.status}): ${errorText}`);
      }

      const gcpResult = await gcpResponse.json();

      // If the gateway returned just the job ID and status, poll RunPod until the job is completed
      if (gcpResult.data && gcpResult.data.id && gcpResult.data.status && gcpResult.data.status !== "COMPLETED") {
        console.log(`🕑 RunPod job ${gcpResult.data.id} queued, polling for completion...`);
        const jobId = gcpResult.data.id as string;
        let pollAttempts = 0;
        let pollJson: any = null;
        while (pollAttempts < 90) { // ~60 seconds (30 * 2s)
          const pollRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`, {
            headers: { "Authorization": `Bearer ${RUNPOD_API_KEY}` }
          });
          pollJson = await pollRes.json();
          if (pollJson.status === "COMPLETED") {
            console.log(`✅ RunPod job ${jobId} completed after ${pollAttempts} polls`);
            gcpResult.data = pollJson; // reshape so downstream extraction works
            break;
          }
          if (pollJson.status === "FAILED") {
            throw new Error(`RunPod job failed: ${pollJson.error || "unknown"}`);
          }
          await new Promise((r) => setTimeout(r, 2000)); // wait 2s
          pollAttempts++;
        }
        if (pollJson?.status !== "COMPLETED") {
          throw new Error("RunPod job did not complete in time");
        }
      }

      // Normalize RunPod output to plain string
      if (gcpResult.data && gcpResult.data.output) {
        let op: any = gcpResult.data.output;

        if (Array.isArray(op)) {
          // Chat array format → use first message content if present
          if (op[0]?.content) {
            op = op[0].content;
          } else {
            op = op.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
          }
        } else if (typeof op === "object" && op !== null) {
          // Object output may embed choices/tokens similar to OpenAI format
          if (op.message?.content) {
            op = op.message.content;
          } else if (op.choices && op.choices[0]?.message?.content) {
            op = op.choices[0].message.content;
          } else if (op.choices && op.choices[0]?.tokens) {
            // Join token array into string
            const toks = op.choices[0].tokens as any[];
            op = toks.map((t) => (typeof t === "string" ? t : t.text || t.content || "")).join("");
          } else if (op.tokens) {
            const toks = op.tokens as any[];
            op = toks.map((t) => (typeof t === "string" ? t : t.text || t.content || "")).join("");
          } else {
            // Fallback stringify
            op = JSON.stringify(op);
          }
        }

        gcpResult.data.output = op;
      }

      // Extract document content from the gateway or polled response
      if (!gcpResult.success || !gcpResult.data) {
        throw new Error(`GCP gateway failed: ${gcpResult.error || 'Invalid response format'}`);
      }

      let documentContent;
      if (gcpResult.data.choices && gcpResult.data.choices[0] && gcpResult.data.choices[0].message) {
        documentContent = gcpResult.data.choices[0].message.content;
      } else if (gcpResult.data.output) {
        documentContent = gcpResult.data.output;
      } else if (gcpResult.data.choices && gcpResult.data.choices[0]?.tokens) {
        // Some engines return an array of tokens (either strings or token objects)
        try {
          const rawTokens = gcpResult.data.choices[0].tokens as any[];
          documentContent = rawTokens
            .map((t) => {
              if (typeof t === "string") return t;
              if (typeof t === "object" && t !== null) {
                return (
                  t.text || // common key
                  t.content || // alternative key
                  ""
                );
              }
              return "";
            })
            .join("");
        } catch (err) {
          console.error("Token array extraction failed", err);
          documentContent = JSON.stringify(gcpResult.data);
        }
      } else {
        throw new Error('No valid content found in gateway response');
      }

      if (!documentContent || documentContent.trim().length === 0) {
        throw new Error('Gateway returned empty document content');
      }

      console.log(`📄 Document generated successfully via gateway (${documentContent.length} characters)`);

      // 5. Save document to database
      const { error: saveDocError } = await supabase.rpc('save_session_document', {
        p_session_id: job.session_id,
        p_content: documentContent,
      });

      if (saveDocError) {
        throw new Error(`Failed to save document: ${saveDocError.message}`);
      }

      // 6. Mark job as completed
      const { error: updateError } = await supabase
        .from("document_generation_jobs")
        .update({
          status: "completed",
          result: documentContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (updateError) {
        throw new Error(`Failed to update job status: ${updateError.message}`);
      }

      console.log(`✅ Job ${job.id} completed successfully via GCP gateway`);
      return new Response(JSON.stringify({ 
        success: true,
        message: "Job delegated to GCP (Supabase timeout but GCP will complete)",
        jobId: job.id,
        executionTime: "gcp_async"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.log("🔄 GCP function timed out, job will remain in 'processing' state for GCP to complete");
        // Don't throw error - GCP function will complete the job even if we timeout
        return new Response(JSON.stringify({ 
          success: true,
          message: `Job delegated to GCP (Supabase timeout but GCP will complete)`,
          jobId: job.id,
          executionTime: "gcp_async"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error("❌ Async processor error:", error);
    
    // Get the current job ID from the scope if we have one
    let currentJobId = null;
    try {
      // Try to get job details from the first part of our function
      const { data: failedJob } = await supabase
        .from("document_generation_jobs")
        .select("id")
        .eq("status", "processing")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (failedJob) {
        currentJobId = failedJob.id;
      }
    } catch (lookupErr) {
      console.error("Could not find failed job ID:", lookupErr);
    }
    
    // Reset job to pending for retry if we found it
    if (currentJobId) {
      try {
        await supabase
          .from("document_generation_jobs")
          .update({
            status: "pending", // Reset to pending for retry
            error_message: `Processing failed: ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentJobId);
        console.log(`Reset job ${currentJobId} to pending for retry`);
      } catch (updateErr) {
        console.error("Failed to update job status:", updateErr);
      }
    }

    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}); 