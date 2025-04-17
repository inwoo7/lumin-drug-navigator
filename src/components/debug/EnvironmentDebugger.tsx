
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, RefreshCw, Info, Server, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const EnvironmentDebugger = () => {
  const [visible, setVisible] = useState(false);
  const [edgeFunctionStatus, setEdgeFunctionStatus] = useState<'loading' | 'available' | 'authenticated' | 'unavailable'>('loading');
  
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
  
  // Check Edge Function on mount
  useEffect(() => {
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
          <CardTitle className="text-sm">Environment Debugger</CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                checkEdgeFunction();
                toast.info("Environment refreshed");
              }}
              title="Refresh environment status"
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
          
          {edgeFunctionStatus === 'available' && (
            <div className="pt-2 bg-amber-50 p-3 rounded-md border border-amber-200">
              <p className="font-medium text-amber-800 mb-1">API Credentials Missing:</p>
              <p className="text-amber-700 text-xs">
                The Edge Function can't connect to the Drug Shortages Canada API because it's missing credentials.
                You need to add the API credentials to your Supabase secrets.
              </p>
              <a 
                href="https://supabase.com/dashboard/project/oeazqjeopkepqynrqsxj/settings/functions" 
                target="_blank"
                className="text-amber-600 hover:underline flex items-center mt-1 text-xs"
              >
                Add Secrets in Supabase
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </div>
          )}
          
          <div className="pt-2 bg-yellow-50 p-3 rounded-md border border-yellow-200">
            <p className="font-medium text-yellow-800 mb-1">Troubleshooting Tips:</p>
            <ul className="list-disc pl-4 mt-1 space-y-1 text-yellow-700">
              <li>Edge Function uses your API credentials stored in Supabase secrets</li>
              <li>Add <b>VITE_DRUG_SHORTAGE_API_EMAIL</b> and <b>VITE_DRUG_SHORTAGE_API_PASSWORD</b> as secrets</li>
              <li>If the Edge Function is unavailable, it may be still deploying</li>
              <li>Check Edge Function logs for detailed error information</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnvironmentDebugger;
