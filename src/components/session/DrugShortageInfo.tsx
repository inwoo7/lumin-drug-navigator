
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Calendar, ExternalLink, Loader2 } from "lucide-react";
import { useDrugShortageSearch, useDrugShortageReport } from "@/hooks/use-drug-shortages";
import { DrugShortageReport, DrugShortageSearchResult } from "@/integrations/drugShortage/api";
import { Button } from "@/components/ui/button";

type DrugShortageInfoProps = {
  drugName: string;
};

const DrugShortageInfo = ({ drugName }: DrugShortageInfoProps) => {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<'shortage' | 'discontinuation'>('shortage');
  
  // Fetch the list of shortages for this drug
  const { 
    shortages, 
    isLoading: isSearchLoading, 
    isError: isSearchError 
  } = useDrugShortageSearch(drugName);
  
  // If a report is selected, fetch its details
  const { 
    report, 
    isLoading: isReportLoading, 
    isError: isReportError 
  } = useDrugShortageReport(
    selectedReport || undefined, 
    selectedReportType
  );
  
  // Select the first report by default when results come in
  if (shortages.length > 0 && !selectedReport && !isSearchLoading) {
    setSelectedReport(shortages[0].id);
    setSelectedReportType(shortages[0].type);
  }

  if (isSearchLoading) {
    return (
      <Card className="h-full">
        <CardContent className="h-full flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-lumin-teal" />
            <p className="text-gray-500">Retrieving shortage information for {drugName}...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isSearchError) {
    return (
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <h3 className="font-medium">Error Fetching Shortage Data</h3>
            <p className="text-sm text-gray-500">
              We couldn't retrieve shortage information for {drugName}.
            </p>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (shortages.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>No Shortages Found</CardTitle>
          <CardDescription>No current shortage reports for {drugName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-green-50 p-3 rounded-md border border-green-200">
            <div className="flex items-start">
              <div>
                <p className="text-sm text-green-800">
                  Good news! We couldn't find any reported shortages for this drug. 
                  This may change in the future, so check back regularly.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If we have multiple reports, show a selector
  const ReportSelector = () => (
    shortages.length > 1 ? (
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Select Report:</h4>
        <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
          {shortages.map((shortage) => (
            <Card 
              key={shortage.id}
              className={`cursor-pointer border ${selectedReport === shortage.id ? 'border-lumin-teal bg-lumin-teal/5' : 'border-gray-200'}`}
              onClick={() => {
                setSelectedReport(shortage.id);
                setSelectedReportType(shortage.type);
              }}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div className="text-sm">
                    <div className="font-medium">{shortage.brand_name}</div>
                    <div className="text-xs text-gray-500">{shortage.company_name}</div>
                    <div className="text-xs text-gray-500">{shortage.report_id}</div>
                  </div>
                  <Badge variant={shortage.status === "Active" ? "destructive" : "outline"}>
                    {shortage.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    ) : null
  );
  
  if (isReportLoading || !report) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-xl">{drugName}</CardTitle>
          <CardDescription>Loading report details...</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportSelector />
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-lumin-teal" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Map the impact to a color
  const getImpactColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('discontinued') || statusLower.includes('active')) {
      return "bg-red-500";
    } else if (statusLower.includes('anticipated')) {
      return "bg-yellow-500";
    } else if (statusLower.includes('resolved') || statusLower.includes('avoided')) {
      return "bg-green-500";
    } else {
      return "bg-gray-500";
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">{report.brand_name}</CardTitle>
            <CardDescription className="flex items-center mt-1">
              <Clock className="h-3.5 w-3.5 mr-1" /> Updated on {new Date(report.updated_date).toLocaleDateString()}
            </CardDescription>
          </div>
          <Badge 
            variant={report.status.toLowerCase().includes('active') ? "destructive" : "outline"}
            className="ml-2"
          >
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ReportSelector />
        
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Company</h4>
                <p className="text-sm">{report.company_name}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Expected Resolution</h4>
                <p className="text-sm flex items-center">
                  <Calendar className="h-3.5 w-3.5 mr-1 inline" />
                  {report.estimated_end_date || 'Not specified'}
                </p>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Report ID</h4>
              <p className="text-sm">{report.report_id}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Active Ingredient(s)</h4>
              <p className="text-sm">{report.active_ingredients}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Strength & Form</h4>
              <p className="text-sm">{report.strength} - {report.dosage_form}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Reason for Shortage</h4>
              <p className="text-sm">{report.reason_for_shortage || 'Not specified'}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Status</h4>
              <div className="flex items-center mt-1">
                <span className={`w-3 h-3 rounded-full ${getImpactColor(report.status)} mr-2`}></span>
                <span className="text-sm">{report.status}</span>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="bg-amber-50 p-3 rounded-md border border-amber-200">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Shortage Alert</h4>
                  <p className="text-sm text-amber-700">
                    {report.status.toLowerCase().includes('active') 
                      ? 'This is an active shortage situation. Please review alternative options carefully.'
                      : `Current status: ${report.status}`
                    }
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium">Timeline</h4>
              <div className="mt-2 space-y-2 text-sm">
                {report.anticipated_start_date && (
                  <div className="flex">
                    <span className="w-32 text-gray-500">Anticipated Start:</span>
                    <span>{report.anticipated_start_date}</span>
                  </div>
                )}
                {report.actual_start_date && (
                  <div className="flex">
                    <span className="w-32 text-gray-500">Actual Start:</span>
                    <span>{report.actual_start_date}</span>
                  </div>
                )}
                {report.estimated_end_date && (
                  <div className="flex">
                    <span className="w-32 text-gray-500">Estimated End:</span>
                    <span>{report.estimated_end_date}</span>
                  </div>
                )}
                {report.actual_end_date && (
                  <div className="flex">
                    <span className="w-32 text-gray-500">Actual End:</span>
                    <span>{report.actual_end_date}</span>
                  </div>
                )}
                {report.discontinuation_date && (
                  <div className="flex">
                    <span className="w-32 text-gray-500">Discontinuation:</span>
                    <span>{report.discontinuation_date}</span>
                  </div>
                )}
              </div>
            </div>
            
            {report.comments && (
              <div>
                <h4 className="text-sm font-medium">Comments</h4>
                <p className="text-sm mt-1">{report.comments}</p>
              </div>
            )}
            
            {report.tier_3 && (
              <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Tier 3 Shortage:</strong> This is classified as a Tier 3 shortage, which may have significant impact on the healthcare system.
                </p>
              </div>
            )}
            
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
