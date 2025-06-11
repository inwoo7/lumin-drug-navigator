import { useState, useRef, useEffect } from "react";
import { Button as IconButton } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, Loader2, FileEdit, AlertTriangle, Copy, Edit, RefreshCw } from "lucide-react";
import { useOpenAIAssistant, Message as AIMessage, AssistantType, ModelType } from "@/hooks/use-openai-assistant";
import { ModelSelector } from "./ModelSelector";
import { MessageBadge } from "./MessageBadge";
import { useDrugShortageReport, useDrugShortageSearch } from "@/hooks/use-drug-shortages";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import { Input } from "@/components/ui/input";

interface ChatInterfaceProps {
  drugName: string;
  sessionType: "info" | "document";
  sessionId?: string;
  reportId?: string;
  reportType?: 'shortage' | 'discontinuation';
  documentContent?: string;
  onSendToDocument?: (content: string) => void;
  // Optional: pass in existing assistant to share threads
  assistant?: {
    messages: AIMessage[];
    isLoading: boolean;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    isInitialized: boolean;
    addMessage: (role: "user" | "assistant", content: string) => void;
    switchModel: (model: ModelType) => Promise<void>;
    currentModel: ModelType;
  };
}

export function ChatInterface({
  drugName,
  sessionType,
  sessionId,
  reportId,
  reportType,
  documentContent,
  onSendToDocument,
  assistant,
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMessageSending, setIsMessageSending] = useState(false);
  const [documentEditMode, setDocumentEditMode] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelType>(sessionType === "document" ? "txagent" : "openai");
  
  // Get drug shortage report data
  const { report, isLoading: isReportLoading } = useDrugShortageReport(
    reportId, 
    reportType, 
    sessionId
  );
  
  // Get all drug shortage data for comprehensive analysis
  const { shortages, isLoading: isAllShortagesLoading } = useDrugShortageSearch(
    drugName,
    sessionId
  );
  
  // Map session type to assistant type
  const assistantType: AssistantType = sessionType === "document" ? "document" : "shortage";
  
  // Use passed assistant if available, otherwise create our own
  const ownAssistant = useOpenAIAssistant({
    assistantType,
    sessionId,
    drugShortageData: report,
    allShortageData: shortages,
    documentContent,
    autoInitialize: !assistant, // Only auto-initialize if we don't have a passed assistant
    modelType: currentModel,
    onModelSwitch: (newModel) => {
      setCurrentModel(newModel);
      toast.success(`Switched to ${newModel === 'txagent' ? 'TxAgent' : 'GPT-4o'}`);
    }
  });
  
  // Use either the passed assistant or our own
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    isInitialized,
    addMessage,
    switchModel,
    currentModel: hookCurrentModel
  } = assistant || ownAssistant;
  
  // Add initial assistant message when chat first loads if not initialized and no messages
  useEffect(() => {
    // Only add a welcome message if there are no messages AND the assistant is initialized
    if (messages.length === 0 && !isReportLoading && !isLoading && isInitialized) {
      console.log(`Adding welcome message for ${sessionType} assistant`);
      let initialMessage = "";
      
      if (sessionType === "info") {
        initialMessage = `Hello! I'm here to help with information about ${drugName} shortages. Ask me about therapeutic alternatives, conservation strategies, or any questions you have about this shortage.`;
      } else {
        initialMessage = `I'm here to help you with your ${drugName} shortage document. Ask me to explain any section or suggest changes to the content.`;
      }
      
      // Only add this intro message if we don't have any messages yet
      addMessage("assistant", initialMessage);
    }
  }, [drugName, sessionType, messages.length, isInitialized, isReportLoading, isLoading, addMessage]);

  useEffect(() => {
    // Scroll to bottom when messages change - REMOVED
    // scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "" || isLoading) return;
    
    // If we're waiting for the drug data, show a toast or message
    if (isReportLoading) {
      addMessage("user", inputMessage);
      addMessage("assistant", "I'm still loading the shortage data. Please wait a moment before asking questions.");
      setInputMessage("");
      return;
    }
    
    // Set the message sending flag to true
    setIsMessageSending(true);
    
    // Standard message handling
    const message = inputMessage;
    setInputMessage("");
    try {
      console.log(`Sending standard message in ${sessionType} mode: ${message}`);
      await sendMessage(message);
    } catch (error) {
      console.error("Error sending message from ChatInterface:", error);
    } finally {
      setIsMessageSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Direct document editing mode
  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
    if (!isEditMode) {
      addMessage("assistant", "I'm ready to edit the document. Please describe the changes you want to make, and I'll update the document directly.");
    } else {
      addMessage("assistant", "I've exited document editing mode. You can continue asking questions about the shortage.");
    }
  };

  // This function is kept for backward compatibility but the automatic update is now preferred
  const handleSendToDoc = (content: string) => {
    if (onSendToDocument) {
      onSendToDocument(content);
      toast.success("Document updated");
    }
  };

  // Only show loading indicators when actively sending a message
  const showLoadingIndicator = isMessageSending && isLoading;

  // Function to copy message content to clipboard
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => toast.success("Message copied to clipboard"))
      .catch(() => toast.error("Failed to copy message"));
  };

  // Utility function to check if text looks like a document/markdown content
  const isDocumentContent = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    // Look for multiple markdown headers, typical document length, or structured content
    const headerCount = (text.match(/^#{1,6}\s/gm) || []).length;
    const hasStructure = text.includes('##') || text.includes('**') || text.includes('###');
    const isLongForm = text.length > 300;
    
    console.log(`Document content check: headers=${headerCount}, hasStructure=${hasStructure}, length=${text.length}, isLongForm=${isLongForm}`);
    
    return headerCount > 1 || (hasStructure && isLongForm) || text.length > 1000;
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="px-4 py-3 border-b">
        <div className="flex justify-between items-center">
          <CardTitle className="text-md">AI Assistant</CardTitle>
          <ModelSelector 
            currentModel={hookCurrentModel || currentModel}
            onModelChange={switchModel}
            disabled={isLoading || isMessageSending}
            showLabels={false}
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((message) => {
            // Determine if this message confirms an update requiring refresh
            const isUpdateConfirmation = 
              message.role === 'assistant' && 
              message.content.includes("Please refresh to view changes.");
              
            // Return the JSX structure for each message
            return (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 shadow-sm break-words ${
                  message.role === "user"
                    ? "bg-lumin-teal text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                      <div className="flex items-start gap-2 mb-2">
                        <MessageBadge modelType={message.model || hookCurrentModel || currentModel} />
                      </div>
                      <ReactMarkdown>
                        {message.content}
                      </ReactMarkdown>
                      {/* Action buttons for assistant messages */}
                      <div className="flex justify-end items-center gap-1 mt-1 opacity-70 hover:opacity-100 transition-opacity">
                        {/* Apply to Document Button (Document mode only) */}
                        {sessionType === "document" && isDocumentContent(message.content) && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  onClick={() => handleSendToDoc(message.content)}
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 p-1 text-green-600 hover:text-green-800"
                                >
                                  <FileEdit className="h-3 w-3" />
                                </IconButton>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Apply to Document</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {/* Refresh Button (Conditional) */}
                        {isUpdateConfirmation && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  onClick={() => window.location.reload()}
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 p-1 text-blue-600 hover:text-blue-800"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </IconButton>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Refresh Page</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {/* Copy Button */}
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                onClick={() => handleCopyMessage(message.content)}
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 p-1 text-gray-500 hover:text-gray-700"
                              >
                                <Copy className="h-3 w-3" />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Copy message</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  ) : (
                    /* Render user message content directly */
                    <div className="text-sm">
                      {message.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {showLoadingIndicator && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100">
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-sm">
                    {isEditMode
                      ? "Updating document..."
                      : "Generating response..."}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-2 border-t">
        <div className="flex w-full items-end gap-2">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEditMode ? "Describe your document changes here..." : "Type your message..."}
            className={`min-h-[60px] resize-none ${isEditMode ? "border-blue-300 focus-visible:ring-blue-400" : ""}`}
            disabled={showLoadingIndicator}
          />
          <IconButton
            className={`${isEditMode ? "bg-blue-600 hover:bg-blue-700" : "bg-lumin-teal hover:bg-lumin-teal/90"} h-10 px-4`}
            disabled={inputMessage.trim() === "" || showLoadingIndicator}
            onClick={handleSendMessage}
          >
            <SendIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </CardFooter>
    </Card>
  );
}

export default ChatInterface;
