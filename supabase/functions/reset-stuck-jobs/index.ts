import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    const body = await req.json();
    const { jobId, resetAllStale } = body;

    if (jobId) {
      // Reset specific job
      console.log(`🔄 Resetting specific job: ${jobId}`);
      const { error } = await supabase
        .from("document_generation_jobs")
        .update({ 
          status: "pending", 
          updated_at: new Date().toISOString(),
          attempts: 0,
          error_message: null
        })
        .eq("id", jobId);

      if (error) throw error;
      
      return new Response(JSON.stringify({ 
        success: true,
        message: `Successfully reset job ${jobId}`,
        jobId 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (resetAllStale) {
      // Reset all jobs stuck in processing for more than 5 minutes
      const staleTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: staleJobs, error: fetchError } = await supabase
        .from("document_generation_jobs")
        .select("id, drug_name, updated_at")
        .eq("status", "processing")
        .lt("updated_at", staleTimestamp);

      if (fetchError) throw fetchError;

      if (!staleJobs || staleJobs.length === 0) {
        return new Response(JSON.stringify({ 
          success: true,
          message: "No stale jobs found" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      console.log(`🔄 Found ${staleJobs.length} stale jobs:`, staleJobs);

      const { error: updateError } = await supabase
        .from("document_generation_jobs")
        .update({ 
          status: "pending", 
          updated_at: new Date().toISOString(),
          attempts: 0,
          error_message: "Reset due to timeout"
        })
        .in("id", staleJobs.map(job => job.id));

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ 
        success: true,
        message: `Successfully reset ${staleJobs.length} stale jobs`,
        resetJobs: staleJobs
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      success: false,
      error: "Please provide either 'jobId' or 'resetAllStale: true'" 
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("❌ Reset error:", error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}); 