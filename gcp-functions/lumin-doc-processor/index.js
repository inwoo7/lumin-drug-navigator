// Direct exports for Cloud Functions
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch').default;

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'lumin-drug-navigator-prod';

// Cache for secrets to avoid repeated API calls
const secretCache = {};

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// RunPod configuration
const RUNPOD_ENDPOINT_ID = "os7ld1gn1e2us3";

/**
 * Get secret from Google Cloud Secret Manager with caching
 */
async function getSecret(secretName) {
  if (secretCache[secretName]) {
    return secretCache[secretName];
  }

  try {
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    const secretValue = version.payload.data.toString('utf8').trim();
    
    // Debug: Log secret length and first/last few characters (for debugging only)
    console.log(`Secret ${secretName} retrieved: length=${secretValue.length}, starts with "${secretValue.substring(0, 8)}..."`);
    
    // Cache the secret for this function execution
    secretCache[secretName] = secretValue;
    return secretValue;
  } catch (error) {
    console.error(`Failed to get secret ${secretName}:`, error);
    throw new Error(`Failed to access secret: ${secretName}`);
  }
}

/**
 * Process document generation job
 */
async function processDocumentJob(jobIdOverride = null) {
  console.log("🔍 Looking for pending document generation jobs...");

  // Get secrets
  const [runpodApiKey, supabaseUrl, supabaseServiceKey] = await Promise.all([
    getSecret('runpod-api-key'),
    getSecret('supabase-url'), // We'll need to add this secret
    getSecret('supabase-service-role-key')
  ]);

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let job = null;
  let fetchErr = null;

  if (jobIdOverride) {
    // Fetch the specific job regardless of status
    ({ data: job, error: fetchErr } = await supabase
      .from("document_generation_jobs")
      .select("*")
      .eq("id", jobIdOverride)
      .maybeSingle());
  } else {
    // 1. Get next job that is either pending OR previously stuck in processing
    ({ data: job, error: fetchErr } = await supabase
      .from("document_generation_jobs")
      .select("*")
      .in("status", ["pending", "processing"]) // pick up stuck jobs
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle());
  }

  if (fetchErr) throw fetchErr;
  if (!job) {
    console.log("✅ No pending jobs found");
    return { 
      success: true,
      message: "No pending jobs",
      jobId: null
    };
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

  // 3. Prepare RunPod payload (matching working version)
  const systemPrompt = `You are a clinical decision support LLM that is built to help clinicians and decision makers make better decisions about the impact of a drug shortage. Your task is to generate a drug shortage document for "${job.drug_name}". This document will be used to summarize the potential impact and guide the response.

You MUST generate the document using markdown and follow all instructions precisely.

**CRITICAL INSTRUCTIONS:**
- NEVER leave any section with "N/A", "TBD", "To be determined", or blank values. If you don't have specific information, provide general clinical guidance based on the drug class and common clinical practice.
- Take into account the formulation of the shortage. This can be a difference for many drugs.
- Research and provide accurate therapeutic information based on the drug name "${job.drug_name}". Use information that is up-to-date and is based on multiple sources.
- Always fill in all sections with meaningful clinical content that can be acted upon by hospital staff. Be technical and sufficiently detailed.
- The document can be no longer than 5 pages.
- EVERY section must contain substantive clinical information. Do not create empty sections.
- If you're unsure about specific details, provide general guidance based on the drug's therapeutic class and known clinical uses.

**DOCUMENT STRUCTURE REQUIREMENTS:**
1. Start with the main title: "Drug Shortage Clinical Response Template"
2. Add the following lines, populating the drug name and date:
   - **Drug Name:** ${job.drug_name}
   - **Date:** ${new Date().toLocaleDateString()}
   - **Prepared by:** [Your Name]
   - **For Use By:** Clinicians, Pharmacists, Formulary Committees, Health System Planners

3. Create a level 3 markdown heading titled "1. Current Product Shortage Status". Under it, create a bulleted list for:
   - **Molecule:** Research and provide the generic/chemical name
   - **Formulations in Shortage (Canada):** Research common formulations for this drug
   - **Available Market Alternatives:** Research and list available alternatives

4. Create a level 3 markdown heading titled "2. Major Indications". Under it, create bulleted lists for:
   - **On-label:** Research and provide FDA/Health Canada approved indications. Use the full language from the indication.
   - **Common Off-label:** Research and provide all known off-label uses that the pharmacist should know about.

5. Create a level 3 markdown heading titled "3. Therapeutic Alternatives by Indication". Under it, create bulleted lists sorted by "Indication", with "Alternatives" and "Notes" for each indication. Alternatives should be equivalent where feasible. If no equivalent drug is available offer the next-line therapy and note limitations. Account for formulation.

   Lastly, highlight indications that are more in need of this drug if they had to be prioritized. Take into account population size and other therapeutic options. Avoid suggesting drugs that are also in shortage.

6. Create a level 3 markdown heading titled "4. Subpopulations of Concern". Under it, create bulleted lists sorted by "Population" and their "Considerations" (e.g., Pediatrics, Renal impairment, Pregnant/lactating, Elderly). Recommendations must be actionable and specific.

7. Create a level 3 markdown heading titled "5. Other Considerations" (include only if applicable). Under it, create bulleted lists for:
   - **Infection control implications:** Provide relevant considerations (be specific)
   - **Communication needs:** Outline communication requirements (e.g., switching formulations, prioritization, dose reductions).
   - **Reconstitution practices:** Provide relevant guidance (be specific).
   - **Saving of doses:** Suggest dose-sparing strategies (be specific).

Generate the complete document now:`;

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
    max_tokens: 2200,
    temperature: 0.1
  };

  // 4. Submit to RunPod with AbortController for timeout handling
  console.log(`🚀 Submitting to RunPod endpoint ${RUNPOD_ENDPOINT_ID}...`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log("⏰ RunPod request timed out after 8 minutes");
    controller.abort();
  }, 8 * 60 * 1000); // 8 minutes (leave 1 minute buffer for 1st gen function cleanup)

  try {
    const authHeader = `Bearer ${runpodApiKey}`;
    console.log(`Authorization header length: ${authHeader.length}, starts with: "${authHeader.substring(0, 15)}..."`);
    
    const runpodResponse = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/openai/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify(runpodPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log(`📡 RunPod response received: status ${runpodResponse.status}`);

    if (!runpodResponse.ok) {
      const errorText = await runpodResponse.text();
      console.log(`❌ RunPod error response: ${errorText}`);
      throw new Error(`RunPod submission failed (${runpodResponse.status}): ${errorText}`);
    }

    const runpodResult = await runpodResponse.json();
    
    // Validate response format
    if (!runpodResult.choices || !runpodResult.choices[0] || !runpodResult.choices[0].message) {
      throw new Error("Invalid response format from RunPod");
    }

    const documentContent = runpodResult.choices[0].message.content;
    
    if (!documentContent || documentContent.trim().length === 0) {
      throw new Error("RunPod returned empty document content");
    }

    console.log(`📄 Document generated successfully (${documentContent.length} characters)`);

    // 5. Save document to database
    const { error: saveError } = await supabase.rpc('save_session_document', {
      p_session_id: job.session_id,
      p_content: documentContent,
    });

    if (saveError) {
      console.error(`❌ Failed to save document for job ${job.id}:`, saveError);
      throw new Error(`Failed to save document: ${saveError.message}`);
    }

    // 6. Update job as completed
    await supabase
      .from("document_generation_jobs")
      .update({
        status: "completed",
        result: documentContent,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`✅ Job ${job.id} completed successfully`);

    return { 
      success: true,
      message: `Job ${job.id} completed successfully`,
      jobId: job.id,
      documentLength: documentContent.length,
      documentContent: documentContent, // Add this for compatibility
      executionTime: "cloud_function"
    };

  } catch (fetchError) {
    clearTimeout(timeoutId);
    
    const errorType = fetchError.name === 'AbortError' ? 'TIMEOUT' : 'ERROR';
    const errorMessage = fetchError.name === 'AbortError' 
      ? 'Document generation timed out after 8 minutes' 
      : fetchError.message;
    
    console.log(`❌ RunPod ${errorType}: ${errorMessage}`);
    
    // Reset job to pending for retry with detailed error info
    try {
      await supabase
        .from("document_generation_jobs")
        .update({
          status: "pending", // Reset to pending for retry
          error_message: `RunPod ${errorType}: ${errorMessage} (${new Date().toISOString()})`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
        
      console.log(`Reset job ${job.id} to pending for retry due to ${errorType}`);
    } catch (resetError) {
      console.error(`Failed to reset job ${job.id}:`, resetError);
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Main Cloud Function entry point
 */
exports['lumin-doc-processor'] = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.set(corsHeaders);
    res.status(204).send('');
    return;
  }

  // Set CORS headers
  res.set(corsHeaders);

  try {
    const jobId = req.body && req.body.jobId ? req.body.jobId : null;
    const result = await processDocumentJob(jobId);
    res.status(200).json(result);
  } catch (error) {
    console.error("❌ Cloud Function error:", error);
    
    // Try to reset failed job to pending for retry
    try {
      const [supabaseUrl, supabaseServiceKey] = await Promise.all([
        getSecret('supabase-url'),
        getSecret('supabase-service-role-key')
      ]);
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Find the failed job and reset it
      const { data: failedJob } = await supabase
        .from("document_generation_jobs")
        .select("id")
        .eq("status", "processing")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (failedJob) {
        await supabase
          .from("document_generation_jobs")
          .update({
            status: "pending",
            error_message: `GCP processing failed: ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", failedJob.id);
        console.log(`Reset job ${failedJob.id} to pending for retry`);
      }
    } catch (resetError) {
      console.error("Failed to reset job status:", resetError);
    }

    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}; 