
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, RefreshCw, Info, Server, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const EnvironmentDebugger = () => {
  const [visible, setVisible] = useState(false);
  const [envVars, setEnvVars] = useState({
    hasApiEmail: false,
    hasApiPassword: false,
    emailValue: "",
    passwordValue: ""
  });
  const [edgeFunctionStatus, setEdgeFunctionStatus] = useState<'loading' | 'available' | 'unavailable' | 'authenticated'>('loading');
  
  const checkEnvVars = () => {
    // Check if drug shortage API credentials exist
    const email = import.meta.env.VITE_DRUG_SHORTAGE_API_EMAIL;
    const password = import.meta.env.VITE_DRUG_SHORTAGE_API_PASSWORD;
    
    setEnvVars({
      hasApiEmail: !!email,
      hasApiPassword: !!password,
      emailValue: email ? email.substring(0, 3) + "..." : "Not set",
      passwordValue: password ? "********" : "Not set"
    });
    
    // Log for debugging
    console.log("Environment variables check:", {
      email: email ? "Found" : "Not found", 
      password: password ? "Found" : "Not found",
      emailValue: email ? `${email.substring(0, 3)}...` : "missing",
      passwordValue: password ? "exists" : "missing"
    });
  };
  
  const checkEdgeFunction = async () => {
    setEdgeFunctionStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('drug-shortage-api', {
        method: 'POST',
        body: { checkOnly: true }
      });
      
      if (error) {
        console.error("Edge Function check error:", error);
        setEdgeFunctionStatus('unavailable');
        return;
      }
      
      console.log("Edge Function check result:", data);
      
      // If we have credentials configured, mark as authenticated
      if (data?.hasCredentials) {
        setEdgeFunctionStatus('authenticated');
      } else {
        setEdgeFunctionStatus('available');
      }
    } catch (error) {
      console.error("Error checking Edge Function status:", error);
      setEdgeFunctionStatus('unavailable');
    }
  };
  
  // Check environment variables and Edge Function on mount
  useEffect(() => {
    checkEnvVars();
    checkEdgeFunction();
  }, []);
  
  if (!visible) {
    return (
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-50 bg-white shadow-md border-red-300"
      >
        Debug Environment
      </Button>
    );
  }
  
  return (
    <Card className="fixed bottom-4 right-4 z-50 w-96 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">Environment Variables</CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                checkEnvVars();
                checkEdgeFunction();
                toast.info("Environment refreshed");
              }}
              title="Refresh environment variables"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setVisible(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-3">
        <div className="space-y-2">
          <h3 className="font-medium">Drug Shortage API</h3>
          <div className="flex items-center space-x-2">
            {envVars.hasApiEmail ? (
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            <span className="flex-1">VITE_DRUG_SHORTAGE_API_EMAIL: {envVars.emailValue}</span>
          </div>
          <div className="flex items-center space-x-2">
            {envVars.hasApiPassword ? (
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            <span className="flex-1">VITE_DRUG_SHORTAGE_API_PASSWORD: {envVars.passwordValue}</span>
          </div>
          
          <div className="flex items-center space-x-2 mt-2">
            {edgeFunctionStatus === 'authenticated' ? (
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : edgeFunctionStatus === 'available' ? (
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
            ) : edgeFunctionStatus === 'loading' ? (
              <RefreshCw className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            <span className="flex-1">Edge Function Status: 
              {edgeFunctionStatus === 'authenticated' 
                ? " Available & Authenticated" 
                : edgeFunctionStatus === 'available' 
                  ? " Available (No Credentials)" 
                  : edgeFunctionStatus === 'loading' 
                    ? " Checking..." 
                    : " Unavailable"}
            </span>
          </div>
          
          <div className="pt-2 bg-blue-50 p-3 rounded-md border border-blue-200 mt-2">
            <div className="flex">
              <Server className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-blue-800 mb-1">Supabase Edge Function:</p>
                <p className="text-blue-700 text-xs">
                  A Supabase Edge Function has been created to proxy requests to the Drug Shortages Canada API, 
                  solving the CORS restrictions.
                </p>
                <p className="text-blue-700 text-xs mt-1">
                  {edgeFunctionStatus === 'authenticated' 
                    ? "The Edge Function is deployed with valid API credentials." 
                    : edgeFunctionStatus === 'available'
                      ? "The Edge Function is deployed but API credentials are missing."
                      : edgeFunctionStatus === 'unavailable'
                        ? "The Edge Function is not available. Check Supabase settings."
                        : "Checking Edge Function status..."}
                </p>
                <a 
                  href="https://supabase.com/dashboard/project/oeazqjeopkepqynrqsxj/functions/drug-shortage-api/logs" 
                  target="_blank"
                  className="text-blue-600 hover:underline flex items-center mt-1"
                >
                  View Edge Function Logs
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </div>
            </div>
          </div>
          
          <div className="pt-2 bg-yellow-50 p-3 rounded-md border border-yellow-200">
            <p className="font-medium text-yellow-800 mb-1">Troubleshooting Tips:</p>
            <ul className="list-disc pl-4 mt-1 space-y-1 text-yellow-700">
              <li>Environment variables <b>must</b> start with "VITE_"</li>
              <li>You need to restart the dev server after adding variables</li>
              <li>If the Edge Function is unavailable, it may be still deploying</li>
              <li>The Edge Function uses your API credentials stored in Supabase secrets</li>
              <li>Check Edge Function logs for detailed error information</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnvironmentDebugger;
