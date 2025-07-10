// Simple recovery script for stuck job
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Reset the specific stuck job
const stuckJobId = "84e47413-4470-448c-8fbf-ca46afb01977";

console.log(`Resetting stuck job ${stuckJobId}...`);

const { error } = await supabase
  .from("document_generation_jobs")
  .update({ 
    status: "pending", 
    updated_at: new Date().toISOString(),
    attempts: 0,
    error_message: null
  })
  .eq("id", stuckJobId);

if (error) {
  console.error("Error resetting job:", error);
} else {
  console.log(`Successfully reset job ${stuckJobId} to pending status`);
} 