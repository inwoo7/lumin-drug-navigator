import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Maximum TxAgent retries per job
const MAX_ATTEMPTS = 3;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders });
  }

  // Service role client
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let currentJobId: string | null = null;

  try {
    // 1. Fetch one pending job (simple implementation)
    const { data: job, error: fetchErr } = await supabase
      .from("document_generation_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!job) {
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    currentJobId = job.id;

    // Mark as processing
    await supabase
      .from("document_generation_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    // 2. Call openai-assistant with TxAgent model
    const payload = {
      assistantType: "document",
      modelType: "txagent",
      generateDocument: true,
      drugName: job.drug_name,
      drugData: job.drug_data,
      sessionId: job.session_id,
    };

    console.log(`Processing job ${job.id} for drug: ${job.drug_name}`);

    const oaResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/openai-assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
      },
      body: JSON.stringify(payload),
    });

    if (!oaResp.ok) {
      const errText = await oaResp.text();
      throw new Error(`Assistant error (${oaResp.status}): ${errText}`);
    }

    const oaData = await oaResp.json();
    const documentContent = oaData.message as string;

    if (!documentContent || documentContent.trim().length === 0) {
      throw new Error("Assistant returned empty document");
    }

    // 3. Save document via RPC
    const { error: saveError } = await supabase.rpc('save_session_document', {
      p_session_id: job.session_id,
      p_content: documentContent,
    });

    if (saveError) {
      throw new Error(`Failed to save document: ${saveError.message}`);
    }

    // 4. Update job row
    await supabase
      .from("document_generation_jobs")
      .update({
        status: "completed",
        result: documentContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`Job ${job.id} completed successfully`);

    return new Response(JSON.stringify({ message: `Job ${job.id} completed` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-doc-jobs error", err);

    // Update job attempts / failure if we have a job ID
    if (currentJobId) {
      try {
        const { data: jobRow } = await supabase
          .from("document_generation_jobs")
          .select("attempts")
          .eq("id", currentJobId)
          .single();

        const attempts = (jobRow?.attempts ?? 0) + 1;
        const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";

        await supabase
          .from("document_generation_jobs")
          .update({
            status,
            attempts,
            error_message: err.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentJobId);

        console.log(`Job ${currentJobId} ${status} after ${attempts} attempts`);
      } catch (updateErr) {
        console.error("Failed to update job status:", updateErr);
      }
    }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}); 