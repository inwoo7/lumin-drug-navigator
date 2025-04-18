
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
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";

export const useDrugShortageSearch = (drugName: string) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['drugShortages', drugName],
    queryFn: async () => {
      if (!drugName) return [] as DrugShortageSearchResult[];
      
      try {
        // First, check if we have results in Supabase
        const { data: cachedSearch } = await supabase
          .from('drug_shortage_searches')
          .select('results')
          .eq('search_term', drugName)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (cachedSearch) {
          console.log(`Using cached results for "${drugName}"`);
          // Type assertion to convert from Json to our expected type
          return cachedSearch.results as unknown as DrugShortageSearchResult[];
        }

        console.log(`No cached results found for "${drugName}", fetching from API...`);
        // If not in cache, fetch from API
        const results = await searchDrugShortages(drugName);
        
        // Store the results in Supabase
        await supabase
          .from('drug_shortage_searches')
          .insert({
            search_term: drugName,
            results: results as unknown as Json
          });

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
        
        // Fall back to mock data on error
        const mockData = await mockSearchDrugShortages(drugName);
        return mockData;
      }
    },
    enabled: drugName.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1
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
        // First, check if we have the report in Supabase
        const { data: cachedReport } = await supabase
          .from('drug_shortage_reports')
          .select('report_data')
          .eq('id', reportId)
          .eq('report_type', type)
          .single();

        if (cachedReport) {
          console.log(`Using cached report for ID ${reportId}`);
          // Type assertion to convert from Json to our expected type
          return cachedReport.report_data as unknown as DrugShortageReport;
        }

        console.log(`No cached report found for ID ${reportId}, fetching from API...`);
        // If not in cache, fetch from API
        const report = await getDrugShortageReport(reportId, type);
        
        // Store the report in Supabase
        await supabase
          .from('drug_shortage_reports')
          .upsert({
            id: reportId,
            report_type: type,
            report_data: report as unknown as Json,
            updated_at: new Date().toISOString()
          });

        return report;
      } catch (err: any) {
        console.error('Error fetching drug shortage report:', err);
        
        const errorId = `report-error-${reportId}`;
        
        if (err.missingCredentials) {
          toast.error("API credentials not configured. Using mock data.", {
            id: "missing-credentials",
            duration: 5000
          });
        } else if (err.message && err.message.includes('404')) {
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
        
        // Fall back to mock data
        return await mockGetDrugShortageReport(reportId, type);
      }
    },
    enabled: !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1
  });

  return {
    report: data,
    isLoading,
    isError,
    error
  };
};
