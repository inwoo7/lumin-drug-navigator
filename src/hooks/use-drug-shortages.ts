
import { useState } from "react";
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

// Check if we have API credentials in the environment
const hasApiCredentials = () => {
  // Get the environment variables
  const email = import.meta.env.VITE_DRUG_SHORTAGE_API_EMAIL;
  const password = import.meta.env.VITE_DRUG_SHORTAGE_API_PASSWORD;
  
  console.log("API credentials check:", {
    emailExists: !!email,
    passwordExists: !!password,
    emailValue: email ? "exists" : "missing",
    passwordValue: password ? "exists" : "missing"
  });
  
  return !!email && !!password;
};

// Get API credentials from environment variables
const getApiCredentials = () => {
  return {
    email: import.meta.env.VITE_DRUG_SHORTAGE_API_EMAIL as string,
    password: import.meta.env.VITE_DRUG_SHORTAGE_API_PASSWORD as string,
  };
};

export const useDrugShortageSearch = (drugName: string) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['drugShortages', drugName],
    queryFn: async () => {
      if (!drugName) return [] as DrugShortageSearchResult[];
      
      try {
        if (hasApiCredentials()) {
          console.log("Using actual API with credentials for drug:", drugName);
          // Use real API if credentials are available
          return await searchDrugShortages(drugName, getApiCredentials());
        } else {
          console.warn('Using mock drug shortage data (API credentials not found)');
          toast.error("API credentials not found. Using mock data.");
          // Fall back to mock data
          return await mockSearchDrugShortages(drugName);
        }
      } catch (err) {
        console.error('Error searching drug shortages:', err);
        toast.error("Error fetching drug shortage data. Using mock data.");
        // Fall back to mock data on error
        return await mockSearchDrugShortages(drugName);
      }
    },
    enabled: drugName.length > 0,
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
        if (hasApiCredentials()) {
          console.log("Using actual API with credentials for report:", reportId);
          // Use real API if credentials are available
          return await getDrugShortageReport(reportId, type, getApiCredentials());
        } else {
          console.warn('Using mock drug shortage report (API credentials not found)');
          toast.error("API credentials not found. Using mock data.");
          // Fall back to mock data
          return await mockGetDrugShortageReport(reportId, type);
        }
      } catch (err) {
        console.error('Error fetching drug shortage report:', err);
        toast.error("Error fetching drug shortage report. Using mock data.");
        // Fall back to mock data on error
        return await mockGetDrugShortageReport(reportId, type);
      }
    },
    enabled: !!reportId,
  });

  return {
    report: data,
    isLoading,
    isError,
    error
  };
};
