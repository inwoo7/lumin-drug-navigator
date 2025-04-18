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
import { useSession, createSession, useDrugShortageReport } from "@/hooks/use-drug-shortages";
import { supabase } from "@/integrations/supabase/client";
import { SessionDocument } from "@/types/supabase-rpc";
import { useOpenAIAssistant } from "@/hooks/use-openai-assistant";

const SessionPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [drugName, setDrugName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [documentContent, setDocumentContent] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>();
  const [selectedReportType, setSelectedReportType] = useState<'shortage' | 'discontinuation'>('shortage');
  const [activeTab, setActiveTab] = useState("info");
  const [isDocumentInitializing, setIsDocumentInitializing] = useState(false);
  const [isDocumentGenerated, setIsDocumentGenerated] = useState(false);
  const [docGenerationError, setDocGenerationError] = useState(false);
  const [docLoadAttempted, setDocLoadAttempted] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Use our hook to load session data
  const { session, isLoading: isSessionLoading, isError: isSessionError } = useSession(sessionId);
  
  // Get drug shortage report data for the selected report
  const { report: selectedReportData, isLoading: isReportLoading } = useDrugShortageReport(
    selectedReportId, 
    selectedReportType, 
    sessionId
  );
  
  // Initialize the Document AI Assistant with error handling
  const documentAssistant = useOpenAIAssistant({
    assistantType: "document",
    sessionId,
    drugShortageData: selectedReportData,
    documentContent,
    // Only auto-initialize if we have report data AND no document is generated yet AND we haven't tried loading
    autoInitialize: !!selectedReportData && !isDocumentGenerated && !docLoadAttempted && documentContent === "",
    generateDocument: !!selectedReportData && !isDocumentGenerated && documentContent === "",
    onDocumentUpdate: (content) => {
      if (!documentContent || documentContent === "") { // Only update if there's no document already
        setDocumentContent(content);
        setIsDocumentGenerated(true);
        setIsDocumentInitializing(false);
        saveDocument(content);
      }
    }
  });
  
  // Load both document and chat conversations before allowing user interaction
  useEffect(() => {
    const preloadSession = async () => {
      if (!sessionId) return;
      setIsInitialLoading(true);
      
      try {
        // Load document first
        await loadDocument();
        
        // Then set loading to false to display the page
        setIsInitialLoading(false);
      } catch (err) {
        console.error("Error preloading session:", err);
        setIsInitialLoading(false);
      }
    };
    
    preloadSession();
  }, [sessionId]);
  
  // Effect to handle document initialization state
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // If initialization takes too long, assume there's an error
      if (isDocumentInitializing && !isDocumentGenerated && !docGenerationError) {
        setDocGenerationError(true);
        setIsDocumentInitializing(false);
        toast.error("Document generation timed out. Please try again.");
      }
    }, 25000); // 25 second timeout
    
    return () => clearTimeout(timeoutId);
  }, [isDocumentInitializing, isDocumentGenerated, docGenerationError]);
  
  // Only attempt document generation if we have a report AND we haven't already loaded a document
  useEffect(() => {
    if (
      selectedReportData && 
      !isDocumentGenerated && 
      !isDocumentInitializing && 
      !docGenerationError && 
      !docLoadAttempted && 
      documentContent === "" // Only if we don't already have content
    ) {
      setIsDocumentInitializing(true);
      setDocLoadAttempted(true);
    }
  }, [selectedReportData, isDocumentGenerated, isDocumentInitializing, docGenerationError, docLoadAttempted, documentContent]);
  
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

  // Function to load document from database
  const loadDocument = async () => {
    // Exit early if:
    // 1. We don't have a sessionId
    // 2. We've already tried loading (prevents double loads)
    if (!sessionId || docLoadAttempted) return;
    
    try {
      console.log("Attempting to load document from database...");
      setDocLoadAttempted(true); // Mark as attempted immediately to prevent double loads
      
      const { data: docs, error } = await supabase
        .rpc('get_session_document', { 
          p_session_id: sessionId 
        }) as { data: SessionDocument[] | null, error: any };
        
      if (error) {
        console.error("Error loading document:", error);
        return;
      }
      
      if (docs && docs.length > 0 && docs[0]?.content) {
        console.log("Loaded document from database");
        setDocumentContent(docs[0].content);
        setIsDocumentGenerated(true);
        setIsDocumentInitializing(false);
        
        // Also mark in the session that it has a document
        if (sessionId) {
          await supabase
            .from('search_sessions')
            .update({ has_document: true })
            .eq('id', sessionId);
        }
      } else {
        console.log("No document found in database");
      }
    } catch (err) {
      console.error("Error loading document:", err);
    }
  };
    
  // Trigger document loading on initial mount
  useEffect(() => {
    if (sessionId && !docLoadAttempted && !isDocumentGenerated && documentContent === "") {
      loadDocument();
    }
  }, [sessionId, docLoadAttempted, isDocumentGenerated, documentContent]);

  const handleUpdateDocument = (content: string) => {
    setDocumentContent(content);
    // Save document on content update
    saveDocument(content);
  };
  
  const handleSendToDocument = (content: string) => {
    setDocumentContent(content);
    toast.success("Updated document content");
    
    // Save document to Supabase
    if (sessionId) {
      saveDocument(content);
    }
  };

  const saveDocument = async (content: string) => {
    if (!sessionId || !content) return;
    
    try {
      const { error } = await supabase
        .rpc('save_session_document', {
          p_session_id: sessionId,
          p_content: content
        });
        
      if (error) {
        console.error("Error saving document:", error);
        toast.error("Failed to save document: " + error.message);
        return;
      }
      
      // Update the session status to indicate it has a document
      await supabase
        .from('search_sessions')
        .update({ has_document: true })
        .eq('id', sessionId);
        
      console.log("Document saved successfully");
    } catch (err) {
      console.error("Error saving document:", err);
    }
  };

  // Handle report selection from DrugShortageInfo
  const handleReportSelect = (reportId: string, reportType: 'shortage' | 'discontinuation') => {
    setSelectedReportId(reportId);
    setSelectedReportType(reportType);
    
    // Reset document generation state only if we don't already have a document
    if (!isDocumentGenerated && documentContent === "") {
      setIsDocumentInitializing(true);
      setDocLoadAttempted(false);
    }
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // Show loading screen if we're in initial loading state
  if (isInitialLoading || isLoading || isSessionLoading) {
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
      </div>
      
      <Separator />
      
      <Tabs defaultValue={activeTab} value={activeTab} onValueChange={handleTabChange} className="w-full">
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
          {(isDocumentInitializing && !isDocumentGenerated) ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-500">Generating {drugName} shortage document...</p>
                <p className="text-xs text-gray-400 mt-2">This may take a moment as our AI analyzes the shortage data</p>
              </div>
            </div>
          ) : docGenerationError ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="text-center">
                <div className="bg-red-100 p-4 rounded-md mb-4">
                  <p className="text-red-700">There was a problem generating the document.</p>
                  <p className="text-red-600 text-sm mt-2">Please try again later or use the editor to write your own document.</p>
                </div>
                <Button 
                  onClick={() => {
                    setDocGenerationError(false);
                    setIsDocumentInitializing(true);
                    setDocLoadAttempted(false);
                  }}
                  className="mt-4"
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <>
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
                  sessionId={sessionId}
                  onContentChange={handleUpdateDocument} 
                  initialContent={documentContent}
                />
                <ChatInterface 
                  drugName={drugName} 
                  sessionType="document" 
                  sessionId={sessionId}
                  reportId={selectedReportId}
                  reportType={selectedReportType}
                  documentContent={documentContent}
                  onSendToDocument={handleSendToDocument} 
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SessionPage;
