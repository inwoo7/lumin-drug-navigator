
import { toast } from "sonner";

// Types for Drug Shortage API responses
export interface DrugShortageSearchResult {
  id: string;
  report_id: string;
  brand_name: string;
  company_name: string;
  active_ingredients: string;
  strength: string;
  dosage_form: string;
  status: string;
  updated_date: string;
  type: 'shortage' | 'discontinuation';
}

export interface DrugShortageReport {
  id: string;
  report_id: string;
  brand_name: string;
  active_ingredients: string;
  company_name: string;
  strength: string;
  dosage_form: string;
  discontinuation_date?: string;
  anticipated_start_date?: string;
  actual_start_date?: string;
  estimated_end_date?: string;
  actual_end_date?: string;
  status: string;
  reason_for_shortage: string;
  comments: string;
  tier_3: boolean;
  updated_date: string;
  type: 'shortage' | 'discontinuation';
}

interface ApiResponse<T> {
  total: number;
  limit: number;
  offset: number;
  page: number;
  remaining: number;
  data: T[];
  total_pages: number;
}

interface ErrorResponse {
  error: {
    en: string;
    fr: string;
  };
}

// Cache the auth token
let authToken: string | null = null;
let tokenExpiry: Date | null = null;

const BASE_URL = "https://www.drugshortagescanada.ca/api/v1";

// Login to get an auth token
const login = async (email: string, password: string): Promise<string> => {
  try {
    // Check if we have a valid cached token
    if (authToken && tokenExpiry && new Date() < tokenExpiry) {
      return authToken;
    }

    const response = await fetch(`${BASE_URL}/login`, {
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
    toast.error("Failed to authenticate with Drug Shortage API");
    throw error;
  }
};

// Search for drug shortage reports
export const searchDrugShortages = async (
  drugName: string,
  apiCredentials: { email: string; password: string }
): Promise<DrugShortageSearchResult[]> => {
  try {
    // Get auth token
    const token = await login(apiCredentials.email, apiCredentials.password);

    // Search for drug shortage reports
    const response = await fetch(
      `${BASE_URL}/search?term=${encodeURIComponent(drugName)}&orderby=updated_date&order=desc`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "auth-token": token,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API search failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if it's an error response
    if ((data as ErrorResponse).error) {
      throw new Error((data as ErrorResponse).error.en);
    }

    return (data as ApiResponse<DrugShortageSearchResult>).data;
  } catch (error) {
    console.error("Drug shortage search error:", error);
    toast.error("Failed to search for drug shortages");
    throw error;
  }
};

// Get details for a single shortage report
export const getDrugShortageReport = async (
  reportId: string,
  type: 'shortage' | 'discontinuation',
  apiCredentials: { email: string; password: string }
): Promise<DrugShortageReport> => {
  try {
    // Get auth token
    const token = await login(apiCredentials.email, apiCredentials.password);

    // Determine the endpoint based on the report type
    const endpoint = type === 'shortage' ? 'shortages' : 'discontinuances';

    // Get report details
    const response = await fetch(`${BASE_URL}/${endpoint}/${reportId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "auth-token": token,
      },
    });

    if (!response.ok) {
      throw new Error(`API get report failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if it's an error response
    if ((data as ErrorResponse).error) {
      throw new Error((data as ErrorResponse).error.en);
    }

    return data as DrugShortageReport;
  } catch (error) {
    console.error("Get drug shortage report error:", error);
    toast.error("Failed to get drug shortage report details");
    throw error;
  }
};

// Mock implementation that returns data to match the expected API response format
// This can be used when the actual API credentials are not available
export const mockSearchDrugShortages = async (
  drugName: string
): Promise<DrugShortageSearchResult[]> => {
  // Simulating API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Return mock data that matches the expected format
  return [
    {
      id: "12345",
      report_id: "HS-" + Math.floor(10000 + Math.random() * 90000),
      brand_name: drugName,
      company_name: "PharmaCorp Inc.",
      active_ingredients: "Active ingredient for " + drugName,
      strength: "10mg",
      dosage_form: "Tablet",
      status: "Active",
      updated_date: new Date().toISOString().split('T')[0],
      type: 'shortage'
    }
  ];
};

// Mock implementation for getting a single drug shortage report
export const mockGetDrugShortageReport = async (
  reportId: string,
  type: 'shortage' | 'discontinuation'
): Promise<DrugShortageReport> => {
  // Simulating API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return {
    id: reportId,
    report_id: "HS-" + Math.floor(10000 + Math.random() * 90000),
    brand_name: "Mock Drug Name",
    active_ingredients: "Active ingredient for drug",
    company_name: "PharmaCorp Inc.",
    strength: "10mg",
    dosage_form: "Tablet",
    anticipated_start_date: "2023-01-15",
    estimated_end_date: "2023-07-30",
    status: "Active",
    reason_for_shortage: "Manufacturing disruption due to supply chain issues",
    comments: "This shortage affects all dosages. Healthcare providers should consider alternatives for new patients and maintain current patients on existing therapy when possible.",
    tier_3: false,
    updated_date: new Date().toISOString().split('T')[0],
    type: type
  };
};
