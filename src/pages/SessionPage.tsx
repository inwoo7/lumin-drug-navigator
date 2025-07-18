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
import { useSession, createSession, useDrugShortageReport, useDrugShortageSearch } from "@/hooks/use-drug-shortages";
import { supabase } from "@/integrations/supabase/client";
import { SessionDocument } from "@/types/supabase-rpc";
import { useOpenAIAssistant } from "@/hooks/use-openai-assistant";
import { formatDrugNameForDisplay } from "@/utils/drugNameUtils";

const SESSION_TAB_STORAGE_KEY = 'lumin_active_session_tab';

const SessionPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [drugName, setDrugName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [documentContent, setDocumentContent] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>();
  const [selectedReportType, setSelectedReportType] = useState<'shortage' | 'discontinuation'>('shortage');
  const [activeTab, setActiveTab] = useState(() => {
    // For new sessions or when coming from dashboard search, always start with document tab
    // Only use localStorage for existing sessions that user explicitly switched tabs
    const fromSearch = location.state?.fromSearch;
    const storedTab = localStorage.getItem(SESSION_TAB_STORAGE_KEY);
    
    if (fromSearch || !storedTab) {
      return "document"; // Always start with document preparation for new searches
    }
    
    return storedTab;
  });
  const [isDocumentInitializing, setIsDocumentInitializing] = useState(false);
  const [isDocumentGenerated, setIsDocumentGenerated] = useState(false);
  const [docGenerationError, setDocGenerationError] = useState(false);
  const [docLoadAttempted, setDocLoadAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isInfoAssistantReady, setIsInfoAssistantReady] = useState(false);
  const [isDocumentAssistantReady, setIsDocumentAssistantReady] = useState(false);
  
  // Shared thread state for cross-assistant conversation
  const [sharedThreadId, setSharedThreadId] = useState<string | null>(null);
  
  // Separate thread tracking for different models to handle incompatibility
  const [txAgentThreadId, setTxAgentThreadId] = useState<string | null>(null);
  const [openAIThreadId, setOpenAIThreadId] = useState<string | null>(null);
  
  // Helper function to get the appropriate thread ID for sharing
  const getSharedThreadId = (newThreadId: string) => {
    if (newThreadId.startsWith("txagent_")) {
      setTxAgentThreadId(newThreadId);
      return newThreadId; // Use TxAgent thread as primary for shared state
    } else if (newThreadId.startsWith("thread_")) {
      setOpenAIThreadId(newThreadId);
      return txAgentThreadId || newThreadId; // Prefer TxAgent thread if exists
    }
    return newThreadId;
  };
  
  // Use our hook to load session data
  const { session, isLoading: isSessionLoading, isError: isSessionError } = useSession(sessionId);
  
  // Get shortage search results to automatically select first report
  const { shortages } = useDrugShortageSearch(drugName, sessionId);
  
  // Automatically select the first report when shortages are loaded
  useEffect(() => {
    if (shortages.length > 0 && !selectedReportId) {
      console.log("Auto-selecting first report:", shortages[0].id, shortages[0].type);
      setSelectedReportId(shortages[0].id);
      setSelectedReportType(shortages[0].type);
      
      // For new searches with results, always start with document tab
      if (activeTab !== "document") {
        setActiveTab("document");
        localStorage.setItem(SESSION_TAB_STORAGE_KEY, "document");
      }
    }
  }, [shortages, selectedReportId, activeTab]);
  
  // Get drug shortage report data for the selected report
  const { report: selectedReportData, isLoading: isReportLoading } = useDrugShortageReport(
    selectedReportId, 
    selectedReportType, 
    sessionId
  );
  
  // Initialize the Document AI Assistant with error handling - using TxAgent for initial generation
  const documentAssistant = useOpenAIAssistant({
    assistantType: "document",
    sessionId,
    drugShortageData: selectedReportData,
    documentContent,
    drugName, // Pass drug name to allow generation without API data
    // CRITICAL: Only auto-initialize and generate when we have sessionId AND drug name
    autoInitialize: !!sessionId && !!drugName && documentContent === "" && !docLoadAttempted,
    generateDocument: !!sessionId && !!drugName && documentContent === "" && !docLoadAttempted,
    modelType: "txagent", // Use TxAgent for initial document generation
    sharedThreadId: sharedThreadId, // Share thread with shortage assistant
    onThreadIdUpdate: (threadId) => {
      const newSharedThreadId = getSharedThreadId(threadId);
      if (!sharedThreadId) {
        console.log("Document assistant created shared thread:", newSharedThreadId);
        setSharedThreadId(newSharedThreadId);
      }
    },
    onDocumentUpdate: (content) => {
      console.log("SessionPage: onDocumentUpdate called by hook with content length:", content.length);
      // Always update the document content when the hook provides it - this takes priority over loaded content
      setDocumentContent(content);
      // Mark as generated if not already
      if (!isDocumentGenerated) {
        console.log("SessionPage: Setting isDocumentGenerated to true");
        setIsDocumentGenerated(true);
        setIsDocumentInitializing(false);
      }
      // Mark assistant as ready if not already
       if (!isDocumentAssistantReady) {
        console.log("SessionPage: Setting isDocumentAssistantReady to true");
        setIsDocumentAssistantReady(true);
       }
       // Save the updated document
        saveDocument(content);
       
       // Ensure we don't try to load old document content after this
       setDocLoadAttempted(true);
       
       // Force initial loading to false to ensure UI updates
       setIsInitialLoading(false);
       
       // CRITICAL: Clear any generation error since we successfully generated the document
       setDocGenerationError(false);
       
       console.log("SessionPage: All states updated after document generation");
    },
    onStateChange: (state) => {
      // Mark document assistant ready when initialized
      if (state.isInitialized && !isDocumentAssistantReady) {
        setIsDocumentAssistantReady(true);
      }
      
      // Update loading state properly - ONLY set loading if not already generated
      if (state.isLoading && !isDocumentGenerated && !isDocumentInitializing) {
        setIsDocumentInitializing(true);
      }
      
      // If document generation fails or takes too long
      if (!state.isLoading && !state.isInitialized && hasAttemptedDocInit.current) {
        console.log("Document assistant failed to initialize properly");
        setDocGenerationError(true);
        setIsDocumentAssistantReady(true); // Allow user to proceed anyway
        setIsDocumentInitializing(false); // Stop loading state
      }
    }
  });
  
  // Reference to track initialization attempts
  const hasAttemptedDocInit = useRef(false);
  
  // Set initialization attempt flag when conditions are right
  useEffect(() => {
    if (!!sessionId && !!drugName && !isDocumentGenerated && !docLoadAttempted && documentContent === "") {
      hasAttemptedDocInit.current = true;
    }
  }, [sessionId, drugName, isDocumentGenerated, docLoadAttempted, documentContent]);

  // Debug logging for document generation conditions
  useEffect(() => {
    console.log("Document generation debug:");
    console.log("- drugName:", drugName);
    console.log("- sessionId:", !!sessionId);
    console.log("- selectedReportData:", !!selectedReportData, selectedReportData?.brand_name);
    console.log("- documentContent length:", documentContent.length);
    console.log("- autoInitialize condition:", !!sessionId && !!drugName && documentContent === "" && !docLoadAttempted);
    console.log("- generateDocument condition:", !!sessionId && !!drugName && documentContent === "" && !docLoadAttempted);
    console.log("- should show loading screen:", (drugName && !isDocumentGenerated && documentContent === "" && !docGenerationError));
    console.log("- API dependency removed: Document will generate with drugName only");
  }, [sessionId, drugName, selectedReportData, documentContent, isDocumentGenerated, docGenerationError, docLoadAttempted]);

  // Initialize the Info AI Assistant to track when it's ready - but don't auto-generate reports
  // IMPORTANT: Use the same sessionId so both assistants can share the same thread
  const infoAssistant = useOpenAIAssistant({
    assistantType: "shortage",
    sessionId,
    drugShortageData: selectedReportData,
    allShortageData: [],
    autoInitialize: false, // Don't auto-initialize - only initialize when user asks questions
    sharedThreadId: sharedThreadId, // Share thread with document assistant
    onThreadIdUpdate: (threadId) => {
      const newSharedThreadId = getSharedThreadId(threadId);
      if (!sharedThreadId) {
        console.log("Shortage assistant created shared thread:", newSharedThreadId);
        setSharedThreadId(newSharedThreadId);
      }
    },
    onStateChange: (state) => {
      if (state.isInitialized) {
        setIsInfoAssistantReady(true);
      }
    }
  });

  // Mark info assistant as ready by default since it doesn't auto-generate
  useEffect(() => {
    if (!isInfoAssistantReady) {
      setIsInfoAssistantReady(true);
    }
  }, [isInfoAssistantReady]);
  
  // Load both document and chat conversations before allowing user interaction
  useEffect(() => {
    const preloadSession = async () => {
      if (!sessionId) return;
      
      try {
        console.log("Preloading session data and document...");
        
        // CRITICAL FIX: Check for existing data FIRST before setting any loading states
        // This prevents the loading screen flash for existing sessions
        const [existingDocResponse, existingConvResponse] = await Promise.all([
          supabase.rpc('get_session_document', { p_session_id: sessionId }),
          supabase.rpc('get_ai_conversation', { 
            p_session_id: sessionId, 
            p_assistant_type: "document" 
          })
        ]);
          
        const hasExistingDocument = existingDocResponse.data && 
                                   existingDocResponse.data.length > 0 && 
                                   existingDocResponse.data[0]?.content;
        console.log("Has existing document:", hasExistingDocument);
        
        const hasExistingConversation = existingConvResponse.data && 
                                        existingConvResponse.data.length > 0 && 
                                        existingConvResponse.data[0]?.messages;
        console.log("Has existing conversation:", hasExistingConversation);
        
        if (hasExistingDocument) {
          // For existing sessions with documents, immediately load and show content
          console.log("Existing session with document found, loading immediately");
          
          // Load the document content right away
          const docContent = existingDocResponse.data[0].content;
          setDocumentContent(docContent);
          setIsDocumentGenerated(true);
          setIsDocumentInitializing(false);
          setDocLoadAttempted(true);
          
          // Set ready states immediately
          setIsInitialLoading(false);
          setIsInfoAssistantReady(true);
          setIsDocumentAssistantReady(true);
          
          // Update session record
          await supabase
            .from('search_sessions')
            .update({ has_document: true })
            .eq('id', sessionId);
          console.log("Updated session record to indicate document exists");
          
        } else if (hasExistingConversation) {
          // Session exists but no document - prepare for potential generation
          console.log("Existing session without document, preparing for generation");
          setIsInitialLoading(true);
          await loadDocument(); // Try to load any document that might exist
        } else {
          // Completely new session - prepare for document generation
          console.log("New session or incomplete data, preparing for document generation");
          setIsInitialLoading(true);
          await loadDocument(); // Try to load any document that might exist
          
          // If no document was loaded and we have a drug name, generation will be triggered by useOpenAIAssistant
          if (!isDocumentGenerated && documentContent === "" && drugName) {
            console.log("No existing document found, will generate new one");
          }
        }
      } catch (err) {
        console.error("Error preloading session:", err);
        setIsInitialLoading(false);
      }
    };
    
    preloadSession();
  }, [sessionId]); // Remove drugName dependency to prevent re-runs

  // Check when assistants are ready - prioritize document generation (REMOVED API DEPENDENCY)
  useEffect(() => {
    console.log(`Assistant ready states - Info: ${isInfoAssistantReady}, Document: ${isDocumentAssistantReady}`);
    console.log(`Document states - Generated: ${isDocumentGenerated}, Initializing: ${isDocumentInitializing}, Content Length: ${documentContent.length}`);
    
    // Simple loading state: only show loading if we're explicitly in a loading state
    // The preloadSession effect handles setting loading states appropriately
  }, [isDocumentGenerated, docGenerationError, documentContent.length, drugName, docLoadAttempted, isDocumentInitializing]);
  
  // Effect to handle document initialization state has been removed
  // The polling system in use-openai-assistant.ts now handles timeouts properly
  
  
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
    localStorage.setItem(SESSION_TAB_STORAGE_KEY, value);
  };

  // Add a timeout to prevent getting stuck on loading screen
  useEffect(() => {
    // Force show the interface after 120 seconds even if assistants aren't ready
    const loadingTimeout = setTimeout(() => {
      if (isInitialLoading) {
        console.log("Loading timeout reached - forcing UI display");
        setIsInitialLoading(false);
        setIsInfoAssistantReady(true);
        setIsDocumentAssistantReady(true);
      }
    }, 120000); // 120 second timeout (2 minutes)
    
    return () => clearTimeout(loadingTimeout);
  }, [isInitialLoading]);

  // Show loading screen when document is being generated for the first time
  const shouldShowLoadingScreen = isInitialLoading || isLoading || isSessionLoading || 
      (drugName && !isDocumentGenerated && documentContent === "" && !docGenerationError && !docLoadAttempted);
  
  // Debug the loading screen condition
  console.log("Loading screen debug:");
  console.log("- isInitialLoading:", isInitialLoading);
  console.log("- isLoading:", isLoading);
  console.log("- isSessionLoading:", isSessionLoading);
  console.log("- drugName:", drugName);
  console.log("- isDocumentGenerated:", isDocumentGenerated);
  console.log("- documentContent length:", documentContent.length);
  console.log("- docGenerationError:", docGenerationError);
  console.log("- docLoadAttempted:", docLoadAttempted);
  console.log("- shouldShowLoadingScreen:", shouldShowLoadingScreen);
  
  if (shouldShowLoadingScreen) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] bg-gray-50">
        <div className="text-center p-8 rounded-lg shadow-md bg-white">
          <div className="w-24 h-24 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">Generating Document</h2>
          <p className="text-gray-500 mb-4">Advanced Clinical Model is creating a comprehensive shortage management plan for {formatDrugNameForDisplay(drugName || "this drug")}</p>
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-600">This may take 30-90 seconds as our specialized medical AI analyzes the data</p>
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
          <h1 className="text-2xl font-bold ml-2">{formatDrugNameForDisplay(drugName)} Shortage</h1>
        </div>
      </div>
      
      <Separator />
      
      <Tabs defaultValue={activeTab} value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="document" className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            Document Preparation
          </TabsTrigger>
          <TabsTrigger value="info" className="flex items-center">
            <MessageSquare className="h-4 w-4 mr-2" />
            Shortage Information
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
              assistant={{
                messages: infoAssistant.messages,
                isLoading: infoAssistant.isLoading,
                error: infoAssistant.error,
                sendMessage: infoAssistant.sendMessage,
                isInitialized: infoAssistant.isInitialized,
                addMessage: infoAssistant.addMessage,
                switchModel: infoAssistant.switchModel,
                currentModel: infoAssistant.currentModel
              }}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="document" className="flex-grow flex flex-col">
          {isDocumentInitializing && !isDocumentGenerated && !docGenerationError ? (
            <div className="flex-grow flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin"></div>
                </div>
                <p className="text-muted-foreground">TxAgent is generating your document...</p>
              </div>
            </div>
          ) : docGenerationError ? (
            <div className="flex-grow flex items-center justify-center">
              <div className="text-center text-red-500 space-y-2">
                <AlertTriangle className="mx-auto h-8 w-8" />
                <p>Document generation failed.</p>
                <p className="text-sm text-muted-foreground">You can still ask questions or try regenerating the session.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
              <div className="relative document-editor-container">
                <DocumentEditor
                  drugName={drugName}
                  sessionId={sessionId}
                  onContentChange={handleUpdateDocument}
                  initialContent={documentContent}
                />
              </div>
              <div className="flex flex-col">
                <ChatInterface
                  drugName={drugName}
                  sessionType="document"
                  sessionId={sessionId}
                  onSendToDocument={handleSendToDocument}
                  assistant={{
                    messages: documentAssistant.messages,
                    isLoading: documentAssistant.isLoading,
                    error: documentAssistant.error,
                    sendMessage: documentAssistant.sendMessage,
                    isInitialized: documentAssistant.isInitialized,
                    addMessage: documentAssistant.addMessage,
                    switchModel: documentAssistant.switchModel,
                    currentModel: documentAssistant.currentModel,
                  }}
                />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SessionPage;
