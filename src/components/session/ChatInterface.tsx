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
import { Button as IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

interface ChatInterfaceProps {
  drugName: string;
  sessionType: "info" | "document";
  sessionId?: string;
  reportId?: string;
  reportType?: 'shortage' | 'discontinuation';
  documentContent?: string;
  onSendToDocument?: (content: string) => void;
}

const ChatInterface = ({ 
  drugName, 
  sessionType, 
  sessionId,
  reportId,
  reportType = 'shortage',
  documentContent,
  onSendToDocument 
}: ChatInterfaceProps) => {
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMessageSending, setIsMessageSending] = useState(false);
  
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
  const assistantType: AssistantType = sessionType === "info" ? "shortage" : "document";
  
  // Initialize the OpenAI Assistant
  const {
    messages,
    isLoading: isAILoading,
    sendMessage,
    isInitialized,
    addMessage,
    error
  } = useOpenAIAssistant({
    assistantType,
    sessionId,
    drugShortageData: report,
    allShortageData: shortages,
    documentContent,
    autoInitialize: true,
    onDocumentUpdate: sessionType === "document" ? onSendToDocument : undefined,
    generateDocument: sessionType === "document", // Always attempt to generate document when in document mode
    rawApiData: false // Only send raw data on first initialization, not when restoring sessions
  });
  
  // Add initial assistant message when chat first loads if not initialized and no messages
  useEffect(() => {
    // Only add a welcome message if there are no messages AND the assistant is initialized
    if (messages.length === 0 && !isReportLoading && !isAILoading && isInitialized) {
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
  }, [drugName, sessionType, messages.length, isInitialized, isReportLoading, isAILoading, addMessage]);

  useEffect(() => {
    // Scroll to bottom when messages change
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "" || isAILoading) return;
    
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
    
    // Standard message handling
    const message = inputMessage;
    setInputMessage("");
    try {
      console.log(`Sending standard message in ${sessionType} mode`);
      await sendMessage(message);
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
  const showLoadingIndicator = isMessageSending && isAILoading;

  // Function to copy message content to clipboard
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => toast.success("Message copied to clipboard"))
      .catch(() => toast.error("Failed to copy message"));
  };

  // Format chat message for display
  const formatChatMessage = (content: string) => {
    // Check if content contains JSON-like structures or API responses
    if (
      content.includes('{"data":') || 
      content.includes('"results":') || 
      content.includes('"shortage_id":') ||
      content.includes('"api":') ||
      content.includes('"discontinued":')
    ) {
      // Identify and remove JSON blocks from content
      let lines = content.split("\n");
      
      // Filter out JSON-like content
      const filteredLines = lines.filter(line => {
        return !(
          line.includes('{') && (
            line.includes('"data":') || 
            line.includes('"results":') || 
            line.includes('"shortage_id":') ||
            line.includes('"api":') ||
            line.includes('"discontinued":') ||
            line.includes('"id":') ||
            line.includes('"drug_name":')
          ) ||
          line.includes('```json') || 
          line.includes('```') ||
          line.match(/^\s*[\[\]\{\}]\s*$/) // Lines with just brackets
        );
      });
      
      // Join the filtered lines back into a single string
      const filteredContent = filteredLines.join("\n");
      
      // If filtering removed everything, provide a summary
      if (filteredContent.trim() === '') {
        return "I've analyzed the drug shortage data and I'm ready to help answer your questions.";
      }
      
      return filteredContent;
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
                {message.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-pre:bg-gray-100 prose-pre:p-2 prose-pre:rounded prose-pre:text-sm prose-code:text-gray-800 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                    <div className="markdown-content">
                      <ReactMarkdown>
                        {formatChatMessage(message.content)}
                      </ReactMarkdown>
                    </div>
                    
                    <div className="flex justify-end gap-1 mt-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => handleCopyMessage(message.content)}
                              size="sm"
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
                      
                      {sessionType === "document" && onSendToDocument && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                onClick={() => handleSendToDoc(message.content)}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                              >
                                <Edit className="h-3 w-3" />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Send to document</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    {message.content}
                  </div>
                )}
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
};

export default ChatInterface;
