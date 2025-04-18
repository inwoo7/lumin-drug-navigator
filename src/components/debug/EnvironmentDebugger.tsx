
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, RefreshCw, Info, Server, ExternalLink, Bug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const EnvironmentDebugger = () => {
  const [visible, setVisible] = useState(false);
  const [edgeFunctionStatus, setEdgeFunctionStatus] = useState<'loading' | 'available' | 'authenticated' | 'unavailable'>('loading');
  const [apiTestInProgress, setApiTestInProgress] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<null | {
    success: boolean;
    message: string;
    details?: any;
  }>(null);
  
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
      
      console.log("API credentials check:", data);
      
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
  
  const testDrugShortageAPI = async () => {
    setApiTestInProgress(true);
    setApiTestResult(null);
    
    try {
      // Use a simple test search term
      const testTerm = "test";
      
      const { data, error } = await supabase.functions.invoke('drug-shortage-api', {
        method: 'POST',
        body: { 
          action: 'search',
          term: testTerm
        }
      });
      
      if (error) {
        console.error("API test error:", error);
        setApiTestResult({
          success: false,
          message: "Edge Function error: " + error.message,
          details: error
        });
        return;
      }
      
      if (data?.error) {
        console.error("API response error:", data.error);
        setApiTestResult({
          success: false,
          message: data.error,
          details: data
        });
        return;
      }
      
      // Check if we got a valid response
      if (data?.data && Array.isArray(data.data)) {
        setApiTestResult({
          success: true,
          message: `Successfully connected to API and received ${data.data.length} results`,
          details: data
        });
      } else {
        setApiTestResult({
          success: false,
          message: "Received unexpected response format from API",
          details: data
        });
      }
    } catch (error) {
      console.error("Error testing API:", error);
      setApiTestResult({
        success: false,
        message: "Error testing API: " + (error as Error).message
      });
    } finally {
      setApiTestInProgress(false);
    }
  };
  
  const resetAPICache = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('drug-shortage-api', {
        method: 'POST',
        body: { 
          action: 'resetCache'
        }
      });
      
      if (error) {
        console.error("Reset cache error:", error);
        toast.error("Failed to reset API cache: " + error.message);
        return;
      }
      
      toast.success("API cache reset successfully");
      // Refresh status
      checkEdgeFunction();
    } catch (error) {
      console.error("Error resetting API cache:", error);
      toast.error("Error resetting API cache: " + (error as Error).message);
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
        <Bug className="h-4 w-4 mr-2" />
        Debug Environment
      </Button>
    );
  }
  
  return (
    <Card className="fixed bottom-4 right-4 z-50 w-96 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm flex items-center">
            <Bug className="h-4 w-4 mr-2" />
            Environment Debugger
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                checkEdgeFunction();
                setApiTestResult(null);
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
          
          <div className="flex justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={apiTestInProgress || edgeFunctionStatus === 'loading'}
              onClick={testDrugShortageAPI}
              className="flex-1"
            >
              {apiTestInProgress ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test API Connection"
              )}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              disabled={apiTestInProgress || edgeFunctionStatus === 'loading'}
              onClick={resetAPICache}
              className="flex-1"
            >
              Reset API Cache
            </Button>
          </div>
          
          {apiTestResult && (
            <div className={`pt-2 p-3 rounded-md border mt-2 ${
              apiTestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <p className={`font-medium ${
                apiTestResult.success ? 'text-green-800' : 'text-red-800'
              } mb-1`}>
                {apiTestResult.success ? 'API Connection Successful' : 'API Connection Failed'}
              </p>
              <p className={apiTestResult.success ? 'text-green-700' : 'text-red-700'}>
                {apiTestResult.message}
              </p>
              {apiTestResult.details && (
                <pre className="mt-1 text-xs overflow-auto max-h-32 p-1 bg-gray-50 rounded">
                  {JSON.stringify(apiTestResult.details, null, 2)}
                </pre>
              )}
            </div>
          )}
          
          <div className="pt-2 bg-blue-50 p-3 rounded-md border border-blue-200 mt-2">
            <div className="flex">
              <Server className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-blue-800 mb-1">Supabase Edge Function:</p>
                <p className="text-blue-700 text-xs">
                  The Edge Function has been updated to detect API changes and handle authentication issues better.
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
                <div className="flex flex-col space-y-1 mt-2">
                  <a 
                    href="https://supabase.com/dashboard/project/oeazqjeopkepqynrqsxj/functions/drug-shortage-api/logs" 
                    target="_blank"
                    className="text-blue-600 hover:underline flex items-center"
                  >
                    View Edge Function Logs
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                  <a 
                    href="https://supabase.com/dashboard/project/oeazqjeopkepqynrqsxj/settings/functions" 
                    target="_blank"
                    className="text-blue-600 hover:underline flex items-center"
                  >
                    Check Function Secrets
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
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
              <li>The API structure may have changed, causing 404 errors</li>
              <li>Check Edge Function logs for detailed error information</li>
              <li>Use "Reset API Cache" to clear the cached authentication token</li>
              <li>Verify your API credentials are correct in Supabase secrets</li>
              <li>If issues persist, the application will use mock data automatically</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnvironmentDebugger;
