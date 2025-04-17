
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const EnvironmentDebugger = () => {
  const [visible, setVisible] = useState(false);
  const [envVars, setEnvVars] = useState({
    hasApiEmail: false,
    hasApiPassword: false,
    emailValue: "",
    passwordValue: ""
  });
  
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
  
  // Check environment variables on mount
  useEffect(() => {
    checkEnvVars();
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
              onClick={checkEnvVars}
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
          
          <div className="pt-2 bg-yellow-50 p-3 rounded-md border border-yellow-200">
            <p className="font-medium text-yellow-800 mb-1">Troubleshooting Tips:</p>
            <ul className="list-disc pl-4 mt-1 space-y-1 text-yellow-700">
              <li>Environment variables <b>must</b> start with "VITE_"</li>
              <li>You need to restart the dev server after adding variables</li>
              <li>Check that variables are in the .env file at the project root</li>
              <li>Click the "Test API Connection" button below to verify credentials</li>
            </ul>
            <Button 
              className="w-full mt-2 bg-yellow-500 hover:bg-yellow-600 text-white"
              size="sm"
              onClick={() => {
                if (envVars.hasApiEmail && envVars.hasApiPassword) {
                  toast.success("Testing API connection...");
                  // This will cause the app to try to connect to the API
                  window.location.reload();
                } else {
                  toast.error("API credentials not set. Please add them to your .env file.");
                }
              }}
            >
              Test API Connection
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnvironmentDebugger;
