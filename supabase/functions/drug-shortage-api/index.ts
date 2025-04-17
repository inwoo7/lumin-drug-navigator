
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
async function login(email: string, password: string): Promise<string> {
  try {
    // Check if we have a valid cached token
    if (authToken && tokenExpiry && new Date() < tokenExpiry) {
      return authToken;
    }

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
      throw new Error(`API login failed: ${response.status}`);
    }

    // Extract the auth token from header
    const token = response.headers.get("auth-token");
    const expiryDate = response.headers.get("expiry-date");

    if (!token) {
      throw new Error("No auth token returned");
    }

    // Cache the token
    authToken = token;
    tokenExpiry = expiryDate ? new Date(expiryDate) : new Date(Date.now() + 3600000); // Default to 1 hour

    return token;
  } catch (error) {
    console.error("Drug Shortage API login error:", error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    
    // Get API credentials from Supabase secrets
    const email = Deno.env.get("VITE_DRUG_SHORTAGE_API_EMAIL");
    const password = Deno.env.get("VITE_DRUG_SHORTAGE_API_PASSWORD");
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "API credentials not configured" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Parse request body
    let requestParams = {};
    if (req.method === "POST") {
      requestParams = await req.json();
    }

    // Get query parameters
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    // Handle different API endpoints
    if (path === "search") {
      const token = await login(email, password);
      const term = queryParams.term || "";
      
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

      const data = await apiResponse.json();
      
      return new Response(
        JSON.stringify(data),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    } else if (path === "shortage" || path === "discontinuance") {
      const token = await login(email, password);
      const reportId = queryParams.reportId || "";
      
      // Determine the endpoint based on the report type
      const endpoint = path === 'shortage' ? 'shortages' : 'discontinuances';
      
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

      const data = await apiResponse.json();
      
      return new Response(
        JSON.stringify(data),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Default response for unhandled paths
    return new Response(
      JSON.stringify({ error: "Invalid endpoint" }),
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
