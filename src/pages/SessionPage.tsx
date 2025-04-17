
import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, FileText, MessageSquare } from "lucide-react";
import DrugShortageInfo from "@/components/session/DrugShortageInfo";
import ChatInterface from "@/components/session/ChatInterface";
import DocumentEditor from "@/components/session/DocumentEditor";
import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const SessionPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const [drugName, setDrugName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [documentContent, setDocumentContent] = useState("");
  
  useEffect(() => {
    const fetchSessionData = async () => {
      try {
        // In a real app, we would fetch the session data from Supabase
        // For now, use data from location state or mock data
        if (location.state && location.state.drugName) {
          setDrugName(location.state.drugName);
        } else {
          // Mock data if we don't have state (e.g., direct navigation to URL)
          setDrugName("Amoxicillin");
        }
      } catch (error) {
        console.error("Error fetching session data:", error);
        toast.error("Failed to load session data");
      } finally {
        // Simulate API loading delay
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
      }
    };

    fetchSessionData();
  }, [sessionId, location.state]);

  const handleUpdateDocument = (content: string) => {
    setDocumentContent(content);
    // In a real app, we would save this to Supabase
  };
  
  const handleSendToDocument = (content: string) => {
    // In a real app, we would update the document with the content
    setDocumentContent((prev) => prev + "\n\n" + content);
    toast.success("Added content to document");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading session data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold ml-2">{drugName} Shortage</h1>
        </div>
        
        <div>
          <Button 
            onClick={() => toast.success("Session saved successfully")}
            variant="outline"
          >
            Save Session
          </Button>
        </div>
      </div>
      
      <Separator />
      
      <Tabs defaultValue="info" className="w-full">
        <TabsList>
          <TabsTrigger value="info" className="flex items-center">
            <MessageSquare className="h-4 w-4 mr-2" />
            Shortage Information
          </TabsTrigger>
          <TabsTrigger value="document" className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            Document Preparation
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="info" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DrugShortageInfo drugName={drugName} isLoading={false} />
            <ChatInterface drugName={drugName} sessionType="info" />
          </div>
        </TabsContent>
        
        <TabsContent value="document" className="mt-4">
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <CardContent className="py-3">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
                <p className="text-sm text-amber-700">
                  Use the document editor to create a response plan. The AI assistant can help you generate content and answer questions.
                </p>
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DocumentEditor drugName={drugName} onContentChange={handleUpdateDocument} />
            <ChatInterface 
              drugName={drugName} 
              sessionType="document" 
              onSendToDocument={handleSendToDocument} 
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SessionPage;
