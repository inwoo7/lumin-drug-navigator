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
    await supabase
      .from("document_generation_jobs")
      .update({ 
        status: "processing", 
        updated_at: new Date().toISOString() 
      })
      .eq("id", job.id);

    // 3. Prepare RunPod payload
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
      input: {
        openai_route: "/v1/chat/completions",
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
      }
    };

    // 4. Submit to RunPod (ASYNC - don't wait for completion!)
    console.log(`🚀 Submitting to RunPod endpoint ${RUNPOD_ENDPOINT_ID}...`);
    
    const runpodResponse = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify(runpodPayload)
    });

    if (!runpodResponse.ok) {
      const errorText = await runpodResponse.text();
      throw new Error(`RunPod submission failed (${runpodResponse.status}): ${errorText}`);
    }

    const runpodResult = await runpodResponse.json();
    const runpodJobId = runpodResult.id;

    if (!runpodJobId) {
      throw new Error("RunPod did not return a job ID");
    }

    // 5. Store RunPod job ID (temporarily in error_message field until we add proper column)
    await supabase
      .from("document_generation_jobs")
      .update({ 
        error_message: runpodJobId, // Store RunPod job ID here temporarily
        updated_at: new Date().toISOString() 
      })
      .eq("id", job.id);

    console.log(`✅ Job ${job.id} submitted to RunPod with ID: ${runpodJobId}`);

    // 6. Return immediately - no waiting!
    return new Response(JSON.stringify({ 
      success: true,
      message: `Job ${job.id} submitted to RunPod successfully`,
      jobId: job.id,
      runpodJobId: runpodJobId,
      estimatedCompletionTime: "2-5 minutes"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("❌ Async processor error:", error);
    
    // If we had a job, mark it as failed so it can be retried
    if (error.jobId) {
      try {
        await supabase
          .from("document_generation_jobs")
          .update({
            status: "pending", // Reset to pending for retry
            error_message: `Submission failed: ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", error.jobId);
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