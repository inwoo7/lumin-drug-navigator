import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

serve(async (req: Request) => {
  // Basic CORS handling
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders });
  }

  let body: any = {};
  try {
    const bodyText = await req.text();
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON in request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { sessionId, drugName, drugData = null } = body;

    if (!sessionId || !drugName) {
      return new Response(
        JSON.stringify({ error: "sessionId and drugName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Supabase client (service role) – needed to bypass RLS for insertion
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Identify user making the request (if logged in)
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      if (jwt) {
        const { data: user } = await supabase.auth.getUser(jwt);
        userId = user?.user?.id ?? null;
      }
    } catch (_err) {
      // ignore auth errors – allow anonymous jobs, but RLS might block select later
    }

    const { data, error } = await supabase
      .from("document_generation_jobs")
      .insert({
        session_id: sessionId,
        user_id: userId,
        drug_name: drugName,
        drug_data: drugData,
      })
      .select("id,status")
      .single();

    if (error) {
      console.error("Error inserting job:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Trigger GitHub Actions workflow immediately after job creation
    try {
      const githubToken = Deno.env.get("GITHUB_TOKEN");
      if (githubToken) {
        console.log(`Triggering GitHub Actions workflow for job ${data.id}`);
        
        const workflowResponse = await fetch(
          "https://api.github.com/repos/inwoo7/lumin-drug-navigator/actions/workflows/supabase-worker.yml/dispatches",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ref: "main" }),
          }
        );

        if (workflowResponse.ok) {
          console.log(`Successfully triggered workflow for job ${data.id}`);
        } else {
          console.error(`Failed to trigger workflow: ${workflowResponse.status}`);
        }
      } else {
        console.log("GITHUB_TOKEN not available, skipping workflow trigger");
      }
    } catch (triggerError) {
      console.error("Error triggering workflow:", triggerError);
      // Don't fail the job creation if workflow trigger fails
    }

    return new Response(
      JSON.stringify({ jobId: data.id, status: data.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("enqueue-doc error", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}); 