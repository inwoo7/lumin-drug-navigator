import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, Loader2, FileEdit, AlertTriangle } from "lucide-react";
import { useOpenAIAssistant, Message as AIMessage, AssistantType } from "@/hooks/use-openai-assistant";
import { useDrugShortageReport, useDrugShortageSearch } from "@/hooks/use-drug-shortages";
import { toast } from "sonner";

interface ChatInterfaceProps {
  drugName: string;
  sessionType: "info" | "document";
  sessionId?: string;
  reportId?: string;
  reportType?: 'shortage' | 'discontinuation';
  documentContent?: string;
  onSendToDocument?: (text: string) => void;
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
  
  // Use our OpenAI assistant hook with auto-initialization
  const {
    messages,
    isLoading: isAILoading,
    sendMessage,
    addMessage,
    isInitialized
  } = useOpenAIAssistant({
    assistantType,
    sessionId,
    drugShortageData: report || { drug_name: drugName },
    allShortageData: shortages?.length > 0 ? shortages : undefined,
    documentContent,
    autoInitialize: !isReportLoading, // Only auto-initialize when report is loaded
    onDocumentUpdate: sessionType === "document" ? onSendToDocument : undefined,
    generateDocument: sessionType === "document", // Always attempt to generate document when in document mode
    rawApiData: true  // Ensure both LLMs get full raw API response
  });
  
  // Add initial assistant message when chat first loads if not initialized and no messages
  useEffect(() => {
    if (messages.length === 0 && !isReportLoading && !isAILoading && isInitialized) {
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
    
    // Special handling for document edit mode
    if (sessionType === "document" && isEditMode) {
      const editingPrompt = `Please edit the document with the following instructions: ${inputMessage}. 
Return ONLY the complete updated document content.`;
      
      addMessage("user", inputMessage);
      setInputMessage("");
      
      // Show loading state with specific edit message
      toast.loading("Editing document...", { id: "document-edit" });
      
      try {
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
      }
      
      setIsEditMode(false);
      return;
    }
    
    // Standard message handling
    const message = inputMessage;
    setInputMessage("");
    try {
      await sendMessage(message);
    } catch (error) {
      console.error("Error sending message:", error);
      // Error is already handled in the hook, with fallback messages added
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

  const isLoading = isAILoading || isReportLoading || isAllShortagesLoading;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="px-4 py-3 border-b">
        <div className="flex justify-between items-center">
          <CardTitle className="text-md">AI Assistant</CardTitle>
          {sessionType === "document" && (
            <Button 
              size="sm" 
              variant={isEditMode ? "default" : "outline"}
              onClick={toggleEditMode}
              className={isEditMode ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <FileEdit className="h-4 w-4 mr-2" />
              {isEditMode ? "Exit Edit Mode" : "Edit Document"}
            </Button>
          )}
        </div>
        {isEditMode && (
          <div className="mt-2 text-xs bg-blue-50 p-2 rounded-md border border-blue-200">
            <div className="flex items-start">
              <AlertTriangle className="h-4 w-4 text-blue-500 mr-1 mt-0.5" />
              <p className="text-blue-700">
                Edit mode is active. Your message will be used to directly update the document.
              </p>
            </div>
          </div>
        )}
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
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && sessionType === "document" && !isEditMode && (
                  <>
                    <Separator className="my-2" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleSendToDoc(message.content)}
                    >
                      Send to Document
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100">
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-sm">
                    {isReportLoading 
                      ? "Loading drug shortage data..." 
                      : isAllShortagesLoading
                        ? "Loading all shortage data..."
                        : isEditMode
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
            disabled={isLoading}
          />
          <Button
            className={`${isEditMode ? "bg-blue-600 hover:bg-blue-700" : "bg-lumin-teal hover:bg-lumin-teal/90"} h-10 px-4`}
            disabled={inputMessage.trim() === "" || isLoading}
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
