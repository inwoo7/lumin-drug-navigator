
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
    
    console.log(`Authenticating with Drug Shortages Canada API...`);
    console.log(`Authentication attempt with email: ${email?.substring(0, 3)}...`);
    
    if (!email || !password) {
      throw new Error("API credentials not configured in Supabase secrets");
    }
    
    // Check if we have a valid cached token
    if (authToken && tokenExpiry && new Date() < tokenExpiry) {
      console.log("Using cached auth token (expires:", tokenExpiry.toISOString(), ")");
      return authToken;
    }

    console.log("Getting new auth token from API...");
    
    // Log the full URL we're sending the request to
    const loginUrl = "https://www.drugshortagescanada.ca/api/v1/login";
    console.log(`Sending authentication request to: ${loginUrl}`);
    
    const formData = new URLSearchParams();
    formData.append("email", email);
    formData.append("password", password);
    
    const response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    console.log(`Auth response status: ${response.status}`);
    
    if (!response.ok) {
      // Log more details about the error
      let errorDetails;
      try {
        errorDetails = await response.text();
        console.error("Authentication failed. Response:", errorDetails);
      } catch (e) {
        errorDetails = "Could not parse error response";
        console.error("Authentication failed. Could not parse response.");
      }
      
      throw new Error(`API login failed: ${response.status} ${response.statusText}. Details: ${errorDetails}`);
    }

    // Try to get the auth token from the response headers first (standard approach)
    let token = response.headers.get("auth-token");
    let expiryDate = response.headers.get("expiry-date");
    
    // If headers don't have the token, try to get it from the response body
    if (!token) {
      try {
        const responseBody = await response.json();
        console.log("Response body:", JSON.stringify(responseBody));
        
        // Check if the token is in the response body (some APIs do this)
        if (responseBody.token) {
          token = responseBody.token;
          console.log("Found token in response body");
        } else if (responseBody.auth_token) {
          token = responseBody.auth_token;
          console.log("Found auth_token in response body");
        } else if (responseBody.data && responseBody.data.token) {
          token = responseBody.data.token;
          console.log("Found token in response body.data");
        }
        
        // Check for expiry in the response body
        if (responseBody.expiry || responseBody.expires_at || responseBody.expiryDate) {
          expiryDate = responseBody.expiry || responseBody.expires_at || responseBody.expiryDate;
          console.log("Found expiry date in response body");
        }
      } catch (e) {
        console.log("Response is not JSON, checking for token in headers only");
      }
    }

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
  
  const hasEmail = !!email;
  const hasPassword = !!password;
  const hasCredentials = hasEmail && hasPassword;
  
  console.log(`Credentials check: hasEmail=${hasEmail}, hasPassword=${hasPassword}`);
  
  return {
    hasCredentials,
    hasEmail,
    hasPassword
  };
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
      const credentialStatus = verifyCredentials();
      console.log("Health check: credentials status =", JSON.stringify(credentialStatus));
      
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          message: "Edge Function is operational",
          ...credentialStatus
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    // Check if credentials exist before proceeding
    const { hasCredentials, hasEmail, hasPassword } = verifyCredentials();
    if (!hasCredentials) {
      console.error("API credentials not configured in Supabase secrets");
      return new Response(
        JSON.stringify({ 
          error: "API credentials not configured", 
          missingCredentials: true,
          details: {
            email: hasEmail ? "configured" : "missing",
            password: hasPassword ? "configured" : "missing"
          }
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
      
      try {
        const token = await login();
        
        const apiUrl = `https://www.drugshortagescanada.ca/api/v1/search?term=${encodeURIComponent(term)}&orderby=updated_date&order=desc`;
        console.log(`Sending search request to: ${apiUrl}`);
        
        const apiResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "auth-token": token,
          },
        });

        console.log(`API search response status: ${apiResponse.status}`);
        
        if (!apiResponse.ok) {
          let errorDetails;
          try {
            errorDetails = await apiResponse.text();
            console.error("API search error. Response:", errorDetails);
          } catch (e) {
            errorDetails = "Could not parse error response";
          }
          
          throw new Error(`API search failed: ${apiResponse.status} ${apiResponse.statusText}. Details: ${errorDetails}`);
        }

        const data = await apiResponse.json();
        console.log(`Found ${data.data?.length || 0} results for "${term}"`);
        
        return new Response(
          JSON.stringify(data),
          { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      } catch (error) {
        console.error(`Search error for term "${term}":`, error);
        throw error;
      }
    } else if (requestParams.action === "shortage" || requestParams.action === "discontinuance") {
      const reportId = requestParams.reportId || "";
      console.log(`Getting ${requestParams.action} report: ${reportId}`);
      
      try {
        const token = await login();
        
        // Determine the endpoint based on the report type
        const endpoint = requestParams.action === 'shortage' ? 'shortages' : 'discontinuances';
        const apiUrl = `https://www.drugshortagescanada.ca/api/v1/${endpoint}/${reportId}`;
        
        console.log(`Sending report request to: ${apiUrl}`);
        
        const apiResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "auth-token": token,
          },
        });

        console.log(`API report response status: ${apiResponse.status}`);
        
        if (!apiResponse.ok) {
          let errorDetails;
          try {
            errorDetails = await apiResponse.text();
            console.error("API report error. Response:", errorDetails);
          } catch (e) {
            errorDetails = "Could not parse error response";
          }
          
          throw new Error(`API report failed: ${apiResponse.status} ${apiResponse.statusText}. Details: ${errorDetails}`);
        }

        const data = await apiResponse.json();
        console.log(`Successfully retrieved ${requestParams.action} report for ID ${reportId}`);
        
        return new Response(
          JSON.stringify(data),
          { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      } catch (error) {
        console.error(`Report error for ID "${reportId}":`, error);
        throw error;
      }
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
      JSON.stringify({ 
        error: error.message || "Internal server error",
        stack: error.stack || "No stack trace available"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
