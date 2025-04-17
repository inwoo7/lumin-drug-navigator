
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Calendar, ExternalLink } from "lucide-react";

type DrugShortageInfoProps = {
  drugName: string;
  shortageData?: any; // Will be properly typed once we know the API response structure
  isLoading: boolean;
};

// Mock data for demonstration
const mockShortageData = {
  status: "Active",
  updateDate: "2023-04-15",
  anticipatedEndDate: "2023-07-30",
  company: "PharmaCorp Inc.",
  reason: "Manufacturing disruption due to supply chain issues",
  alternativeProducts: [
    "Generic Equivalent 10mg",
    "Alternative Medication A",
    "Alternative Medication B"
  ],
  affectedRegions: ["Ontario", "Quebec", "Alberta"],
  impact: "Moderate",
  details: "This shortage affects all dosages. Healthcare providers should consider alternatives for new patients and maintain current patients on existing therapy when possible."
};

const DrugShortageInfo = ({ drugName, shortageData = mockShortageData, isLoading }: DrugShortageInfoProps) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="h-full flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 animate-spin mx-auto"></div>
            <p className="text-gray-500">Retrieving shortage information for {drugName}...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Map the impact to a color
  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case "severe":
        return "bg-red-500";
      case "moderate":
        return "bg-yellow-500";
      case "minor":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">{drugName}</CardTitle>
            <CardDescription className="flex items-center mt-1">
              <Clock className="h-3.5 w-3.5 mr-1" /> Updated on {shortageData.updateDate}
            </CardDescription>
          </div>
          <Badge 
            variant={shortageData.status === "Active" ? "destructive" : "outline"}
            className="ml-2"
          >
            {shortageData.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Company</h4>
                <p className="text-sm">{shortageData.company}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Expected Resolution</h4>
                <p className="text-sm flex items-center">
                  <Calendar className="h-3.5 w-3.5 mr-1 inline" />
                  {shortageData.anticipatedEndDate}
                </p>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Reason for Shortage</h4>
              <p className="text-sm">{shortageData.reason}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Impact Level</h4>
              <div className="flex items-center mt-1">
                <span className={`w-3 h-3 rounded-full ${getImpactColor(shortageData.impact)} mr-2`}></span>
                <span className="text-sm">{shortageData.impact}</span>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Affected Regions</h4>
              <div className="flex flex-wrap gap-1 mt-1">
                {shortageData.affectedRegions.map((region: string, index: number) => (
                  <Badge variant="outline" key={index}>
                    {region}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Alternative Products</h4>
              <ul className="list-disc pl-5 mt-1 text-sm">
                {shortageData.alternativeProducts.map((alt: string, index: number) => (
                  <li key={index}>{alt}</li>
                ))}
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="bg-amber-50 p-3 rounded-md border border-amber-200">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Shortage Alert</h4>
                  <p className="text-sm text-amber-700">
                    This is an active shortage situation. Please review alternative options carefully.
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium">Detailed Information</h4>
              <p className="text-sm mt-1">{shortageData.details}</p>
            </div>
            
            <Separator />
            
            <div>
              <h4 className="text-sm font-medium">Official Source</h4>
              <a 
                href="https://www.drugshortagescanada.ca/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center mt-1"
              >
                Drug Shortages Canada
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DrugShortageInfo;
