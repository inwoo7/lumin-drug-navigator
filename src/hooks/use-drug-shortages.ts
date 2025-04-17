
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

// Check if we have API credentials in the environment
const hasApiCredentials = () => {
  console.log("Checking API credentials:", 
    !!import.meta.env.VITE_DRUG_SHORTAGE_API_EMAIL, 
    !!import.meta.env.VITE_DRUG_SHORTAGE_API_PASSWORD
  );
  
  return !!import.meta.env.VITE_DRUG_SHORTAGE_API_EMAIL && 
         !!import.meta.env.VITE_DRUG_SHORTAGE_API_PASSWORD;
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
          console.log("Using actual API with credentials");
          // Use real API if credentials are available
          return await searchDrugShortages(drugName, getApiCredentials());
        } else {
          console.warn('Using mock drug shortage data (API credentials not found)');
          // Fall back to mock data
          return await mockSearchDrugShortages(drugName);
        }
      } catch (err) {
        console.error('Error searching drug shortages:', err);
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
          console.log("Using actual API with credentials for report", reportId);
          // Use real API if credentials are available
          return await getDrugShortageReport(reportId, type, getApiCredentials());
        } else {
          console.warn('Using mock drug shortage report (API credentials not found)');
          // Fall back to mock data
          return await mockGetDrugShortageReport(reportId, type);
        }
      } catch (err) {
        console.error('Error fetching drug shortage report:', err);
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
