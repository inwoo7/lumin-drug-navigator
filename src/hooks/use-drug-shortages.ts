import { useQuery } from "@tanstack/react-query";
import {
  searchDrugShortages,
  getDrugShortageReport,
  DrugShortageSearchResult,
  DrugShortageReport
} from "@/integrations/drugShortage/api";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/components/auth/AuthProvider";

export const useDrugShortageSearch = (drugName: string, sessionId?: string) => {
  const { user } = useAuth();
  
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['drugShortages', drugName, sessionId],
    queryFn: async () => {
      if (!drugName) return [] as DrugShortageSearchResult[];
      
      try {
        // If we have a sessionId, check if this session already has search results
        if (sessionId) {
          const { data: sessionData } = await supabase
            .from('search_sessions')
            .select('drug_name')
            .eq('id', sessionId)
            .single();
          
          if (sessionData && sessionData.drug_name) {
            // This session exists, now get the cached search results
            const { data: cachedSearch } = await supabase
              .from('drug_shortage_searches')
              .select('results')
              .eq('search_term', sessionData.drug_name)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (cachedSearch) {
              console.log(`Using cached results for session ${sessionId}`);
              const cached = cachedSearch.results as unknown as DrugShortageSearchResult[];
              return cached.filter(r => !(r.brand_name && r.brand_name.toLowerCase().includes('mock')));
            }
          }
        }
        
        // Without a session or if session data not found, check by drug name
        const { data: cachedSearch } = await supabase
          .from('drug_shortage_searches')
          .select('results')
          .eq('search_term', drugName)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (cachedSearch) {
          console.log(`Using cached results for "${drugName}"`);
          const cached = cachedSearch.results as unknown as DrugShortageSearchResult[];
          return cached.filter(r => !(r.brand_name && r.brand_name.toLowerCase().includes('mock')));
        }

        console.log(`No cached results found for "${drugName}", fetching from API...`);
        // If not in cache, fetch from API
        let results = await searchDrugShortages(drugName);

        // Filter out any mock placeholder items that may have slipped through
        results = results.filter(r => !(r.brand_name && r.brand_name.toLowerCase().includes('mock')));

        if (results.length === 0) {
          // If we still have no real results, simply return empty without writing to DB
          return [];
        }
        
        // Store the results in Supabase only if we have real data
        await supabase
          .from('drug_shortage_searches')
          .insert({
            search_term: drugName,
            results: results as unknown as Json
          });
        
        // If we have a sessionId, create or update the session
        if (sessionId) {
          await supabase
            .from('search_sessions')
            .upsert({
              id: sessionId,
              drug_name: drugName,
              user_id: user?.id
            });
        }

        return results;
      } catch (err: any) {
        console.error('Error searching drug shortages:', err);
        
        // Check if this is the first time showing the error
        const errorId = `api-error-${drugName}`;
        
        // Check if the error is due to missing credentials
        if (err.missingCredentials) {
          toast.info("Using sample drug shortage data (API credentials not configured)", {
            id: "missing-credentials",
            duration: 3000
          });
        } else if (err.message && err.message.includes('404')) {
          toast.info("Using sample drug shortage data (API temporarily unavailable)", {
            id: errorId,
            duration: 3000
          });
        } else {
          console.warn('Drug shortage API error:', err.message);
          return [];
        }
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
  type: 'shortage' | 'discontinuation' = 'shortage',
  sessionId?: string
) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['drugShortageReport', reportId, type, sessionId],
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
        
        console.warn('Drug shortage report API error:', err.message);
        return null;
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

// New hook to load sessions by ID
export const useSession = (sessionId: string | undefined) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      
      try {
        const { data: sessionData, error } = await supabase
          .from('search_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();
          
        if (error) throw error;
        
        if (sessionData) {
          return sessionData;
        }
        
        return null;
      } catch (err) {
        console.error('Error fetching session:', err);
        throw err;
      }
    },
    enabled: !!sessionId
  });

  return {
    session: data,
    isLoading,
    isError,
    error
  };
};

// New function to create a session
export const createSession = async (drugName: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('search_sessions')
      .insert({
        drug_name: drugName,
        user_id: user?.id || null
      })
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error creating session:', err);
    toast.error('Failed to create session');
    return null;
  }
};
