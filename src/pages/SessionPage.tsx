import { useState, useEffect, useRef } from "react";
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
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isInfoAssistantReady, setIsInfoAssistantReady] = useState(false);
  const [isDocumentAssistantReady, setIsDocumentAssistantReady] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  
  // Use our hook to load session data
  const { session, isLoading: isSessionLoading, isError: isSessionError } = useSession(sessionId);
  
  // Get drug shortage report data for the selected report
  const { report: selectedReportData, isLoading: isReportLoading } = useDrugShortageReport(
    selectedReportId, 
    selectedReportType, 
    sessionId
  );
  
  // Add this useEffect to log state changes
  useEffect(() => {
    // Avoid logging the initial empty state excessively
    if (documentContent !== "") {
        console.log("SessionPage: documentContent state updated. New length:", documentContent?.length);
    }
  }, [documentContent]);
  
  // Initialize the Document AI Assistant with error handling
  const documentAssistant = useOpenAIAssistant({
    assistantType: "document",
    sessionId,
    drugShortageData: selectedReportData,
    documentContent,
    autoInitialize: !!selectedReportData && !isDocumentGenerated && !docLoadAttempted && documentContent === "",
    generateDocument: !!selectedReportData && !isDocumentGenerated && documentContent === "",
    onDocumentUpdate: (newContent) => {
      console.log("SessionPage: onDocumentUpdate called by hook.");
      console.log(`   - Received content length: ${newContent?.length}`);
      console.log(`   - Current state length before update: ${documentContent?.length}`);
      if (newContent !== documentContent) {
          console.log("   - Content is different, calling setDocumentContent, saveDocument, and incrementing editorKey.")
          setDocumentContent(newContent); 
          saveDocument(newContent);
          setEditorKey(prevKey => prevKey + 1);
      } else {
          console.log("   - Received content is the same as current state. Skipping update.");
      }
      
      // Mark as generated if not already
      if (!isDocumentGenerated) {
          setIsDocumentGenerated(true);
          setIsDocumentInitializing(false);
      }
      // Mark assistant as ready if not already
       if (!isDocumentAssistantReady) {
           setIsDocumentAssistantReady(true);
       }
    },
    onStateChange: (state) => {
      // Mark document assistant ready when initialized
      if (state.isInitialized) {
        setIsDocumentAssistantReady(true);
      }
      
      // If document generation fails or takes too long
      if (!state.isLoading && !state.isInitialized && hasAttemptedDocInit.current) {
        console.log("Document assistant failed to initialize properly");
        setIsDocumentAssistantReady(true); // Allow user to proceed anyway
      }
    }
  });
  
  // Reference to track initialization attempts
  const hasAttemptedDocInit = useRef(false);
  
  // Set initialization attempt flag when conditions are right
  useEffect(() => {
    if (!!selectedReportData && !isDocumentGenerated && !docLoadAttempted && documentContent === "") {
      hasAttemptedDocInit.current = true;
    }
  }, [selectedReportData, isDocumentGenerated, docLoadAttempted, documentContent]);

  // Initialize the Info AI Assistant to track when it's ready
  const infoAssistant = useOpenAIAssistant({
    assistantType: "shortage",
    sessionId,
    drugShortageData: selectedReportData,
    allShortageData: [],
    autoInitialize: !!selectedReportData && sessionId !== undefined,
    onStateChange: (state) => {
      if (state.isInitialized) {
        setIsInfoAssistantReady(true);
      }
    }
  });
  
  // Load both document and chat conversations before allowing user interaction
  useEffect(() => {
    const preloadSession = async () => {
      if (!sessionId) return;
      
      try {
        console.log("Preloading session data and document...");
        
        // Check if this is an existing session first
        const { data: existingDoc } = await supabase
          .rpc('get_session_document', { p_session_id: sessionId });
          
        const hasExistingDocument = existingDoc && existingDoc.length > 0 && existingDoc[0]?.content;
        
        // Check if this session already has conversations
        const { data: existingConversations } = await supabase
          .rpc('get_ai_conversation', { 
            p_session_id: sessionId, 
            p_assistant_type: "shortage" 
          });
        
        const hasExistingConversation = existingConversations && 
                                        existingConversations.length > 0 && 
                                        existingConversations[0]?.messages;
        
        if (hasExistingDocument && hasExistingConversation) {
          // For existing sessions with data, we can skip the loading screen
          console.log("Existing session with data found, skipping loading screen");
          setIsInitialLoading(false);
          setIsInfoAssistantReady(true);
          setIsDocumentAssistantReady(true);
          
          // Still load the document
          await loadDocument();
        } else {
          // For new sessions or sessions without complete data, show loading
          setIsInitialLoading(true);
          await loadDocument();
          
          // For sessions without selectedReportData, don't wait for assistants
          if (!selectedReportData) {
            setIsInfoAssistantReady(true);
            setIsDocumentAssistantReady(true);
            setIsInitialLoading(false);
          }
        }
      } catch (err) {
        console.error("Error preloading session:", err);
        setIsInitialLoading(false);
      }
    };
    
    preloadSession();
  }, [sessionId, selectedReportData]);

  // Check when both assistants are ready
  useEffect(() => {
    console.log(`Assistant ready states - Info: ${isInfoAssistantReady}, Document: ${isDocumentAssistantReady}`);
    // If both assistants are ready or we have errors, show the main UI
    if ((isInfoAssistantReady && isDocumentAssistantReady) || docGenerationError) {
      console.log("Both assistants ready or error occurred, showing main UI");
      setIsInitialLoading(false);
    }
  }, [isInfoAssistantReady, isDocumentAssistantReady, docGenerationError]);
  
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
    if (!sessionId || docLoadAttempted) {
      console.log("Skipping document load: session ID missing or already attempted");
      return;
    }
    
    try {
      console.log(`Attempting to load document for session ${sessionId}...`);
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
        console.log("Loaded document from database with length:", docs[0].content.length);
        setDocumentContent(docs[0].content);
        setIsDocumentGenerated(true);
        setIsDocumentInitializing(false);
        
        // Also mark in the session that it has a document
        if (sessionId) {
          await supabase
            .from('search_sessions')
            .update({ has_document: true })
            .eq('id', sessionId);
          console.log("Updated session record to indicate document exists");
        }
      } else {
        console.log("No document found in database for this session");
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

  // Add a timeout to prevent getting stuck on loading screen
  useEffect(() => {
    // Force show the interface after 20 seconds even if assistants aren't ready
    const loadingTimeout = setTimeout(() => {
      if (isInitialLoading) {
        console.log("Loading timeout reached - forcing UI display");
        setIsInitialLoading(false);
        setIsInfoAssistantReady(true);
        setIsDocumentAssistantReady(true);
      }
    }, 20000); // 20 second timeout
    
    return () => clearTimeout(loadingTimeout);
  }, [isInitialLoading]);

  // Show loading screen if we're in initial loading state
  if (isInitialLoading || isLoading || isSessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] bg-gray-50">
        <div className="text-center p-8 rounded-lg shadow-md bg-white">
          <div className="w-24 h-24 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">Preparing your session</h2>
          <p className="text-gray-500 mb-4">Our AI is analyzing drug shortage data and preparing your documents</p>
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-600">This may take 15-30 seconds as we generate comprehensive information</p>
          </div>
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
                  key={editorKey}
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
