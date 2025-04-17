
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle } from "lucide-react";

const EnvironmentDebugger = () => {
  const [visible, setVisible] = useState(false);
  
  // Check if drug shortage API credentials exist
  const hasApiEmail = !!import.meta.env.VITE_DRUG_SHORTAGE_API_EMAIL;
  const hasApiPassword = !!import.meta.env.VITE_DRUG_SHORTAGE_API_PASSWORD;
  
  if (!visible) {
    return (
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-50 bg-white"
      >
        Debug Environment
      </Button>
    );
  }
  
  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">Environment Variables</CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setVisible(false)}
          >
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="space-y-2">
          <h3 className="font-medium">Drug Shortage API</h3>
          <div className="flex items-center space-x-2">
            {hasApiEmail ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            <span>VITE_DRUG_SHORTAGE_API_EMAIL: {hasApiEmail ? "Set" : "Not Set"}</span>
          </div>
          <div className="flex items-center space-x-2">
            {hasApiPassword ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            <span>VITE_DRUG_SHORTAGE_API_PASSWORD: {hasApiPassword ? "Set" : "Not Set"}</span>
          </div>
          <div className="pt-2 text-gray-500">
            <p>If variables are not detected, make sure:</p>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              <li>Variables start with "VITE_"</li>
              <li>You've restarted the dev server</li>
              <li>Variables are in the correct .env file</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnvironmentDebugger;
