
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, Loader2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  drugName: string;
  sessionType: "info" | "document";
  onSendToDocument?: (text: string) => void;
}

const ChatInterface = ({ drugName, sessionType, onSendToDocument }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add initial assistant message when chat first loads
    const initialMessage: Message = {
      id: "init",
      role: "assistant",
      content: sessionType === "info"
        ? `Hello! I'm your AI assistant for drug shortage information. I can provide insights about ${drugName} shortages, alternative therapies, and conservation strategies. How can I help you today?`
        : `I'm here to help you create a document about the ${drugName} shortage. You can ask me to suggest content, format text, or provide clinical information. What would you like to include in your document?`,
      timestamp: new Date(),
    };

    setMessages([initialMessage]);
  }, [drugName, sessionType]);

  useEffect(() => {
    // Scroll to bottom when messages change
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "" || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      // Here we would normally make an API call to an LLM service
      // For now, we'll simulate a response with a slight delay
      
      setTimeout(() => {
        const assistantResponse: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: getMockResponse(inputMessage, drugName, sessionType),
          timestamp: new Date(),
        };
        
        setMessages((prev) => [...prev, assistantResponse]);
        setIsLoading(false);
      }, 1500);
      
    } catch (error) {
      console.error("Error getting AI response:", error);
      setIsLoading(false);
    }
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
                  <p className="text-sm">Generating response...</p>
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

// Mock responses for demo
function getMockResponse(message: string, drugName: string, type: string): string {
  if (type === "info") {
    if (message.toLowerCase().includes("alternative")) {
      return `For ${drugName}, there are several alternatives you can consider:\n\n1. Drug Alternative A - similar mechanism of action but different class\n2. Drug Alternative B - same class, different molecule\n3. Therapeutic Alternative C - different approach but treats the same condition\n\nThe best choice depends on the patient's specific condition, comorbidities, and other medications.`;
    } else if (message.toLowerCase().includes("conserv") || message.toLowerCase().includes("strateg")) {
      return `Conservation strategies for ${drugName} during shortages:\n\n• Limit to priority patients (those with no alternatives)\n• Consider dose reduction where clinically appropriate\n• Extend dosing intervals when possible\n• Implement batch compounding to minimize waste\n• Restrict new starts except for essential cases`;
    } else if (message.toLowerCase().includes("duration") || message.toLowerCase().includes("long")) {
      return `Based on the information from Drug Shortages Canada, this ${drugName} shortage is expected to continue until approximately July 30, 2023. However, shortage timelines often change as manufacturers update their production schedules.`;
    } else {
      return `I understand you have a question about the ${drugName} shortage. Could you provide more specifics about what you'd like to know? I can help with:\n\n• Alternative medications\n• Conservation strategies\n• Clinical prioritization\n• Patient information resources\n• Supply management`;
    }
  } else {
    // Document mode responses
    if (message.toLowerCase().includes("introduction") || message.toLowerCase().includes("start")) {
      return `**Drug Shortage Notice: ${drugName}**\n\nDate: April 17, 2023\n\nRe: Ongoing shortage of ${drugName}\n\nDear Healthcare Team,\n\nThis memorandum is to inform you of the current shortage of ${drugName} affecting our institution. This shortage is expected to continue until July 30, 2023. The following document outlines our management strategy, therapeutic alternatives, and clinical prioritization guidelines.`;
    } else if (message.toLowerCase().includes("alternatives") || message.toLowerCase().includes("options")) {
      return `**Therapeutic Alternatives for ${drugName}**\n\n1. First-line alternatives:\n   • Alternative A (dosing: XX mg daily)\n   • Alternative B (dosing: XX mg twice daily)\n\n2. Second-line alternatives:\n   • Alternative C (Note: requires renal dosing adjustment)\n   • Alternative D (Note: contraindicated in hepatic impairment)\n\n3. Special populations considerations:\n   • Pediatric patients: [specific recommendations]\n   • Geriatric patients: [specific recommendations]\n   • Pregnancy: [specific recommendations]`;
    } else if (message.toLowerCase().includes("prioritization") || message.toLowerCase().includes("criteria")) {
      return `**Patient Prioritization Criteria**\n\n• Priority 1: Patients with life-threatening conditions where no alternatives exist\n• Priority 2: Patients currently stabilized on therapy where changing may cause clinical deterioration\n• Priority 3: New starts for serious conditions where alternatives are less effective\n• Priority 4: Patients with chronic, stable conditions where alternatives are available\n\nAll decisions should be made on a case-by-case basis with clinical judgment.`;
    } else if (message.toLowerCase().includes("conclusion") || message.toLowerCase().includes("end")) {
      return `**Conclusion and Contacts**\n\nThis shortage situation will be monitored continuously and updates will be provided as new information becomes available. The Pharmacy Department will reassess medication supplies daily.\n\nFor clinical questions: [Clinical Pharmacist Contact]\nFor supply questions: [Pharmacy Procurement Contact]\n\nWe appreciate your cooperation in managing this shortage.\n\nSincerely,\n\n[Pharmacy Director]\n[Chief Medical Officer]`;
    } else {
      return `I can help you draft content for your document about the ${drugName} shortage. Would you like me to provide:\n\n• An introduction section\n• Information about therapeutic alternatives\n• Patient prioritization criteria\n• Implementation strategies\n• A conclusion\n\nOr you can ask for specific content you'd like me to generate for your document.`;
    }
  }
}

export default ChatInterface;
