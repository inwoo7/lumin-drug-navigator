
import { useQuery } from "@tanstack/react-query";
import {
  searchDrugShortages,
  getDrugShortageReport,
  mockSearchDrugShortages,
  mockGetDrugShortageReport,
  DrugShortageSearchResult,
  DrugShortageReport
} from "@/integrations/drugShortage/api";
import { toast } from "sonner";

export const useDrugShortageSearch = (drugName: string) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['drugShortages', drugName],
    queryFn: async () => {
      if (!drugName) return [] as DrugShortageSearchResult[];
      
      try {
        console.log(`Searching for drug shortages: "${drugName}"`);
        // Use Edge Function to access the API
        const results = await searchDrugShortages(drugName);
        console.log(`Found ${results.length} shortages for "${drugName}"`);
        return results;
      } catch (err: any) {
        console.error('Error searching drug shortages:', err);
        
        // Check if this is the first time showing the error
        const errorId = `api-error-${drugName}`;
        
        // Check if the error is due to missing credentials
        if (err.missingCredentials) {
          toast.error("API credentials not configured. Using mock data.", {
            id: "missing-credentials",
            duration: 5000
          });
        } else if (err.message && err.message.includes('404')) {
          // Special handling for 404 errors which likely indicate API endpoint changes
          toast.error("The Drug Shortages Canada API may have changed. Using mock data.", {
            id: errorId,
            duration: 5000
          });
        } else {
          toast.error(`Error fetching drug shortage data: ${err.message || 'Unknown error'}. Using mock data.`, {
            id: errorId,
            duration: 5000
          });
        }
        
        // Log that we're falling back to mock data
        console.log(`Falling back to mock data for "${drugName}"`);
        
        // Fall back to mock data on error
        const mockData = await mockSearchDrugShortages(drugName);
        
        // Log the mock data we're using
        console.log(`Using mock data with ${mockData.length} results`);
        
        return mockData;
      }
    },
    enabled: drugName.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    retry: 1, // Only retry once to avoid excessive API calls on failure
  });

  return {
    shortages: data || [],
    isLoading,
    isError,
    error
  };
};

export const useDrugShortageReport = (
  reportId: string | undefined, 
  type: 'shortage' | 'discontinuation' = 'shortage'
) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['drugShortageReport', reportId, type],
    queryFn: async () => {
      if (!reportId) return null;
      
      try {
        console.log(`Fetching ${type} report: ${reportId}`);
        // Use Edge Function to access the API
        const report = await getDrugShortageReport(reportId, type);
        console.log(`Successfully retrieved ${type} report for ID ${reportId}`);
        return report;
      } catch (err: any) {
        console.error('Error fetching drug shortage report:', err);
        
        // Create a unique ID for this error to prevent duplicate toasts
        const errorId = `report-error-${reportId}`;
        
        // Check if the error is due to missing credentials
        if (err.missingCredentials) {
          toast.error("API credentials not configured. Using mock data.", {
            id: "missing-credentials",
            duration: 5000
          });
        } else if (err.message && err.message.includes('404')) {
          // Special handling for 404 errors which likely indicate API endpoint changes
          toast.error("The Drug Shortages Canada API may have changed. Using mock data.", {
            id: errorId,
            duration: 5000
          });
        } else {
          toast.error(`Error fetching drug shortage report: ${err.message || 'Unknown error'}. Using mock data.`, {
            id: errorId,
            duration: 5000
          });
        }
        
        // Log that we're falling back to mock data
        console.log(`Using mock data for report ${reportId}`);
        
        // Fall back to mock data on error
        return await mockGetDrugShortageReport(reportId, type);
      }
    },
    enabled: !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes - keep the data in cache longer
    retry: 1, // Only retry once to avoid excessive API calls on failure
  });

  return {
    report: data,
    isLoading,
    isError,
    error
  };
};
