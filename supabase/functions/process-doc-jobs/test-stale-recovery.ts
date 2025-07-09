// Simple test script to check for stale processing jobs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const STALE_PROCESSING_MINUTES = 5;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

async function checkStaleJobs() {
  const staleTimestamp = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString();
  
  const { data: staleJobs, error } = await supabase
    .from("document_generation_jobs")
    .select("*")
    .eq("status", "processing")
    .lt("updated_at", staleTimestamp);

  if (error) {
    console.error("Error fetching stale jobs:", error);
    return;
  }

  console.log(`Found ${staleJobs?.length || 0} stale processing jobs older than ${STALE_PROCESSING_MINUTES} minutes`);
  
  if (staleJobs && staleJobs.length > 0) {
    staleJobs.forEach(job => {
      console.log(`Stale job: ${job.id} - ${job.drug_name} - stuck since ${job.updated_at}`);
    });
    
    // Reset them to pending so they can be retried
    const { error: updateError } = await supabase
      .from("document_generation_jobs")
      .update({ 
        status: "pending", 
        updated_at: new Date().toISOString() 
      })
      .in("id", staleJobs.map(job => job.id));
      
    if (updateError) {
      console.error("Error resetting stale jobs:", updateError);
    } else {
      console.log(`Reset ${staleJobs.length} stale jobs to pending status`);
    }
  }
}

checkStaleJobs(); 