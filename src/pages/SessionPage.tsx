
import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
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
import { useSession, createSession } from "@/hooks/use-drug-shortages";

const SessionPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [drugName, setDrugName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [documentContent, setDocumentContent] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>();
  const [selectedReportType, setSelectedReportType] = useState<'shortage' | 'discontinuation'>('shortage');
  
  // Use our hook to load session data
  const { session, isLoading: isSessionLoading, isError: isSessionError } = useSession(sessionId);
  
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setIsLoading(true);
        
        // If we have session data from the hook, use it
        if (session) {
          setDrugName(session.drug_name);
          setIsLoading(false);
          return;
        }
        
        // If we're still loading the session, wait
        if (isSessionLoading) {
          return;
        }
        
        // If we got here and have a sessionId but no session data, it means the session wasn't found
        if (sessionId && !session && !isSessionLoading) {
          toast.error("Session not found");
          navigate("/dashboard");
          return;
        }
        
        // For new sessions (no sessionId), use location state or create a new session
        if (!sessionId) {
          if (location.state && location.state.drugName) {
            setDrugName(location.state.drugName);
            
            // Create a new session
            const newSession = await createSession(location.state.drugName);
            if (newSession) {
              // Navigate to the new session URL without reloading the page
              navigate(`/session/${newSession.id}`, { 
                state: { drugName: location.state.drugName },
                replace: true 
              });
            }
          } else {
            // Mock data if we don't have state (e.g., direct navigation to URL)
            setDrugName("Amoxicillin");
            
            // Create a new session
            const newSession = await createSession("Amoxicillin");
            if (newSession) {
              // Navigate to the new session URL without reloading the page
              navigate(`/session/${newSession.id}`, { 
                state: { drugName: "Amoxicillin" },
                replace: true 
              });
            }
          }
        }
      } catch (error) {
        console.error("Error initializing session:", error);
        toast.error("Failed to load session data");
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, [sessionId, location.state, navigate, session, isSessionLoading]);

  const handleUpdateDocument = (content: string) => {
    setDocumentContent(content);
    // In a real app, we would save this to Supabase
  };
  
  const handleSendToDocument = (content: string) => {
    // In a real app, we would update the document with the content
    setDocumentContent((prev) => prev + "\n\n" + content);
    toast.success("Added content to document");
  };

  const handleSaveSession = async () => {
    // In a real app, we would save all session data to Supabase
    toast.success("Session saved successfully");
  };

  // Handle report selection from DrugShortageInfo
  const handleReportSelect = (reportId: string, reportType: 'shortage' | 'discontinuation') => {
    setSelectedReportId(reportId);
    setSelectedReportType(reportType);
  };

  if (isLoading || isSessionLoading) {
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
            onClick={handleSaveSession}
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
            <DrugShortageInfo 
              drugName={drugName} 
              isLoading={false} 
              sessionId={sessionId}
              onReportSelect={handleReportSelect}
            />
            <ChatInterface 
              drugName={drugName} 
              sessionType="info" 
              sessionId={sessionId}
              reportId={selectedReportId}
              reportType={selectedReportType}
            />
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
            <DocumentEditor 
              drugName={drugName} 
              onContentChange={handleUpdateDocument} 
            />
            <ChatInterface 
              drugName={drugName} 
              sessionType="document" 
              sessionId={sessionId}
              reportId={selectedReportId}
              reportType={selectedReportType}
              onSendToDocument={handleSendToDocument} 
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SessionPage;
