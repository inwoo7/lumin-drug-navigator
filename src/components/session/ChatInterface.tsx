import { useState, useRef, useEffect } from "react";
import { Button as IconButton } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, Loader2, FileEdit, AlertTriangle, Copy, Edit } from "lucide-react";
import { useOpenAIAssistant, Message as AIMessage, AssistantType } from "@/hooks/use-openai-assistant";
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
}

export function ChatInterface({
  drugName,
  sessionType,
  sessionId,
  reportId,
  reportType,
  documentContent,
  onSendToDocument,
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMessageSending, setIsMessageSending] = useState(false);
  const [documentEditMode, setDocumentEditMode] = useState(false);
  
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
  
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    isInitialized,
    addMessage
  } = useOpenAIAssistant({
    assistantType,
    sessionId,
    drugShortageData: report,
    allShortageData: shortages,
    documentContent,
    autoInitialize: true
  });
  
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
    // Scroll to bottom when messages change
    scrollToBottom();
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
    
    // Document editing - detect if user wants to edit the document
    const isEditRequest = sessionType === "document" && 
      (inputMessage.toLowerCase().includes("edit") || 
       inputMessage.toLowerCase().includes("update") || 
       inputMessage.toLowerCase().includes("change") ||
       inputMessage.toLowerCase().includes("modify") ||
       isEditMode);
       
    // If this looks like a document edit request, format it properly
    if (isEditRequest) {
      const editingPrompt = `Please edit the document with the following instructions: ${inputMessage}. 
Return ONLY the complete updated document content.`;
      
      const message = inputMessage;
      setInputMessage("");
      
      // Show loading state with specific edit message
      toast.loading("Editing document...", { id: "document-edit" });
      
      try {
        console.log("Sending document edit request");
        const updatedContent = await sendMessage(editingPrompt);
        
        if (updatedContent && onSendToDocument) {
          // Add the user's message to the chat
          addMessage("user", message);
          
          // Add a standardized response message
          addMessage("assistant", "I've updated the document according to your instructions. The changes have been applied to the document editor.");
          
          // Update the document content
          onSendToDocument(updatedContent);
          toast.success("Document updated successfully", { id: "document-edit" });
        } else {
          toast.error("Failed to update document", { id: "document-edit" });
        }
      } catch (error) {
        console.error("Error updating document:", error);
        toast.error("Failed to update document", { id: "document-edit" });
      } finally {
        setIsMessageSending(false);
        setIsEditMode(false);
      }
      
      return;
    }
    
    // Standard message handling for non-edit requests
    const message = inputMessage;
    setInputMessage("");
    try {
      console.log(`Sending standard message in ${sessionType} mode`);
      const response = await sendMessage(message);
      
      // For document-related responses in document mode, automatically update the document
      if (sessionType === "document" && 
          response && 
          onSendToDocument && 
          (response.startsWith("# ") || response.includes("## Executive Summary"))) {
        onSendToDocument(response);
        toast.success("Document updated with new content");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Error is already handled in the hook, with fallback messages added
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

  // Format chat message for display
  const formatChatMessage = (content: string) => {
    // First, detect if this contains any common prompt patterns
    const promptPatterns = [
      "Generate a comprehensive", 
      "Please edit the document",
      "Include the following information",
      "Background of the shortage",
      "Format your response",
      "You are analyzing drug shortage data",
      "therapeutic alternatives",
      "conservation strategies",
      "patient prioritization",
      "implementation plan",
      "Format the document in Markdown",
      "Return ONLY the complete updated",
      "This is the specific drug data",
      "Here is comprehensive data about all related shortages",
      "raw JSON format",
      "is the current document content",
      "As an AI assistant",
      "As an AI language model",
      "I'm analyzing the shortage data",
      "I'll analyze this",
      "You're reviewing",
      "You are a helpful assistant",
      "Based on the drug shortage data provided",
      "I need to generate",
      "The following is a comprehensive",
      "Format your response with clear headings",
      "format the information",
      "from the context",
      "prompt:",
      "system instruction",
      "AI assistant",
      "language model",
      "model:",
      "output:",
      "assistant:",
      "I am a"
    ];
    
    // Check for a system prompt
    const containsSystemPrompt = promptPatterns.some(pattern => 
      content.toLowerCase().includes(pattern.toLowerCase())
    );
    
    // Check for JSON data structures more comprehensively
    const containsRawJSON = 
      content.includes('{"id":') || 
      content.includes('"type":"shortage"') ||
      content.includes('"brand_name":') ||
      content.includes('"dosage_form":') ||
      content.includes('"report_id":') || 
      content.includes('"drug_name":') ||
      content.match(/\{(\s*"[^"]+"\s*:)/g) || // Match patterns like { "key":
      (content.includes('{') && content.includes('}') && 
       (content.includes('"') || content.includes("'")));
    
    // Check if this looks like a full document
    const isFullDocument = 
      (content.startsWith("#") && 
       (content.includes("# Drug Shortage Management Plan") || 
        content.includes("Executive Summary") || 
        content.includes("Product Details"))) ||
      (content.includes("## Executive Summary") || 
       content.includes("## Product Details") || 
       content.includes("## Shortage Impact Assessment"));
    
    // Special case: Don't show system prompts with raw data
    if (containsSystemPrompt && containsRawJSON) {
      if (sessionType === "info") {
        return "I'm analyzing the drug shortage data to provide you with comprehensive information. I'll be ready to answer your questions momentarily.";
      } else {
        return "I'm preparing document content based on the drug shortage data. This may take a moment...";
      }
    }
    
    // Special case: Full document in chat should be replaced with a message
    if (sessionType === "document" && isFullDocument) {
      return "I've updated the document according to your instructions. The changes have been applied to the document editor.";
    }
    
    // Special case: Document edit confirmation should be simplified
    if (content.includes("I've updated the document") && content.length > 300) {
      return "I've updated the document according to your instructions. The changes have been applied to the document editor.";
    }
    
    // Remove common AI prefixes like "As an AI assistant..." or "I'm analyzing..."
    if (content.match(/^(As an AI|I'm an AI|I am an AI|As a language model|I'm analyzing|I'll analyze|Let me analyze)/i)) {
      const cleanedContent = content.replace(/^(As an AI[^\.]+\.|I'm an AI[^\.]+\.|I am an AI[^\.]+\.|As a language model[^\.]+\.|I'm analyzing[^\.]+\.|I'll analyze[^\.]+\.|Let me analyze[^\.]+\.)\s*/i, '');
      if (cleanedContent !== content) {
        return cleanedContent;
      }
    }
    
    // If it's a system prompt, replace with a simple message
    if (containsSystemPrompt) {
      if (sessionType === "info") {
        return "I'm analyzing the drug shortage data to provide a comprehensive response...";
      } else {
        return "I'm processing your request for the document...";
      }
    }
    
    // If it still has JSON, try to extract meaningful text or replace it entirely
    if (containsRawJSON) {
      // Try to find any human-readable text outside of JSON
      const cleanedContent = content
        .replace(/\{[^{}]*\}/g, '') // Remove simple JSON objects
        .replace(/\{.*\}/gs, '')    // Remove multi-line JSON objects
        .trim();
        
      if (cleanedContent.length > 50) {
        return cleanedContent;
      } else {
        return "I'm processing the drug shortage data to prepare a response for you.";
      }
    }
    
    // Return the original content if no issues detected
    return content;
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="px-4 py-3 border-b">
        <div className="flex justify-between items-center">
          <CardTitle className="text-md">AI Assistant</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-lumin-teal text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <div className="prose prose-sm max-w-none">
                  {message.role === "assistant" ? (
                    <>
                      <ReactMarkdown>
                        {formatChatMessage(message.content)}
                      </ReactMarkdown>
                      
                      <div className="flex justify-end gap-1 mt-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                onClick={() => handleCopyMessage(message.content)}
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy to clipboard</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            </div>
          ))}
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
