
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, Loader2 } from "lucide-react";
import { useOpenAIAssistant, Message as AIMessage, AssistantType } from "@/hooks/use-openai-assistant";
import { useDrugShortageReport } from "@/hooks/use-drug-shortages";

interface ChatInterfaceProps {
  drugName: string;
  sessionType: "info" | "document";
  sessionId?: string;
  reportId?: string;
  reportType?: 'shortage' | 'discontinuation';
  onSendToDocument?: (text: string) => void;
}

const ChatInterface = ({ 
  drugName, 
  sessionType, 
  sessionId,
  reportId,
  reportType = 'shortage',
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
  
  // Map session type to assistant type
  const assistantType: AssistantType = sessionType === "info" ? "shortage" : "document";
  
  // Use our OpenAI assistant hook
  const {
    messages,
    isLoading: isAILoading,
    sendMessage,
    addMessage
  } = useOpenAIAssistant({
    assistantType,
    sessionId,
    drugShortageData: report || { drug_name: drugName }
  });
  
  // Add initial assistant message when chat first loads
  useEffect(() => {
    if (messages.length === 0 && !isReportLoading && report) {
      const initialMessage = sessionType === "info"
        ? `Hello! I'm your AI assistant for drug shortage information. I can provide insights about ${drugName} shortages, alternative therapies, and conservation strategies. How can I help you today?`
        : `I'm here to help you create a document about the ${drugName} shortage. You can ask me to suggest content, format text, or provide clinical information. What would you like to include in your document?`;
      
      addMessage("assistant", initialMessage);
    }
  }, [drugName, sessionType, messages.length, report, isReportLoading]);

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
      addMessage("user", inputMessage);
      addMessage("assistant", "I don't have specific shortage data for this drug yet. Try selecting a shortage report first, or ask a general question about drug shortages.");
      setInputMessage("");
      return;
    }
    
    const message = inputMessage;
    setInputMessage("");
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendToDoc = (content: string) => {
    if (onSendToDocument) {
      onSendToDocument(content);
    }
  };

  const isLoading = isAILoading || isReportLoading;

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
