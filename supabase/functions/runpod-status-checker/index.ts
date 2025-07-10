import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    console.log("🔍 Checking RunPod job statuses...");

    // Get all processing jobs that have RunPod job IDs (stored in error_message temporarily)
    const { data: processingJobs, error: fetchErr } = await supabase
      .from("document_generation_jobs")
      .select("*")
      .eq("status", "processing")
      .not("error_message", "is", null); // error_message contains RunPod job ID

    if (fetchErr) throw fetchErr;
    if (!processingJobs || processingJobs.length === 0) {
      console.log("✅ No processing jobs with RunPod IDs found");
      return new Response(JSON.stringify({ message: "No processing jobs to check" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📋 Found ${processingJobs.length} processing jobs to check`);
    
    const results = [];
    let completedJobs = 0;
    let failedJobs = 0;
    let stillProcessingJobs = 0;

    for (const job of processingJobs) {
      const runpodJobId = job.error_message; // We stored RunPod job ID here temporarily
      
      try {
        console.log(`🔍 Checking RunPod job ${runpodJobId} for database job ${job.id}`);
        
        // Check RunPod status
        const statusResponse = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${runpodJobId}`, {
          headers: {
            "Authorization": `Bearer ${RUNPOD_API_KEY}`
          }
        });

        if (!statusResponse.ok) {
          console.error(`❌ Failed to check RunPod status for ${runpodJobId}: ${statusResponse.status}`);
          results.push({ 
            jobId: job.id, 
            runpodJobId, 
            status: "check_failed", 
            error: `HTTP ${statusResponse.status}` 
          });
          continue;
        }

        const statusData = await statusResponse.json();
        const runpodStatus = statusData.status;

        console.log(`📊 RunPod job ${runpodJobId} status: ${runpodStatus}`);

        if (runpodStatus === "COMPLETED") {
          // Extract the generated content
          const output = statusData.output;
          let documentContent = "";

          // Try multiple ways to extract content
          if (output && output.choices && output.choices[0] && output.choices[0].message) {
            documentContent = output.choices[0].message.content;
          } else if (output && output.content) {
            documentContent = output.content;
          } else if (output && typeof output === 'string') {
            documentContent = output;
          } else {
            console.error("❌ Could not extract document content from RunPod output:", JSON.stringify(output, null, 2));
            throw new Error("Could not extract document content from RunPod output");
          }

          if (!documentContent || documentContent.trim().length === 0) {
            throw new Error("RunPod returned empty document content");
          }

          console.log(`📄 Document generated successfully (${documentContent.length} characters)`);

          // Save document to database
          const { error: saveError } = await supabase.rpc('save_session_document', {
            p_session_id: job.session_id,
            p_content: documentContent,
          });

          if (saveError) {
            console.error(`❌ Failed to save document for job ${job.id}:`, saveError);
            results.push({ 
              jobId: job.id, 
              runpodJobId, 
              status: "save_failed", 
              error: saveError.message 
            });
            continue;
          }

          // Update job as completed
          await supabase
            .from("document_generation_jobs")
            .update({
              status: "completed",
              result: documentContent,
              error_message: null, // Clear the RunPod job ID
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          console.log(`✅ Job ${job.id} completed successfully`);
          results.push({ 
            jobId: job.id, 
            runpodJobId, 
            status: "completed", 
            documentLength: documentContent.length 
          });
          completedJobs++;

        } else if (runpodStatus === "FAILED") {
          // Mark job as failed
          const errorMessage = statusData.error || "RunPod job failed";
          
          await supabase
            .from("document_generation_jobs")
            .update({
              status: "failed",
              error_message: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          console.log(`❌ Job ${job.id} failed: ${errorMessage}`);
          results.push({ 
            jobId: job.id, 
            runpodJobId, 
            status: "failed", 
            error: errorMessage 
          });
          failedJobs++;

        } else if (runpodStatus === "CANCELLED" || runpodStatus === "TIMED_OUT") {
          // Reset to pending for retry
          await supabase
            .from("document_generation_jobs")
            .update({
              status: "pending",
              error_message: `RunPod job ${runpodStatus.toLowerCase()}, resetting for retry`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          console.log(`🔄 Job ${job.id} reset to pending due to RunPod ${runpodStatus}`);
          results.push({ 
            jobId: job.id, 
            runpodJobId, 
            status: "reset_for_retry", 
            reason: runpodStatus 
          });

        } else {
          // Still in progress (IN_QUEUE, IN_PROGRESS)
          console.log(`⏳ Job ${job.id} still in progress (${runpodStatus})`);
          results.push({ 
            jobId: job.id, 
            runpodJobId, 
            status: "still_processing", 
            runpodStatus 
          });
          stillProcessingJobs++;
        }

      } catch (error) {
        console.error(`❌ Error checking job ${job.id}:`, error);
        results.push({ 
          jobId: job.id, 
          runpodJobId: job.error_message, 
          status: "error", 
          error: error.message 
        });
      }
    }

    const summary = {
      totalChecked: processingJobs.length,
      completed: completedJobs,
      failed: failedJobs,
      stillProcessing: stillProcessingJobs,
      checkErrors: results.filter(r => r.status === "error" || r.status === "check_failed").length
    };

    console.log(`📊 Status check summary:`, summary);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Checked ${processingJobs.length} RunPod jobs`,
      summary,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("❌ Status checker error:", error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}); 