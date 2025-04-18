
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, Loader2 } from "lucide-react";
import { useOpenAIAssistant, Message as AIMessage, AssistantType } from "@/hooks/use-openai-assistant";
import { useDrugShortageReport, useDrugShortageSearch } from "@/hooks/use-drug-shortages";

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
    autoInitialize: true,
    onDocumentUpdate: sessionType === "document" ? onSendToDocument : undefined
  });
  
  // Add initial assistant message when chat first loads if not initialized
  useEffect(() => {
    if (messages.length === 0 && !isReportLoading && !isAILoading && !isInitialized) {
      const initialMessage = sessionType === "info"
        ? `Hello! I'm your AI assistant for drug shortage information. I can provide insights about ${drugName} shortages, alternative therapies, and conservation strategies. How can I help you today?`
        : `I'm here to help you create a document about the ${drugName} shortage. You can ask me to suggest content, format text, or provide clinical information. What would you like to include in your document?`;
      
      addMessage("assistant", initialMessage);
    }
  }, [drugName, sessionType, messages.length, report, isReportLoading, isAILoading, isInitialized, addMessage]);

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
      addMessage("assistant", "I'm still loading the drug shortage data. Please wait a moment before asking questions.");
      setInputMessage("");
      return;
    }
    
    // If we don't have a report ID, use a simpler prompt
    if (!report && !reportId) {
      // We'll still send the message since we have the drug name
      const message = inputMessage;
      setInputMessage("");
      // If this is a document assistant, try to update document with result
      await sendMessage(message);
      return;
    }
    
    const message = inputMessage;
    setInputMessage("");
    // Send message - document updates are handled automatically via onDocumentUpdate callback
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // This function is kept for backward compatibility but the automatic update is now preferred
  const handleSendToDoc = (content: string) => {
    if (onSendToDocument) {
      onSendToDocument(content);
    }
  };

  const isLoading = isAILoading || isReportLoading || isAllShortagesLoading;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="px-4 py-3 border-b">
        <CardTitle className="text-md">AI Assistant</CardTitle>
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
                {message.role === "assistant" && sessionType === "document" && (
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
            placeholder="Type your message..."
            className="min-h-[60px] resize-none"
            disabled={isLoading}
          />
          <Button
            className="bg-lumin-teal hover:bg-lumin-teal/90 h-10 px-4"
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
