import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
    // Check if this message contains a system prompt or raw data
    const containsSystemPrompt = content.includes("Generate a comprehensive") || 
                                 content.includes("Please edit the document") ||
                                 content.includes("Include the following information") || 
                                 content.includes("Background of the shortage") ||
                                 content.includes("Format your response") ||
                                 content.includes("You are analyzing drug shortage data");
                                 
    const containsRawJSON = content.includes('{"id":') || 
                           content.includes('"type":"shortage"') ||
                           content.includes('"brand_name":') ||
                           content.includes('"dosage_form":') ||
                           content.includes('"report_id":') ||
                           content.includes('raw JSON format');
    
    // If this message contains both system prompts and raw data, completely hide it
    if (containsSystemPrompt && containsRawJSON) {
      return "I'm analyzing the drug shortage data to provide you with comprehensive information. I'll be ready to answer your questions momentarily.";
    }
    
    // Special handling for document edits - convert full document to a response message
    if (
      sessionType === "document" && 
      (
        // Check for markdown headers that indicate a document
        (content.startsWith("#") && 
         (content.includes("# Drug Shortage Management Plan") || 
          content.includes("Executive Summary") || 
          content.includes("Product Details"))) ||
        // Check for document structure with sections
        (content.includes("## Executive Summary") || 
         content.includes("## Product Details") || 
         content.includes("## Shortage Impact Assessment")) ||
        // Check for completed document edit message
        content.includes("I've updated the document according to your instructions")
      )
    ) {
      return "I've updated the document according to your instructions. The changes have been applied to the document editor.";
    }
    
    // Hide any system prompts, instructions or raw data completely
    if (content.includes("Generate a comprehensive") || 
        content.includes("Please edit the document") ||
        content.includes("Include the following") ||
        content.includes("Background of the shortage") ||
        content.includes("Return ONLY the complete updated") ||
        content.includes("Format your response with") ||
        content.includes("Format the document in Markdown") ||
        content.includes("You are analyzing drug shortage data") ||
        content.includes("raw JSON format") ||
        content.includes("Please provide a detailed analysis")) {
      return "I'm analyzing the drug shortage data to create a detailed response...";
    }
    
    // Filter out any JSON data sections completely
    if (content.includes('{"id":') || 
        content.includes('"type":"shortage"') || 
        content.includes('"report_id":') || 
        content.includes('"brand_name":')) {
      // Create a completely filtered version by removing JSON sections
      let filteredContent = "";
      
      // Only keep complete sentences that don't contain JSON
      const sentences = content.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (!sentence.includes('":') && 
            !sentence.includes('"id":') && 
            !sentence.includes('"type":') && 
            !sentence.includes('"report_id":') && 
            !sentence.includes("JSON") && 
            !sentence.includes("[{")) {
          filteredContent += sentence + " ";
        }
      }
      
      // Remove any code blocks
      filteredContent = filteredContent.replace(/```[\s\S]*?```/g, "");
      
      // If filtering removed everything or most of the content, provide a summary
      if (filteredContent.trim() === '' || 
          filteredContent.length < 100 || 
          filteredContent.length < content.length * 0.3) {
        return "I've analyzed the drug shortage data and I'm ready to help answer your questions about this medication shortage.";
      }
      
      return filteredContent.trim();
    }
    
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
                              <Button
                                onClick={() => handleCopyMessage(message.content)}
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
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
          <Button
            className={`${isEditMode ? "bg-blue-600 hover:bg-blue-700" : "bg-lumin-teal hover:bg-lumin-teal/90"} h-10 px-4`}
            disabled={inputMessage.trim() === "" || showLoadingIndicator}
            onClick={handleSendMessage}
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default ChatInterface;
