import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

interface ApiCompany {
  name: string;
}

interface ApiShortageReason {
  en_reason: string;
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

interface EdgeFunctionError {
  error: string;
  missingCredentials?: boolean;
}

// Check if Edge Function is accessible
const canAccessApi = async (): Promise<{available: boolean; authenticated: boolean}> => {
  try {
    const { data, error } = await supabase.functions.invoke('drug-shortage-api', {
      method: 'POST',
      body: { checkOnly: true }
    });
    
    if (error) {
      console.error("Error checking Edge Function accessibility:", error);
      return { available: false, authenticated: false };
    }
    
    return { 
      available: true, 
      authenticated: data?.hasCredentials === true 
    };
  } catch (error) {
    console.error("Error checking Edge Function accessibility:", error);
    return { available: false, authenticated: false };
  }
};

// Custom error with missing credentials flag
class ApiError extends Error {
  missingCredentials: boolean;
  
  constructor(message: string, missingCredentials: boolean = false) {
    super(message);
    this.missingCredentials = missingCredentials;
  }
}

// Helper function to format dates consistently
const formatDate = (dateString: string | undefined): string | undefined => {
  if (!dateString) return undefined;
  return dateString.split('T')[0];
};

// Helper function to prettify status text
const prettifyText = (text: string): string => {
  return text
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Transform API search results to our application format
const transformSearchResult = (apiResult: any): DrugShortageSearchResult => ({
  id: apiResult.id,
  report_id: apiResult.id,
  brand_name: apiResult.en_drug_brand_name,
  company_name: (apiResult.company && typeof apiResult.company === 'object') ? apiResult.company.name : 'Unknown Company',
  active_ingredients: apiResult.en_ingredients,
  strength: apiResult.strength || '',
  dosage_form: apiResult.drug_dosage_form || '',
  status: prettifyText(apiResult.status || 'Unknown'),
  updated_date: formatDate(apiResult.last_updated_date) || formatDate(new Date().toISOString()),
  type: apiResult.discontinuation_date ? 'discontinuation' : 'shortage'
});

// Transform API report to our application format
const transformReport = (apiReport: any): DrugShortageReport => ({
  id: apiReport.id,
  report_id: apiReport.id,
  brand_name: apiReport.en_drug_brand_name,
  active_ingredients: apiReport.en_ingredients,
  company_name: (apiReport.company && typeof apiReport.company === 'object') ? apiReport.company.name : 'Unknown Company',
  strength: apiResult.strength || '',
  dosage_form: apiReport.drug_dosage_form || '',
  discontinuation_date: formatDate(apiReport.discontinuation_date),
  anticipated_start_date: formatDate(apiReport.anticipated_start_date),
  actual_start_date: formatDate(apiReport.actual_start_date),
  estimated_end_date: formatDate(apiReport.estimated_end_date),
  actual_end_date: formatDate(apiReport.actual_end_date),
  status: prettifyText(apiReport.status || 'Unknown'),
  reason_for_shortage: apiReport.shortage_reason?.en_reason || 'Not specified',
  comments: apiReport.en_comments || '',
  tier_3: apiReport.tier_3 || false,
  updated_date: formatDate(apiReport.last_updated_date) || formatDate(new Date().toISOString()),
  type: apiReport.discontinuation_date ? 'discontinuation' : 'shortage'
});

// Search for drug shortage reports
export const searchDrugShortages = async (
  drugName: string
): Promise<DrugShortageSearchResult[]> => {
  try {
    // Check if we can access the Edge Function
    const { available, authenticated } = await canAccessApi();
    
    if (!available) {
      console.warn("Edge Function not accessible. Using mock data instead.");
      // Fall back to mock data
      return mockSearchDrugShortages(drugName);
    }
    
    if (!authenticated) {
      console.warn("Edge Function doesn't have API credentials. Using mock data instead.");
      toast.info("Using sample drug shortage data (API credentials not found)", {
        id: "mock-data-notice",
        duration: 3000
      });
      // Fall back to mock data
      return mockSearchDrugShortages(drugName);
    }
    
    console.log("Using Edge Function to search for drug:", drugName);
    
    // Call our Edge Function
    const { data, error } = await supabase.functions.invoke('drug-shortage-api', {
      method: 'POST',
      body: { 
        action: 'search',
        term: drugName 
      }
    });
    
    if (error) throw new ApiError(error.message);
    
    // Check if it's an error response
    if ((data as EdgeFunctionError).error) {
      const errorData = data as EdgeFunctionError;
      throw new ApiError(errorData.error, errorData.missingCredentials);
    }

    // Transform the API response data
    const apiResponse = data as ApiResponse<any>;
    return apiResponse.data.map(transformSearchResult);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error; // Rethrow our custom error
    }
    console.error("Drug shortage search error:", error);
    // Fall back to mock data for unknown errors
    return mockSearchDrugShortages(drugName);
  }
};

// Get details for a single shortage report
export const getDrugShortageReport = async (
  reportId: string,
  type: 'shortage' | 'discontinuation'
): Promise<DrugShortageReport> => {
  try {
    // Check if we can access the Edge Function
    const { available, authenticated } = await canAccessApi();
    
    if (!available) {
      console.warn("Edge Function not accessible. Using mock data instead.");
      // Fall back to mock data
      return mockGetDrugShortageReport(reportId, type);
    }
    
    if (!authenticated) {
      console.warn("Edge Function doesn't have API credentials. Using mock data instead.");
      toast.info("Using sample shortage report data (API credentials not found)", {
        id: "mock-report-notice",
        duration: 3000
      });
      // Fall back to mock data
      return mockGetDrugShortageReport(reportId, type);
    }
    
    console.log("Using Edge Function to get report:", reportId);
    
    // Call our Edge Function
    const { data, error } = await supabase.functions.invoke('drug-shortage-api', {
      method: 'POST',
      body: { 
        action: type === 'shortage' ? 'shortage' : 'discontinuance',
        reportId 
      }
    });
    
    if (error) throw new ApiError(error.message);
    
    // Check if it's an error response
    if ((data as EdgeFunctionError).error) {
      const errorData = data as EdgeFunctionError;
      throw new ApiError(errorData.error, errorData.missingCredentials);
    }

    // Transform the API response
    return transformReport(data);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error; // Rethrow our custom error
    }
    console.error("Get drug shortage report error:", error);
    // Fall back to mock data for unknown errors
    return mockGetDrugShortageReport(reportId, type);
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
    },
    {
      id: "67890",
      report_id: "HS-" + Math.floor(10000 + Math.random() * 90000),
      brand_name: drugName + " Extended Release",
      company_name: "MediCorp Ltd.",
      active_ingredients: "Active ingredient for " + drugName,
      strength: "20mg",
      dosage_form: "Extended Release Tablet",
      status: "Resolved",
      updated_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
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
  
  const isActive = reportId === "12345";
  
  return {
    id: reportId,
    report_id: "HS-" + Math.floor(10000 + Math.random() * 90000),
    brand_name: isActive ? "Mock Drug Name" : "Mock Drug Extended Release",
    active_ingredients: "Active ingredient for drug",
    company_name: isActive ? "PharmaCorp Inc." : "MediCorp Ltd.",
    strength: isActive ? "10mg" : "20mg",
    dosage_form: isActive ? "Tablet" : "Extended Release Tablet",
    anticipated_start_date: isActive ? "2023-01-15" : "2022-11-10",
    estimated_end_date: isActive ? "2023-07-30" : "2023-02-15",
    actual_end_date: isActive ? undefined : "2023-02-01",
    status: isActive ? "Active" : "Resolved",
    reason_for_shortage: isActive 
      ? "Manufacturing disruption due to supply chain issues" 
      : "Temporary production delay due to quality control procedures",
    comments: isActive 
      ? "This shortage affects all dosages. Healthcare providers should consider alternatives for new patients and maintain current patients on existing therapy when possible." 
      : "The supply has been restored to normal levels. No further disruption is expected.",
    tier_3: reportId === "12345",
    updated_date: isActive 
      ? new Date().toISOString().split('T')[0] 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: type
  };
};
