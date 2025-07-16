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

    // 4. Submit to GCP Cloud Function with timeout fallback
    console.log(`🚀 Submitting to GCP Cloud Function (with 55s fallback timeout)...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("⏰ GCP function call timed out after 55 seconds");
      controller.abort();
    }, 55 * 1000); // 55 seconds - 5 second buffer before Supabase kills us

    try {
      const gcpResponse = await fetch(`https://us-central1-lumin-drug-navigator-prod.cloudfunctions.net/lumin-doc-processor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ trigger: "process_job", jobId: job.id }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!gcpResponse.ok) {
        const errorText = await gcpResponse.text();
        throw new Error(`GCP submission failed (${gcpResponse.status}): ${errorText}`);
      }

      const gcpResult = await gcpResponse.json();
      
      // GCP Cloud Function handles the entire job processing and database updates
      if (!gcpResult.success) {
        throw new Error(`GCP processing failed: ${gcpResult.error}`);
      }

      // Handle different response scenarios
      if (gcpResult.jobId === null) {
        // No pending jobs to process
        console.log(`✅ GCP reported no pending jobs`);
        return new Response(JSON.stringify({ 
          success: true,
          message: gcpResult.message || "No pending jobs",
          jobId: null,
          executionTime: "gcp_cloud_function"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        // Job was processed successfully
        console.log(`✅ GCP processing completed for job ${gcpResult.jobId}`);
        return new Response(JSON.stringify({ 
          success: true,
          message: `Job processing completed via GCP`,
          jobId: gcpResult.jobId,
          documentLength: gcpResult.documentLength,
          executionTime: "gcp_cloud_function"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

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