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
                className={`max-w-[80%] rounded-lg px-4 py-2 shadow-sm break-words ${
                  message.role === "user"
                    ? "bg-lumin-teal text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {message.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                    <ReactMarkdown>
                      {message.content}
                    </ReactMarkdown>
                    <div className="flex justify-end gap-1 mt-1 opacity-70 hover:opacity-100 transition-opacity">
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
                  <div className="text-sm">
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
