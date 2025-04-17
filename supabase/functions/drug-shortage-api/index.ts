
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers to allow requests from your frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cache for auth token to minimize API calls
let authToken: string | null = null;
let tokenExpiry: Date | null = null;

// Login to get an auth token
async function login(): Promise<string> {
  try {
    // Get API credentials from Supabase secrets
    const email = Deno.env.get("VITE_DRUG_SHORTAGE_API_EMAIL");
    const password = Deno.env.get("VITE_DRUG_SHORTAGE_API_PASSWORD");
    
    if (!email || !password) {
      throw new Error("API credentials not configured in Supabase secrets");
    }
    
    // Check if we have a valid cached token
    if (authToken && tokenExpiry && new Date() < tokenExpiry) {
      console.log("Using cached auth token (expires:", tokenExpiry.toISOString(), ")");
      return authToken;
    }

    console.log("Getting new auth token from API...");
    const response = await fetch(`https://www.drugshortagescanada.ca/api/v1/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email,
        password,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`API login failed: ${response.status} ${response.statusText}`);
    }

    // Extract the auth token from header
    const token = response.headers.get("auth-token");
    const expiryDate = response.headers.get("expiry-date");

    if (!token) {
      throw new Error("No auth token returned from API");
    }

    // Cache the token
    authToken = token;
    tokenExpiry = expiryDate ? new Date(expiryDate) : new Date(Date.now() + 3600000); // Default to 1 hour

    console.log("Successfully obtained new auth token (expires:", tokenExpiry.toISOString(), ")");
    return token;
  } catch (error) {
    console.error("Drug Shortage API login error:", error);
    throw error;
  }
}

// Function to verify if credentials exist
function verifyCredentials() {
  const email = Deno.env.get("VITE_DRUG_SHORTAGE_API_EMAIL");
  const password = Deno.env.get("VITE_DRUG_SHORTAGE_API_PASSWORD");
  
  if (!email || !password) {
    return false;
  }
  return true;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Simple health check for the Edge Function
    const url = new URL(req.url);
    
    // Parse request body for all non-OPTIONS requests
    let requestParams: any = {};
    if (req.method !== "OPTIONS" && req.headers.get('content-length') !== '0') {
      try {
        requestParams = await req.json();
        console.log("Request params:", JSON.stringify(requestParams));
      } catch (e) {
        console.error("Error parsing request body:", e);
        requestParams = {};
      }
    }
    
    // If no search params and no body content, or checkOnly is true, it's a health check
    if ((url.search === '' && req.headers.get('content-length') === '0') || requestParams.checkOnly) {
      const hasCredentials = verifyCredentials();
      console.log("Health check: credentials exist =", hasCredentials);
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          message: "Edge Function is operational",
          hasCredentials: hasCredentials
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    // Check if credentials exist before proceeding
    if (!verifyCredentials()) {
      console.error("API credentials not configured in Supabase secrets");
      return new Response(
        JSON.stringify({ 
          error: "API credentials not configured", 
          missingCredentials: true 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    // Handle different API endpoints based on the action in the request body
    if (requestParams.action === "search") {
      const term = requestParams.term || "";
      console.log(`Searching for drug: "${term}"`);
      
      const token = await login();
      
      const apiResponse = await fetch(
        `https://www.drugshortagescanada.ca/api/v1/search?term=${encodeURIComponent(term)}&orderby=updated_date&order=desc`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "auth-token": token,
          },
        }
      );

      if (!apiResponse.ok) {
        console.error(`API search error: ${apiResponse.status} ${apiResponse.statusText}`);
        throw new Error(`API search failed: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const data = await apiResponse.json();
      console.log(`Found ${data.data?.length || 0} results for "${term}"`);
      
      return new Response(
        JSON.stringify(data),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    } else if (requestParams.action === "shortage" || requestParams.action === "discontinuance") {
      const reportId = requestParams.reportId || "";
      console.log(`Getting ${requestParams.action} report: ${reportId}`);
      
      const token = await login();
      
      // Determine the endpoint based on the report type
      const endpoint = requestParams.action === 'shortage' ? 'shortages' : 'discontinuances';
      
      const apiResponse = await fetch(
        `https://www.drugshortagescanada.ca/api/v1/${endpoint}/${reportId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "auth-token": token,
          },
        }
      );

      if (!apiResponse.ok) {
        console.error(`API report error: ${apiResponse.status} ${apiResponse.statusText}`);
        throw new Error(`API report failed: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const data = await apiResponse.json();
      console.log(`Successfully retrieved ${requestParams.action} report for ID ${reportId}`);
      
      return new Response(
        JSON.stringify(data),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Default response for unhandled actions
    console.error("Invalid action specified:", requestParams.action);
    return new Response(
      JSON.stringify({ error: "Invalid action specified" }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
