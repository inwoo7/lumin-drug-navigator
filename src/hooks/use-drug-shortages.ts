
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
        
        // Check if the error is due to missing credentials
        if (err.missingCredentials) {
          toast.error("API credentials not configured. Using mock data.", {
            id: "missing-credentials",
            duration: 5000
          });
        } else {
          toast.error("Error fetching drug shortage data. Using mock data.", {
            id: "api-error",
            duration: 5000
          });
        }
        
        // Fall back to mock data on error
        return await mockSearchDrugShortages(drugName);
      }
    },
    enabled: drugName.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
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
        
        // Check if the error is due to missing credentials
        if (err.missingCredentials) {
          toast.error("API credentials not configured. Using mock data.", {
            id: "missing-credentials",
            duration: 5000
          });
        } else {
          toast.error("Error fetching drug shortage report. Using mock data.", {
            id: "report-api-error",
            duration: 5000
          });
        }
        
        // Fall back to mock data on error
        return await mockGetDrugShortageReport(reportId, type);
      }
    },
    enabled: !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  return {
    report: data,
    isLoading,
    isError,
    error
  };
};
